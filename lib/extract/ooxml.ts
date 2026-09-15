import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  removeNSPrefix: false,
});

export type Xml = Record<string, any>;

export async function openZip(buf: Buffer): Promise<JSZip> {
  return JSZip.loadAsync(buf);
}

export async function readXml(zip: JSZip, path: string): Promise<Xml | null> {
  const f = zip.file(path);
  if (!f) return null;
  return parser.parse(await f.async("string")) as Xml;
}

export async function readText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  return f ? f.async("string") : null;
}

/** fast-xml-parser gives an object for a single child and an array for many. */
export function arr<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function attr(node: Xml | undefined, name: string): string | undefined {
  const v = node?.[`@_${name}`];
  return typeof v === "string" ? v : undefined;
}

/** Depth-first walk over every object node in a parsed document. */
export function* walk(node: unknown): Generator<Xml> {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item);
    return;
  }
  yield node as Xml;
  for (const key of Object.keys(node as Xml)) {
    if (key.startsWith("@_")) continue;
    yield* walk((node as Xml)[key]);
  }
}

const HEX6 = /^[0-9a-fA-F]{6}$/;
export function normHex(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.replace(/^#/, "").trim();
  return HEX6.test(s) ? `#${s.toLowerCase()}` : null;
}

/** Relationship id → target, for a part's `_rels/<name>.rels` file. */
export async function readRels(zip: JSZip, partPath: string): Promise<Map<string, string>> {
  const i = partPath.lastIndexOf("/");
  const dir = i === -1 ? "" : partPath.slice(0, i);
  const base = partPath.slice(i + 1);
  const relsPath = `${dir ? dir + "/" : ""}_rels/${base}.rels`;
  const xml = await readXml(zip, relsPath);
  const out = new Map<string, string>();
  for (const r of arr<Xml>(xml?.Relationships?.Relationship)) {
    const id = attr(r, "Id");
    const target = attr(r, "Target");
    if (id && target) out.set(id, target);
  }
  return out;
}

/** Resolve a relationship target (often `media/x.png` or `../media/x.png`) to a zip path. */
export function resolveTarget(partPath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const dir = partPath.slice(0, partPath.lastIndexOf("/"));
  const parts = (dir ? dir.split("/") : []).concat(target.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

export type ThemeInfo = {
  colors: Record<string, string>;
  majorFont?: { family: string; script: "hebrew" | "latin" | "unknown" };
  minorFont?: { family: string; script: "hebrew" | "latin" | "unknown" };
};

/** Parse a DrawingML theme part, e.g. word/theme/theme1.xml. Absent in many real documents. */
export async function readTheme(zip: JSZip, path: string): Promise<ThemeInfo | undefined> {
  const xml = await readXml(zip, path);
  const scheme = xml?.["a:theme"]?.["a:themeElements"];
  if (!scheme) return undefined;

  const colors: Record<string, string> = {};
  const clr = scheme["a:clrScheme"] ?? {};
  for (const key of Object.keys(clr)) {
    if (key.startsWith("@_")) continue;
    const node = clr[key] as Xml;
    const hex =
      normHex(attr(node?.["a:srgbClr"], "val")) ??
      normHex(attr(node?.["a:sysClr"], "lastClr"));
    if (hex) colors[key.replace(/^a:/, "")] = hex;
  }

  const fontOf = (n: Xml | undefined) => {
    if (!n) return undefined;
    const hebr = arr<Xml>(n["a:font"]).find((f) => attr(f, "script") === "Hebr");
    const hebrew = attr(hebr, "typeface");
    if (hebrew) return { family: hebrew, script: "hebrew" as const };
    const latin = attr(n["a:latin"], "typeface");
    return latin ? { family: latin, script: "latin" as const } : undefined;
  };
  const fs = scheme["a:fontScheme"] ?? {};
  return {
    colors,
    majorFont: fontOf(fs["a:majorFont"]),
    minorFont: fontOf(fs["a:minorFont"]),
  };
}
