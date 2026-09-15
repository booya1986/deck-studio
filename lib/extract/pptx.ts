import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { SourceBlock } from "@/lib/schema/common";
import type { BrandCandidates } from "@/lib/schema/candidates";
import { arr, attr, normHex, openZip, readRels, readTheme, readXml, resolveTarget, walk, type Xml } from "./ooxml";
import { formatOf, rankLogos, UNCONVERTIBLE, type ImageCandidate } from "./logo-score";
import { cleanText, makeBlock, scriptOf } from "./text-common";

const slideNo = (name: string) => Number(name.match(/slide(\d+)\.xml$/)?.[1] ?? 0);

/** All `a:t` text under a shape tree, grouped per paragraph. */
function paragraphsOf(node: Xml | undefined): { text: string; size?: number }[] {
  if (!node) return [];
  const out: { text: string; size?: number }[] = [];
  for (const n of walk(node)) {
    if (!("a:r" in n) && !("a:fld" in n)) continue;
    const runs = [...arr<Xml>(n["a:r"]), ...arr<Xml>(n["a:fld"])];
    if (!runs.length) continue;
    let text = "";
    let size: number | undefined;
    for (const r of runs) {
      const t = r["a:t"];
      text += typeof t === "string" ? t : (t?.["#text"] ?? "");
      const sz = attr(r["a:rPr"], "sz");
      if (sz) size = Math.max(size ?? 0, Number(sz) / 100);
    }
    const clean = cleanText(text);
    if (clean) out.push({ text: clean, size });
  }
  return out;
}

export async function extractPptx(args: {
  buf: Buffer;
  filename: string;
  outDir: string;
}): Promise<{ blocks: SourceBlock[]; candidates: BrandCandidates }> {
  const zip = await openZip(args.buf);
  const theme = await readTheme(zip, "ppt/theme/theme1.xml");

  const colors = new Map<string, { hex: string; weight: number; source: "theme" | "shape" | "fill" }>();
  const fonts = new Map<string, { family: string; weight: number }>();
  const addColor = (hex: string | null, w: number, source: "theme" | "shape" | "fill") => {
    if (!hex) return;
    const cur = colors.get(hex) ?? { hex, weight: 0, source };
    cur.weight += w;
    colors.set(hex, cur);
  };
  const addFont = (family: string | undefined, w: number) => {
    if (!family) return;
    const cur = fonts.get(family) ?? { family, weight: 0 };
    cur.weight += w;
    fonts.set(family, cur);
  };

  for (const [name, hex] of Object.entries(theme?.colors ?? {})) {
    if (name === "lt1" || name === "dk1") continue;
    addColor(hex, 60, "theme");
  }
  if (theme?.majorFont) addFont(theme.majorFont.family, 250);
  if (theme?.minorFont) addFont(theme.minorFont.family, 250);

  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b));

  const blocks: SourceBlock[] = [];
  let seq = 0;

  for (const name of slideNames) {
    const n = slideNo(name);
    const xml = await readXml(zip, name);
    const root = xml?.["p:sld"]?.["p:cSld"]?.["p:spTree"];
    const paras = paragraphsOf(root);
    const maxSize = Math.max(0, ...paras.map((p) => p.size ?? 0));
    paras.forEach((p, i) => {
      const isTitle = i === 0 || (p.size !== undefined && p.size === maxSize && maxSize > 0);
      blocks.push(
        makeBlock(++seq, {
          kind: isTitle && i === 0 ? "heading" : "paragraph",
          level: isTitle && i === 0 ? 2 : undefined,
          text: p.text,
          slide: n,
          fontSize: p.size,
        }),
      );
    });
    for (const node of walk(root)) {
      const hex = normHex(attr(node["a:srgbClr"], "val"));
      if (hex) addColor(hex, 3, "shape");
    }
    for (const node of walk(root)) {
      addFont(attr(node["a:latin"], "typeface"), 2);
      const hebr = arr<Xml>(node["a:font"]).find((f) => attr(f, "script") === "Hebr");
      addFont(attr(hebr, "typeface"), 6);
    }
  }

  const images = await extractPptxImages(zip, args.outDir);
  const ranked = rankLogos(images);

  const candidates: BrandCandidates = {
    kind: "pptx",
    pages: [],
    thumbnail: await copyThumbnail(zip, args.outDir),
    theme: theme ? { colors: theme.colors, majorFont: theme.majorFont, minorFont: theme.minorFont } : undefined,
    colors: [...colors.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 24)
      .map((c) => ({ hex: c.hex, count: Math.round(c.weight), sources: [c.source] })),
    fonts: [...fonts.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 12)
      .map((f) => ({ family: f.family, count: Math.round(f.weight), script: scriptOf(f.family), embedded: false })),
    images: ranked.map((i) => ({
      path: i.path, w: i.w, h: i.h, page: i.page, inHeader: i.inHeader,
      onMaster: i.onMaster, logoScore: i.logoScore, format: i.format, convertible: i.convertible,
    })),
    text: { headings: [] },
  };
  return { blocks, candidates };
}

async function copyThumbnail(zip: Awaited<ReturnType<typeof openZip>>, outDir: string) {
  const entry = Object.keys(zip.files).find((n) => /^docProps\/thumbnail\.(jpe?g|png)$/i.test(n));
  if (!entry) return undefined;
  const rel = path.join("media", `thumbnail.${formatOf(entry)}`);
  await fs.mkdir(path.join(outDir, "media"), { recursive: true });
  await fs.writeFile(path.join(outDir, rel), await zip.file(entry)!.async("nodebuffer"));
  return rel;
}

async function extractPptxImages(
  zip: Awaited<ReturnType<typeof openZip>>,
  outDir: string,
): Promise<ImageCandidate[]> {
  const masterTargets = new Set<string>();
  const slideUse = new Map<string, Set<number>>();

  for (const name of Object.keys(zip.files)) {
    if (/^ppt\/(slideMasters|slideLayouts)\/[^/]+\.xml$/.test(name)) {
      for (const t of (await readRels(zip, name)).values()) masterTargets.add(resolveTarget(name, t));
    } else if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) {
      const n = slideNo(name);
      for (const t of (await readRels(zip, name)).values()) {
        const target = resolveTarget(name, t);
        if (!/^ppt\/media\//.test(target)) continue;
        const set = slideUse.get(target) ?? new Set<number>();
        set.add(n);
        slideUse.set(target, set);
      }
    }
  }

  await fs.mkdir(path.join(outDir, "media"), { recursive: true });
  const out: ImageCandidate[] = [];
  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/media\//.test(name) || zip.files[name].dir) continue;
    const fmt = formatOf(name);
    const convertible = !UNCONVERTIBLE.has(fmt);
    const rel = path.join("media", path.basename(name));
    const buf = await zip.file(name)!.async("nodebuffer");
    await fs.writeFile(path.join(outDir, rel), buf);
    let w = 0;
    let h = 0;
    if (convertible) {
      try {
        const meta = await sharp(buf).metadata();
        w = meta.width ?? 0;
        h = meta.height ?? 0;
      } catch {
        // unreadable image
      }
    }
    const used = slideUse.get(name);
    out.push({
      path: rel, w, h, page: used ? Math.min(...used) : undefined,
      inHeader: false, onMaster: masterTargets.has(name),
      format: fmt, convertible, occurrences: used?.size ?? 1,
    });
  }
  return out;
}
