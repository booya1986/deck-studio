import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import sharp from "sharp";
import type { SourceBlock } from "@/lib/schema/common";
import type { BrandCandidates } from "@/lib/schema/candidates";
import { rankLogos, type ImageCandidate } from "./logo-score";
import { cleanText, fixRtlLeadingNumber, looksLikeHeading, makeBlock, scriptOf } from "./text-common";

const exec = promisify(execFile);

/** Poppler CLI tools; each is optional and degrades gracefully. */
async function poppler(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec(cmd, args, { maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
}

type TextItem = { str: string; size: number; x: number; y: number; page: number; rtl: boolean };

async function loadPdf(buf: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Node has no web worker: point at the bundled worker module so pdf.js uses its fake worker.
  pdfjs.GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
  });
  return { pdfjs, doc: await task.promise };
}

export async function extractPdf(args: {
  buf: Buffer;
  filename: string;
  outDir: string;
  /** absolute path of the source file, needed by the poppler CLIs */
  sourcePath: string;
  maxRenderPages?: number;
}): Promise<{ blocks: SourceBlock[]; candidates: BrandCandidates }> {
  const { pdfjs, doc } = await loadPdf(args.buf);
  const OPS = pdfjs.OPS;

  const items: TextItem[] = [];
  const colors = new Map<string, number>();
  const fontsFromText = new Map<string, number>();

  const addColor = (hex: string, w: number) => colors.set(hex, (colors.get(hex) ?? 0) + w);

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);

    // Operator list first: it resolves the font objects that name the real typefaces.
    let ops: Awaited<ReturnType<typeof page.getOperatorList>> | null = null;
    try {
      ops = await page.getOperatorList();
    } catch {
      // damaged page: text extraction still stands
    }

    const content = await page.getTextContent();
    const familyOf = fontResolver(page, content);

    for (const item of content.items as any[]) {
      const str: string = item.str ?? "";
      if (!str) continue;
      // Whitespace-only items are kept: they carry the word gaps of the line.
      const size = Math.abs(item.transform?.[3] ?? item.height ?? 0);
      items.push({
        str,
        size,
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
        page: p,
        rtl: item.dir === "rtl",
      });
      const family = str.trim() ? familyOf(item.fontName) : null;
      if (family) {
        const weight = str.trim().length * (scriptOf(str) === "hebrew" ? 2 : 1);
        fontsFromText.set(family, (fontsFromText.get(family) ?? 0) + weight);
      }
    }

    if (ops) {
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i] as unknown[] | undefined;
        const isFill = fn === OPS.setFillRGBColor || fn === OPS.setFillCMYKColor || fn === OPS.setFillColorN || fn === OPS.setFillColor;
        const isStroke = fn === OPS.setStrokeRGBColor || fn === OPS.setStrokeCMYKColor || fn === OPS.setStrokeColorN || fn === OPS.setStrokeColor;
        if (!isFill && !isStroke) continue;
        const hex = colorFromArgs(fn, args, OPS);
        if (hex) addColor(hex, isFill ? 3 : 1);
      }
    }
    page.cleanup();
  }

  const blocks = itemsToBlocks(items);

  const pages = await renderPages(args.sourcePath, args.outDir, doc.numPages, args.maxRenderPages ?? 6);
  for (const [hex, weight] of await pixelColors(args.outDir, pages)) addColor(hex, weight);

  const images = await extractPdfImages(args.sourcePath, args.outDir);
  const embeddedFonts = await listEmbeddedFonts(args.sourcePath);

  const fontMap = new Map<string, { family: string; count: number; embedded: boolean }>();
  for (const [family, count] of fontsFromText) {
    fontMap.set(family, { family, count, embedded: embeddedFonts.has(family) });
  }
  for (const family of embeddedFonts) {
    if (!fontMap.has(family)) fontMap.set(family, { family, count: 1, embedded: true });
  }

  const ranked = rankLogos(images);
  const candidates: BrandCandidates = {
    kind: "pdf",
    pages,
    theme: undefined,
    colors: [...colors.entries()]
      .filter(([hex]) => !isNearNeutral(hex))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([hex, count]) => ({
        hex,
        count: Math.round(count),
        sources: ["pdf_op" as const],
      })),
    fonts: [...fontMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
      .map((f) => ({
        family: f.family,
        count: Math.round(f.count),
        script: hebrewFontName(f.family) ? "hebrew" : scriptOf(f.family),
        embedded: f.embedded,
      })),
    images: ranked.map((i) => ({
      path: i.path, w: i.w, h: i.h, page: i.page, inHeader: i.inHeader,
      onMaster: i.onMaster, logoScore: i.logoScore, format: i.format, convertible: i.convertible,
    })),
    text: { headings: [] },
  };
  return { blocks, candidates };
}

const HEBREW_FONTS = /narkisim|david|frank|miriam|gisha|guttman|almoni|fbreforma|heebo|assistant|rubik|alef|hadasa|arimo|secular|varela|hebrew/i;
function hebrewFontName(f: string) {
  return HEBREW_FONTS.test(f);
}

/** `ABCDEF+Heebo-Regular_Bold` → `Heebo`. */
function normaliseFontName(raw: string | undefined): string | null {
  if (!raw) return null;
  let f = raw.replace(/^[A-Z]{6}\+/, "").replace(/^"|"$/g, "").trim();
  f = f.split(",")[0].trim();
  const SUFFIX = /[-_ ](Regular|Bold|Italic|Oblique|Light|Medium|SemiBold|DemiBold|ExtraBold|Black|Thin|Roman|Book|MT|PS|Std|Pro)\b/i;
  while (SUFFIX.test(f)) f = f.replace(SUFFIX, "");
  f = f.replace(/[-_ ]+$/, "").trim();
  if (!f || /^(g_d\d|f\d+|t\d+)$/i.test(f) || isGenericFamily(f)) return null;
  return f;
}

/**
 * pdf.js hands colour operators either a ready-made "#rrggbb" string or raw
 * component numbers, depending on the colour space. Handle both.
 */
function colorFromArgs(fn: number, args: unknown[] | undefined, OPS: Record<string, number>): string | null {
  if (!args || args.length === 0) return null;
  const first = args[0];
  if (typeof first === "string") return /^#[0-9a-fA-F]{6}$/.test(first) ? first.toLowerCase() : null;
  const nums = args.filter((a): a is number => typeof a === "number");
  if (fn === OPS.setFillCMYKColor || fn === OPS.setStrokeCMYKColor) {
    return nums.length >= 4 ? cmykHex(nums[0], nums[1], nums[2], nums[3]) : null;
  }
  if (nums.length >= 3) return rgbHex(nums[0], nums[1], nums[2]);
  if (nums.length === 1) return rgbHex(nums[0], nums[0], nums[0]);
  return null;
}

/**
 * `content.styles` reports a generic family ("sans-serif") for embedded fonts.
 * The real base name lives on the resolved font object in `commonObjs`.
 */
function fontResolver(page: any, content: any): (fontName: string | undefined) => string | null {
  const cache = new Map<string, string | null>();
  return (fontName) => {
    if (!fontName) return null;
    if (cache.has(fontName)) return cache.get(fontName)!;
    let family: string | null = null;
    try {
      const obj = page.commonObjs.get(fontName);
      family = normaliseFontName(obj?.name ?? obj?.loadedName);
    } catch {
      family = null;
    }
    if (!family) {
      const generic = content.styles?.[fontName]?.fontFamily;
      family = isGenericFamily(generic) ? null : normaliseFontName(generic);
    }
    cache.set(fontName, family);
    return family;
  };
}

const GENERIC_FAMILIES = new Set(["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui"]);
function isGenericFamily(f: string | undefined): boolean {
  return !!f && GENERIC_FAMILIES.has(f.toLowerCase().trim());
}

function rgbHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v <= 1 ? v * 255 : v)));
  return `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function cmykHex(c: number, m: number, y: number, k: number): string {
  return rgbHex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));
}

/**
 * Greys, near-white and near-black carry no brand signal.
 * Chroma is measured in absolute channel spread, not relative saturation: a
 * dark ink like #1b1f24 has a tiny spread but a high relative saturation, and
 * it is still just ink.
 */
export function isNearNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return spread < 28 || lum > 0.95 || lum < 0.1;
}

/** One visual line of text, already ordered logically. */
type Line = { page: number; y: number; size: number; text: string };

/** PDF text items arrive in visual order; an RTL line reads right-to-left by x. */
function itemsToLines(items: TextItem[]): Line[] {
  const byPage = new Map<number, TextItem[]>();
  for (const it of items) {
    const list = byPage.get(it.page) ?? [];
    list.push(it);
    byPage.set(it.page, list);
  }

  const lines: Line[] = [];
  for (const [page, list] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const groups: TextItem[][] = [];
    for (const it of [...list].sort((a, b) => b.y - a.y)) {
      const last = groups[groups.length - 1];
      const tol = Math.max(2, (last?.[0]?.size ?? it.size) * 0.5);
      if (last && Math.abs(last[0].y - it.y) <= tol) last.push(it);
      else groups.push([it]);
    }
    for (const g of groups) {
      const words = g.filter((i) => i.str.trim());
      const rtl = words.filter((i) => i.rtl).length >= words.filter((i) => !i.rtl).length;
      const ordered = [...g].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
      const text = cleanText(ordered.map((i) => i.str).join(""));
      if (!text) continue;
      const sized = g.filter((i) => i.str.trim());
      const size = Math.max(...(sized.length ? sized : g).map((i) => i.size));
      lines.push({ page, y: g[0].y, size, text });
    }
  }
  return lines;
}

/** Merge lines into blocks, classifying by font size relative to the body size. */
function itemsToBlocks(items: TextItem[]): SourceBlock[] {
  const lines = itemsToLines(items);
  if (!lines.length) return [];

  const sizes = lines.map((l) => l.size).filter((s) => s > 0).sort((a, b) => a - b);
  const bodySize = sizes[Math.floor(sizes.length / 2)] || 10;

  const blocks: SourceBlock[] = [];
  let seq = 0;
  let paragraph = 0;
  let cur: { page: number; size: number; parts: string[]; y: number } | null = null;

  const flush = () => {
    if (!cur) return;
    const text = cleanText(cur.parts.join(" "));
    if (text) {
      const ratio = cur.size / bodySize;
      const kind: SourceBlock["kind"] =
        ratio >= 1.7 ? "title" : ratio >= 1.15 && looksLikeHeading(text) ? "heading" : "paragraph";
      const level = kind === "title" ? 1 : kind === "heading" ? (ratio >= 1.35 ? 2 : 3) : undefined;
      const finalText = kind === "paragraph" ? text : fixRtlLeadingNumber(text);
      blocks.push(makeBlock(++seq, { kind, level, text: finalText, page: cur.page, paragraph: ++paragraph, fontSize: cur.size }));
    }
    cur = null;
  };

  for (const line of lines) {
    const sameBlock =
      cur !== null &&
      line.page === cur.page &&
      Math.abs(line.size - cur.size) < 0.7 &&
      cur.y - line.y < line.size * 2.4 &&
      line.size <= bodySize * 1.12;
    if (sameBlock && cur) {
      cur.parts.push(line.text);
      cur.y = line.y;
    } else {
      flush();
      cur = { page: line.page, size: line.size, parts: [line.text], y: line.y };
    }
  }
  flush();
  return blocks;
}

async function renderPages(src: string, outDir: string, numPages: number, maxPages: number): Promise<string[]> {
  const dir = path.join(outDir, "pages");
  await fs.mkdir(dir, { recursive: true });
  const last = Math.min(numPages, maxPages);
  const ok = await poppler("pdftoppm", ["-png", "-r", "72", "-f", "1", "-l", String(last), src, path.join(dir, "page")]);
  if (ok === null) return [];
  // Also render the final page when the document is longer than the window.
  if (numPages > last) {
    await poppler("pdftoppm", ["-png", "-r", "72", "-f", String(numPages), "-l", String(numPages), src, path.join(dir, "page")]);
  }
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".png")).sort();
  return files.map((f) => path.join("pages", f));
}

/** Dominant non-neutral colours across rendered pages, as a weak cross-check. */
async function pixelColors(outDir: string, pages: string[]): Promise<[string, number][]> {
  const buckets = new Map<string, Map<string, number>>();
  for (const rel of pages.slice(0, 3)) {
    try {
      const { data, info } = await sharp(path.join(outDir, rel))
        .resize({ width: 160, fit: "inside" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += info.channels) {
        const hex = rgbHex(data[i], data[i + 1], data[i + 2]);
        if (isNearNeutral(hex)) continue;
        const q = quantise(hex);
        const inner = buckets.get(q) ?? new Map<string, number>();
        inner.set(hex, (inner.get(hex) ?? 0) + 1);
        buckets.set(q, inner);
      }
    } catch {
      // page render missing or unreadable
    }
  }
  // Report the exact colour that dominates each cluster, not the quantised key.
  return [...buckets.entries()]
    .map(([, inner]) => {
      const [hex, n] = [...inner.entries()].sort((a, b) => b[1] - a[1])[0];
      const total = [...inner.values()].reduce((a, b) => a + b, 0);
      return [hex, total] as [string, number];
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([hex, n]) => [hex, Math.min(30, n / 60)] as [string, number]);
}

/** Snap to a 16-level grid so near-identical pixels collapse into one bucket. */
function quantise(hex: string): string {
  const step = (v: number) => Math.round(v / 17) * 17;
  const r = step(parseInt(hex.slice(1, 3), 16));
  const g = step(parseInt(hex.slice(3, 5), 16));
  const b = step(parseInt(hex.slice(5, 7), 16));
  return rgbHex(r, g, b);
}

async function listEmbeddedFonts(src: string): Promise<Set<string>> {
  const out = new Set<string>();
  const stdout = await poppler("pdffonts", [src]);
  if (!stdout) return out;
  for (const line of stdout.split("\n").slice(2)) {
    const name = line.trim().split(/\s{2,}/)[0];
    const f = normaliseFontName(name);
    if (f) out.add(f);
  }
  return out;
}

async function extractPdfImages(src: string, outDir: string): Promise<ImageCandidate[]> {
  const dir = path.join(outDir, "media");
  await fs.mkdir(dir, { recursive: true });
  const listed = await poppler("pdfimages", ["-list", src]);
  if (listed === null) return [];
  const ok = await poppler("pdfimages", ["-png", "-p", src, path.join(dir, "img")]);
  if (ok === null) return [];

  const files = (await fs.readdir(dir)).filter((f) => /^img-\d+-\d+\.png$/.test(f)).sort();
  const out: ImageCandidate[] = [];
  for (const f of files) {
    const page = Number(f.match(/^img-(\d+)-/)?.[1] ?? 0) || undefined;
    const abs = path.join(dir, f);
    let w = 0;
    let h = 0;
    try {
      const meta = await sharp(abs).metadata();
      w = meta.width ?? 0;
      h = meta.height ?? 0;
    } catch {
      continue;
    }
    // Soft masks come out as separate greyscale images; skip the obvious ones.
    if (w < 24 || h < 24) continue;
    out.push({
      path: path.join("media", f), w, h, page,
      inHeader: page === 1 && h < w, onMaster: false,
      format: "png", convertible: true, occurrences: 1,
    });
  }
  return dedupeByDimensions(out);
}

/** pdfimages emits an image and its alpha mask at identical size; keep the colour one. */
function dedupeByDimensions(images: ImageCandidate[]): ImageCandidate[] {
  const seen = new Set<string>();
  const out: ImageCandidate[] = [];
  for (const img of images) {
    const key = `${img.page}:${img.w}x${img.h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(img);
  }
  return out;
}
