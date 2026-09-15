import type { BrandDecision, DsManifest } from "@/lib/schema/design-system";
import type { Provenance } from "@/lib/schema/common";
import {
  buildScale, chartSeries, contrast, derivedAccent, inkOn, lightestPassing, mix,
  neutralScale, normaliseHex, pickForContrast, SCALE_STEPS, type Scale,
} from "./palette";
import { fontStack } from "./fonts";

export type Token = DsManifest["tokens"][number];

export type Palette = {
  mode: "light" | "dark";
  primary: Scale;
  secondary: Scale;
  accent: Scale;
  neutral: Scale;
  roles: Record<string, string>;
  chart: string[];
};

/**
 * Turn the agent's brand decision into a complete, contrast-checked palette.
 * Anything the document did not supply is derived here and marked `inferred`.
 */
export function buildPalette(d: BrandDecision): Palette {
  const mode = d.colors.mode;
  const primaryHex = normaliseHex(d.colors.primary.value);
  const accentHex = normaliseHex(d.colors.accent?.value ?? derivedAccent(primaryHex));
  const secondaryHex = normaliseHex(d.colors.secondary?.value ?? mix(primaryHex, accentHex, 0.45));
  const neutralSeed = normaliseHex(d.colors.neutralSeed?.value ?? primaryHex);

  const primary = buildScale(primaryHex);
  const accent = buildScale(accentHex);
  const secondary = buildScale(secondaryHex);
  const neutral = neutralScale(neutralSeed);

  const light = mode === "light";
  const bg = light ? neutral[50] : neutral[900];
  const surface = light ? "#ffffff" : mix(neutral[900], "#ffffff", 0.07);
  const surface2 = light ? neutral[100] : mix(neutral[900], "#ffffff", 0.12);
  const surface3 = light ? primary[50] : mix(primary[900], "#ffffff", 0.14);

  const text1 = light
    ? pickForContrast(neutral, bg, 12, "dark")
    : pickForContrast(neutral, bg, 12, "light");
  // Secondary and tertiary text step visibly closer to the background while
  // still clearing AA; the lightest passing step is what makes them distinct.
  const text2 = lightestPassing(neutral, bg, 7, light);
  const text3 = lightestPassing(neutral, bg, 4.5, light);

  // The brand colour as printed, plus a text-safe variant for small type.
  const primaryOnBg = contrast(primaryHex, bg) >= 4.5
    ? primaryHex
    : pickForContrast(primary, bg, 4.5, light ? "dark" : "light");
  const accentOnBg = contrast(accentHex, bg) >= 4.5
    ? accentHex
    : pickForContrast(accent, bg, 4.5, light ? "dark" : "light");

  const roles: Record<string, string> = {
    "--bg": bg,
    "--surface": surface,
    "--surface-2": surface2,
    "--surface-3": surface3,
    "--text-1": text1,
    "--text-2": text2,
    "--text-3": text3,
    "--text-inverse": inkOn(text1),
    "--border": light ? neutral[200] : mix(neutral[900], "#ffffff", 0.18),
    "--border-strong": light ? neutral[300] : mix(neutral[900], "#ffffff", 0.3),
    "--primary": primaryHex,
    "--primary-text": primaryOnBg,
    "--primary-hover": light ? primary[700] : primary[400],
    "--primary-ink": inkOn(primaryHex),
    "--primary-soft": light ? primary[50] : mix(primary[900], "#000000", 0.25),
    "--primary-line": light ? primary[200] : primary[700],
    "--secondary": secondaryHex,
    "--secondary-soft": light ? secondary[50] : mix(secondary[900], "#000000", 0.25),
    "--secondary-ink": inkOn(secondaryHex),
    "--accent": accentHex,
    "--accent-text": accentOnBg,
    "--accent-ink": inkOn(accentHex),
    "--accent-soft": light ? accent[50] : mix(accent[900], "#000000", 0.25),
    "--accent-line": light ? accent[200] : accent[700],
    "--gradient": `linear-gradient(158deg, ${accentHex}, ${primary[700]})`,
    "--success": light ? "#15803d" : "#4ade80",
    "--success-soft": light ? "#e9f6ee" : "#0f2a1a",
    "--warning": light ? "#b45309" : "#fbbf24",
    "--warning-soft": light ? "#fdf3e4" : "#2c1e05",
    "--danger": light ? "#b91c1c" : "#f87171",
    "--danger-soft": light ? "#fdecec" : "#2c1010",
  };

  const chart = chartSeries([primaryHex, accentHex, secondaryHex], 5);
  chart.forEach((c, i) => (roles[`--chart-${i + 1}`] = c));

  return { mode, primary, secondary, accent, neutral, roles, chart };
}

const SPACING = { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "24px", 6: "32px", 7: "48px", 8: "64px", 9: "96px" };
const RADIUS = { sm: "6px", md: "12px", lg: "20px", xl: "32px", pill: "999px" };
/** Type ramp for a 1920x1080 slide. */
const FONT_SIZE = {
  eyebrow: "20px", body: "26px", "body-lg": "30px", lead: "34px",
  h3: "38px", h2: "52px", h1: "72px", display: "104px", kpi: "88px", note: "18px",
};
const LINE_HEIGHT = { tight: "1.1", snug: "1.25", normal: "1.45", relaxed: "1.6" };
const SHADOW = {
  sm: "0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08)",
  md: "0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.06)",
  lg: "0 18px 40px rgba(0,0,0,.12), 0 6px 12px rgba(0,0,0,.08)",
};

export function buildTokens(d: BrandDecision, palette: Palette): Token[] {
  const tokens: Token[] = [];
  const push = (name: string, value: string, kind: Token["kind"], layer: Token["layer"], provenance: Provenance) =>
    tokens.push({ name, value, kind, layer, provenance });

  const scaleProv = (key: "primary" | "secondary" | "accent"): Provenance =>
    d.colors[key]?.provenance ?? "inferred";

  for (const [key, scale] of [
    ["primary", palette.primary], ["secondary", palette.secondary],
    ["accent", palette.accent], ["neutral", palette.neutral],
  ] as const) {
    for (const step of SCALE_STEPS) {
      const prov: Provenance = key === "neutral" ? "inferred" : scaleProv(key);
      push(`--${key}-${step}`, scale[step], "color", "primitive", prov);
    }
  }

  const roleProvenance = (name: string): Provenance => {
    if (name.startsWith("--primary")) return d.colors.primary.provenance;
    if (name.startsWith("--accent")) return d.colors.accent?.provenance ?? "inferred";
    if (name.startsWith("--secondary")) return d.colors.secondary?.provenance ?? "inferred";
    return "inferred";
  };
  for (const [name, value] of Object.entries(palette.roles)) {
    push(name, value, "color", "role", roleProvenance(name));
  }

  push("--font-heading", fontStack(d.fonts.heading.value.family), "font", "role", d.fonts.heading.provenance);
  push("--font-body", fontStack(d.fonts.body.value.family), "font", "role", d.fonts.body.provenance);

  for (const [k, v] of Object.entries(SPACING)) push(`--space-${k}`, v, "spacing", "primitive", "inferred");
  for (const [k, v] of Object.entries(RADIUS)) push(`--radius-${k}`, v, "radius", "primitive", "inferred");
  for (const [k, v] of Object.entries(FONT_SIZE)) push(`--fs-${k}`, v, "other", "primitive", "inferred");
  for (const [k, v] of Object.entries(LINE_HEIGHT)) push(`--lh-${k}`, v, "other", "primitive", "inferred");
  for (const [k, v] of Object.entries(SHADOW)) push(`--shadow-${k}`, v, "shadow", "primitive", "inferred");

  return tokens;
}

export function tokenCss(tokens: Token[], filter: (t: Token) => boolean, title: string): string {
  const rows = tokens.filter(filter);
  if (!rows.length) return "";
  const lines = rows.map((t) => {
    const mark = t.provenance === "extracted" ? "" : `  /* ${t.provenance} */`;
    return `  ${t.name}: ${t.value};${mark}`;
  });
  return `/* ${title} */\n:root {\n${lines.join("\n")}\n}\n`;
}
