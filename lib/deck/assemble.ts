import { promises as fs } from "node:fs";
import path from "node:path";
import { DsManifest } from "@/lib/schema/design-system";
import { TEMPLATES_DIR } from "@/lib/store/paths";

export type AssembleArgs = {
  projectDir: string;
  title?: string;
  /** override the language/direction; defaults to the manifest's brand language */
  lang?: "he" | "en";
};

export type AssembleResult = { slides: number; out: string };

const SLIDE_RE = /<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"/g;

export function slideCount(html: string): number {
  return (html.match(SLIDE_RE) ?? []).length;
}

/**
 * Literal colours in CSS that are not tokens. `var(...)` and comments are
 * ignored; black/white inside rgba()/rgb() are overlays and allowed.
 */
export function hexInCss(css: string): string[] {
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/var\([^)]*\)/g, " ")
    .replace(/rgba?\(\s*(?:0|255|#fff|#000|#ffffff|#000000)\s*,[^)]*\)/gi, " ")
    .replace(/rgba?\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)[^)]*\)/gi, " ");
  const found = new Set<string>();
  for (const m of stripped.matchAll(/#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?)\([^)]*\)/gi)) {
    const v = m[0].toLowerCase();
    if (v === "#fff" || v === "#ffffff" || v === "#000" || v === "#000000") continue;
    found.add(v);
  }
  return [...found];
}

async function readOr(file: string, fallback: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}

/**
 * Merge the template, the design-system tokens and the agent-written slides
 * into one self-contained `deck/index.html`. Deterministic; safe to re-run.
 */
export async function assembleDeck(args: AssembleArgs): Promise<AssembleResult> {
  const root = path.resolve(args.projectDir);
  const dsDir = path.join(root, "design-system");
  const deckDir = path.join(root, "deck");
  await fs.mkdir(deckDir, { recursive: true });

  const manifest = DsManifest.parse(JSON.parse(await fs.readFile(path.join(dsDir, "manifest.json"), "utf8")));
  const template = await fs.readFile(path.join(TEMPLATES_DIR, "deck-template.html"), "utf8");

  const slides = await readOr(path.join(deckDir, "slides.html"), "");
  const styles = await readOr(path.join(deckDir, "slide-styles.css"), "");
  const count = slideCount(slides);
  if (count === 0) throw new Error("deck/slides.html לא מכיל שקפים (section.slide)");

  const breakdownFile = path.join(root, "research", "breakdown.json");
  try {
    const breakdown = JSON.parse(await fs.readFile(breakdownFile, "utf8")) as { slides?: unknown[] };
    const planned = breakdown.slides?.length ?? 0;
    if (planned && planned !== count) {
      throw new Error(`מספר השקפים ב-slides.html (${count}) שונה מהפירוק (${planned})`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("מספר השקפים")) throw e;
    // no breakdown yet: nothing to compare against
  }

  const lang = args.lang ?? manifest.brand.language;
  const dir = lang === "he" ? "rtl" : "ltr";
  const tokens = manifest.tokens.map((t) => `  ${t.name}: ${t.value};`).join("\n");
  const fontUrl = manifest.brandFonts.find((f) => f.url)?.url;
  const fontLink = fontUrl ? `<link rel="stylesheet" href="${fontUrl}">` : "";
  const logoSrc = manifest.assets.logo ?? "";
  const title = args.title ?? (await titleFromBreakdown(breakdownFile)) ?? manifest.brand.name;

  const html = template
    .replace("{{LANG}}", lang)
    .replace("{{DIR}}", dir)
    .replace("{{TITLE}}", escapeHtml(title))
    .replace("{{FONT_LINK}}", fontLink)
    .replace("{{LOGO_SRC}}", logoSrc)
    .replace("/*{{TOKENS}}*/", tokens)
    .replace("<!--{{SLIDE_STYLES}}-->", styles)
    .replace("<!--{{SLIDES}}-->", slides);

  if (html.includes("{{")) throw new Error("נשארו placeholders בתבנית אחרי ההרכבה");

  const assetsDir = path.join(deckDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  try {
    await copyDir(path.join(dsDir, "assets"), assetsDir);
  } catch {
    // a design system may have no assets at all
  }
  await fs.copyFile(path.join(TEMPLATES_DIR, "gsap.min.js"), path.join(assetsDir, "gsap.min.js"));

  const out = path.join(deckDir, "index.html");
  await fs.writeFile(out, html, "utf8");
  return { slides: count, out };
}

async function titleFromBreakdown(file: string): Promise<string | null> {
  try {
    const b = JSON.parse(await fs.readFile(file, "utf8")) as { title?: string };
    return b.title ?? null;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
