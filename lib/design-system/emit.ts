import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { BrandDecision, DsManifest } from "@/lib/schema/design-system";
import { fontByFamily, fontStack, googleUrl, resolveFont, type GoogleFont } from "./fonts";
import { buildPalette, buildTokens, tokenCss, type Token } from "./tokens";
import { brandBoardHtml } from "./brand-board";

export type EmitArgs = {
  /** where brand-decision.json lives and where the design system is written */
  dsDir: string;
  /** extraction dir, source of logo/image files referenced by the decision */
  extractionDir: string;
  sourceFile: string;
};

/**
 * Deterministic design-system emitter.
 * Same input always produces the same files, so gate-1 edits just re-run it.
 */
export async function emitDesignSystem(args: EmitArgs): Promise<DsManifest> {
  const decisionRaw = JSON.parse(await fs.readFile(path.join(args.dsDir, "brand-decision.json"), "utf8"));
  const decision = BrandDecision.parse(decisionRaw);

  const palette = buildPalette(decision);
  const tokens = buildTokens(decision, palette);

  const assets = await copyAssets(decision, args);
  // Asset copying can rewrite the logo path (crop, rename), so persist the result.
  await fs.writeFile(
    path.join(args.dsDir, "brand-decision.json"),
    JSON.stringify(decision, null, 2) + "\n",
    "utf8",
  );

  const headingFont = fontByFamily(decision.fonts.heading.value.family);
  const bodyFont = fontByFamily(decision.fonts.body.value.family);
  const usedFonts = [headingFont, bodyFont].filter((f): f is GoogleFont => !!f);
  const url = usedFonts.length ? googleUrl(usedFonts) : "";

  await writeTokenFiles(args.dsDir, tokens, decision, url);

  const manifest: DsManifest = DsManifest.parse({
    namespace: nsFor(decision.orgName),
    brand: { name: decision.orgName, sourceFile: args.sourceFile, language: decision.language },
    mode: decision.colors.mode,
    tokens,
    brandFonts: [
      fontEntry("heading", decision.fonts.heading.value.family, decision.fonts.heading.value.originalFamily, url),
      fontEntry("body", decision.fonts.body.value.family, decision.fonts.body.value.originalFamily, url),
    ],
    assets,
    cards: [{ path: "brand-board.html", group: "Brand", name: "לוח מותג" }],
    globalCssPaths: ["styles.css"],
  });

  await fs.writeFile(path.join(args.dsDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.writeFile(
    path.join(args.dsDir, "brand-board.html"),
    brandBoardHtml({ decision, manifest, palette, sourceFile: args.sourceFile }),
    "utf8",
  );
  return manifest;
}

function fontEntry(role: "heading" | "body", family: string, original: string | undefined, url: string) {
  const known = fontByFamily(family);
  return {
    role,
    family,
    status: known && !original ? ("google" as const) : known ? ("system_fallback" as const) : ("system_fallback" as const),
    url: url || undefined,
  };
}

function nsFor(orgName: string): string {
  const slug = orgName.replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 32);
  return `${slug || "brand"}-ds`;
}

async function writeTokenFiles(dsDir: string, tokens: Token[], d: BrandDecision, fontUrl: string) {
  const tokensDir = path.join(dsDir, "tokens");
  await fs.mkdir(tokensDir, { recursive: true });

  const files: [string, string][] = [
    ["colors.css", [
      tokenCss(tokens, (t) => t.kind === "color" && t.layer === "primitive", "שכבה 1 · סולמות צבע"),
      tokenCss(tokens, (t) => t.kind === "color" && t.layer === "role", "שכבה 2 · צבעי תפקיד"),
    ].join("\n")],
    ["fonts.css", `${fontUrl ? `@import url('${fontUrl}');\n\n` : ""}${tokenCss(tokens, (t) => t.kind === "font", "גופנים")}`],
    ["typography.css", tokenCss(tokens, (t) => t.name.startsWith("--fs-") || t.name.startsWith("--lh-"), "סולם טיפוגרפי")],
    ["spacing.css", tokenCss(tokens, (t) => t.kind === "spacing" || t.kind === "radius", "ריווח ורדיוסים")],
    ["effects.css", tokenCss(tokens, (t) => t.kind === "shadow", "אפקטים")],
    ["base.css", baseCss(d)],
  ];
  for (const [name, content] of files) {
    await fs.writeFile(path.join(tokensDir, name), content, "utf8");
  }
  await fs.writeFile(
    path.join(dsDir, "styles.css"),
    ["colors", "fonts", "typography", "spacing", "effects", "base"]
      .map((n) => `@import url('tokens/${n}.css');`)
      .join("\n") + "\n",
    "utf8",
  );
}

function baseCss(d: BrandDecision): string {
  const dir = d.language === "he" ? "rtl" : "ltr";
  return `/* בסיס */
:root { color-scheme: ${d.colors.mode}; }
*, *::before, *::after { box-sizing: border-box; }
html { direction: ${dir}; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text-1);
  font-family: var(--font-body);
  font-size: var(--fs-body);
  line-height: var(--lh-normal);
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4 { font-family: var(--font-heading); line-height: var(--lh-tight); margin: 0; }
strong, b { font-weight: 700; }
/* Counters and tables read correctly only with tabular figures. */
.tabular, table, .kpi { font-variant-numeric: tabular-nums; }
img, svg { max-width: 100%; }
`;
}

type Assets = DsManifest["assets"];

async function copyAssets(d: BrandDecision, args: EmitArgs): Promise<Assets> {
  const logoDir = path.join(args.dsDir, "assets", "logo");
  const imagesDir = path.join(args.dsDir, "assets", "images");
  await fs.mkdir(logoDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });

  let logo: string | undefined;
  if (d.logo.cropFromPage) {
    logo = await cropLogo(d, args, logoDir);
  } else if (d.logo.path) {
    logo = await copyLogo(d.logo.path, args, logoDir);
  }
  if (logo) {
    d.logo.path = logo;
    d.logo.needsUpload = false;
  } else if (!d.logo.path) {
    d.logo.needsUpload = true;
  }

  const images: string[] = [];
  for (const img of d.contentImages) {
    const src = resolveAsset(img.path, args);
    const dest = path.join(imagesDir, path.basename(img.path));
    try {
      await fs.copyFile(src, dest);
      const rel = path.posix.join("assets", "images", path.basename(img.path));
      images.push(rel);
      img.path = rel;
    } catch {
      // referenced image is missing; drop it rather than fail the emit
    }
  }
  d.contentImages = d.contentImages.filter((i) => images.includes(i.path));

  return { logo, images };
}

/** A decision may point into the extraction dir or already into the design system. */
function resolveAsset(p: string, args: EmitArgs): string {
  if (path.isAbsolute(p)) return p;
  if (p.startsWith("assets/")) return path.join(args.dsDir, p);
  return path.join(args.extractionDir, p);
}

async function copyLogo(src: string, args: EmitArgs, logoDir: string): Promise<string | undefined> {
  const from = resolveAsset(src, args);
  const ext = path.extname(from).toLowerCase() || ".png";
  const dest = path.join(logoDir, `logo${ext}`);
  try {
    await fs.copyFile(from, dest);
    return path.posix.join("assets", "logo", `logo${ext}`);
  } catch {
    return undefined;
  }
}

/** PDF fallback: the agent points at a rectangle on a rendered page. */
async function cropLogo(d: BrandDecision, args: EmitArgs, logoDir: string): Promise<string | undefined> {
  const crop = d.logo.cropFromPage!;
  const from = resolveAsset(crop.page, args);
  const dest = path.join(logoDir, "logo.png");
  try {
    const img = sharp(from);
    const meta = await img.metadata();
    const left = Math.max(0, Math.round(crop.x));
    const top = Math.max(0, Math.round(crop.y));
    const width = Math.min(Math.round(crop.w), (meta.width ?? 0) - left);
    const height = Math.min(Math.round(crop.h), (meta.height ?? 0) - top);
    if (width <= 0 || height <= 0) return undefined;
    await img.extract({ left, top, width, height }).png().toFile(dest);
    return path.posix.join("assets", "logo", "logo.png");
  } catch {
    return undefined;
  }
}

export { fontStack, resolveFont };
