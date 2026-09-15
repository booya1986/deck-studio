import { promises as fs } from "node:fs";
import path from "node:path";
import type JSZip from "jszip";
import sharp from "sharp";
import type { SourceBlock } from "@/lib/schema/common";
import type { BrandCandidates } from "@/lib/schema/candidates";
import {
  arr, attr, normHex, openZip, readRels, readTheme, readXml, resolveTarget, walk, type Xml,
} from "./ooxml";
import { formatOf, rankLogos, UNCONVERTIBLE, type ImageCandidate } from "./logo-score";
import { cleanText, makeBlock, scriptOf } from "./text-common";

type ColorHit = { hex: string; weight: number; source: "run" | "fill" | "theme" };
type FontHit = { family: string; weight: number };

const HEADING_STYLE = /^Heading(\d)$/i;

function runText(r: Xml): string {
  return arr<Xml>(r["w:t"])
    .map((t) => (typeof t === "string" ? t : (t?.["#text"] ?? "")))
    .join("");
}

/** Paragraph → block kind, from its style and its numbering properties. */
function paragraphKind(p: Xml): { kind: SourceBlock["kind"]; level?: number } {
  const pPr = p["w:pPr"] as Xml | undefined;
  const style = attr(pPr?.["w:pStyle"], "w:val") ?? "";
  const m = style.match(HEADING_STYLE);
  if (m) {
    const level = Number(m[1]);
    return { kind: level === 1 ? "title" : "heading", level };
  }
  if (/^Title$/i.test(style)) return { kind: "title", level: 1 };
  if (pPr?.["w:numPr"]) return { kind: "list" };
  return { kind: "paragraph" };
}

export async function extractDocx(args: {
  buf: Buffer;
  filename: string;
  outDir: string;
}): Promise<{ blocks: SourceBlock[]; candidates: BrandCandidates }> {
  const zip = await openZip(args.buf);
  const doc = await readXml(zip, "word/document.xml");
  const styles = await readXml(zip, "word/styles.xml");
  const theme = await readTheme(zip, "word/theme/theme1.xml");

  const colors = new Map<string, ColorHit>();
  const fonts = new Map<string, FontHit>();
  const addColor = (hex: string | null, weight: number, source: ColorHit["source"]) => {
    if (!hex) return;
    const cur = colors.get(hex) ?? { hex, weight: 0, source };
    cur.weight += weight;
    colors.set(hex, cur);
  };
  const addFont = (family: string | undefined, weight: number) => {
    if (!family) return;
    const cur = fonts.get(family) ?? { family, weight: 0 };
    cur.weight += weight;
    fonts.set(family, cur);
  };

  // Theme colours count as strong signals even when no run uses them directly.
  for (const [name, hex] of Object.entries(theme?.colors ?? {})) {
    if (name === "lt1" || name === "dk1") continue;
    addColor(hex, 40, "theme");
  }
  if (theme?.majorFont) addFont(theme.majorFont.family, 200);
  if (theme?.minorFont) addFont(theme.minorFont.family, 200);

  // Default document font from styles.xml.
  const docDefaults = styles?.["w:styles"]?.["w:docDefaults"]?.["w:rPrDefault"]?.["w:rPr"];
  const defCs = attr(docDefaults?.["w:rFonts"], "w:cs");
  const defAscii = attr(docDefaults?.["w:rFonts"], "w:ascii");
  addFont(defCs, 150);
  addFont(defAscii, 60);

  const blocks: SourceBlock[] = [];
  const paragraphs = collectParagraphs(doc?.["w:document"]?.["w:body"]);
  let seq = 0;
  let paraIndex = 0;

  for (const p of paragraphs) {
    const runs = arr<Xml>(p["w:r"]);
    let text = "";
    for (const r of runs) {
      const t = runText(r);
      text += t;
      const rPr = r["w:rPr"] as Xml | undefined;
      const len = Math.max(1, t.trim().length);
      addColor(normHex(attr(rPr?.["w:color"], "w:val")), len, "run");
      addColor(normHex(attr(rPr?.["w:shd"], "w:fill")), len, "fill");
      const rf = rPr?.["w:rFonts"] as Xml | undefined;
      // w:cs is the complex-script (Hebrew) face; w:ascii the Latin one.
      addFont(attr(rf, "w:cs"), scriptOf(t) === "hebrew" ? len * 2 : len * 0.3);
      addFont(attr(rf, "w:ascii"), scriptOf(t) === "latin" ? len : len * 0.2);
    }
    const clean = cleanText(text);
    paraIndex += 1;
    if (!clean) continue;
    const { kind, level } = paragraphKind(p);
    blocks.push(makeBlock(++seq, { kind, level, text: clean, paragraph: paraIndex }));
  }

  // Table cells: text plus their shading fills.
  for (const tbl of collectTables(doc?.["w:document"]?.["w:body"])) {
    const rows: string[][] = [];
    for (const tr of arr<Xml>(tbl["w:tr"])) {
      const cells: string[] = [];
      for (const tc of arr<Xml>(tr["w:tc"])) {
        addColor(normHex(attr(tc["w:tcPr"]?.["w:shd"], "w:fill")), 25, "fill");
        const cellText = arr<Xml>(tc["w:p"])
          .map((p) => arr<Xml>(p["w:r"]).map(runText).join(""))
          .join(" ");
        for (const p of arr<Xml>(tc["w:p"])) {
          for (const r of arr<Xml>(p["w:r"])) {
            const rPr = r["w:rPr"] as Xml | undefined;
            const len = Math.max(1, runText(r).trim().length);
            addColor(normHex(attr(rPr?.["w:color"], "w:val")), len, "run");
            addFont(attr(rPr?.["w:rFonts"], "w:cs"), len * 2);
          }
        }
        cells.push(cleanText(cellText));
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    if (rows.length) {
      blocks.push(
        makeBlock(++seq, {
          kind: "table",
          text: rows.map((r) => r.join(" | ")).join("\n"),
          paragraph: ++paraIndex,
        }),
      );
    }
  }

  // Header and footer carry the organisation name in most real documents.
  for (const part of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n)).sort()) {
    const xml = await readXml(zip, part);
    const text = cleanText(
      [...walk(xml)]
        .flatMap((n) => arr<any>(n["w:t"]))
        .map((t) => (typeof t === "string" ? t : (t?.["#text"] ?? "")))
        .join(" "),
    );
    if (text) {
      blocks.push(makeBlock(++seq, { kind: "caption", text, paragraph: ++paraIndex }));
    }
  }

  const images = await extractDocxImages(zip, args.outDir);
  const ranked = rankLogos(images);

  const candidates: BrandCandidates = {
    kind: "docx",
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
      .map((f) => ({
        family: f.family,
        count: Math.round(f.weight),
        script: guessFontScript(f.family),
        embedded: false,
      })),
    images: ranked.map((i) => ({
      path: i.path, w: i.w, h: i.h, page: i.page, inHeader: i.inHeader,
      onMaster: i.onMaster, logoScore: i.logoScore, format: i.format, convertible: i.convertible,
    })),
    text: { headings: [] },
  };
  return { blocks, candidates };
}

/** Hebrew system fonts that carry no Latin name hint. */
const HEBREW_FONTS = /narkisim|david|frank|miriam|gisha|guttman|almoni|fbreforma|heebo|assistant|rubik|alef|hadasa|arimo|secular|varela|noto sans hebrew|open sans hebrew/i;
function guessFontScript(family: string): "hebrew" | "latin" | "unknown" {
  if (HEBREW_FONTS.test(family)) return "hebrew";
  if (/^[\x20-\x7E]+$/.test(family)) return "latin";
  return scriptOf(family);
}

function collectParagraphs(body: Xml | undefined): Xml[] {
  if (!body) return [];
  const out: Xml[] = [];
  const push = (nodes: unknown) => {
    for (const p of arr<Xml>(nodes as Xml[])) out.push(p);
  };
  push(body["w:p"]);
  return out;
}

function collectTables(body: Xml | undefined): Xml[] {
  return body ? arr<Xml>(body["w:tbl"]) : [];
}

async function copyThumbnail(zip: JSZip, outDir: string): Promise<string | undefined> {
  const entry = Object.keys(zip.files).find((n) => /^docProps\/thumbnail\.(jpe?g|png|emf)$/i.test(n));
  if (!entry) return undefined;
  const ext = formatOf(entry);
  if (UNCONVERTIBLE.has(ext)) return undefined;
  const rel = path.join("media", `thumbnail.${ext}`);
  const abs = path.join(outDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, await zip.file(entry)!.async("nodebuffer"));
  return rel;
}

async function extractDocxImages(zip: JSZip, outDir: string): Promise<ImageCandidate[]> {
  const headerTargets = new Set<string>();
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(header|footer)\d*\.xml$/.test(name)) continue;
    const rels = await readRels(zip, name);
    for (const t of rels.values()) headerTargets.add(resolveTarget(name, t));
  }

  const mediaDir = path.join(outDir, "media");
  await fs.mkdir(mediaDir, { recursive: true });
  const out: ImageCandidate[] = [];

  for (const name of Object.keys(zip.files)) {
    if (!/^word\/media\//.test(name) || zip.files[name].dir) continue;
    const fmt = formatOf(name);
    const convertible = !UNCONVERTIBLE.has(fmt);
    const base = path.basename(name);
    const rel = path.join("media", base);
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
        // unreadable image: leave dimensions at 0 so it scores low
      }
    }
    out.push({
      path: rel, w, h, inHeader: headerTargets.has(name), onMaster: false,
      format: fmt, convertible, occurrences: 1,
    });
  }
  return out;
}
