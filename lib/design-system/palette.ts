import { clampChroma, converter, formatHex, wcagContrast } from "culori";

const toOklch = converter("oklch");
const toRgb = converter("rgb");

export type Oklch = { mode: "oklch"; l: number; c: number; h: number };

export function parseHex(hex: string): Oklch {
  const v = toOklch(hex);
  if (!v) throw new Error(`unparseable colour: ${hex}`);
  return { mode: "oklch", l: v.l ?? 0, c: v.c ?? 0, h: v.h ?? 0 };
}

export function hex(c: Oklch): string {
  return formatHex(clampChroma({ ...c }, "oklch")) ?? "#000000";
}

export function contrast(a: string, b: string): number {
  return wcagContrast(a, b) ?? 1;
}

/** Perceptual lightness 0..1 of a hex colour. */
export function lightness(h: string): number {
  return parseHex(h).l;
}

export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type ScaleStep = (typeof SCALE_STEPS)[number];
export type Scale = Record<ScaleStep, string>;

/** Target lightness per step; the seed colour keeps its own hue and chroma character. */
const STEP_L: Record<ScaleStep, number> = {
  50: 0.975, 100: 0.94, 200: 0.885, 300: 0.81, 400: 0.715,
  500: 0.62, 600: 0.53, 700: 0.44, 800: 0.35, 900: 0.26,
};

/**
 * A 10-step scale around a seed colour. Chroma tapers at both ends so the
 * light steps stay usable as surfaces and the dark ones do not go muddy.
 */
export function buildScale(seedHex: string): Scale {
  const seed = parseHex(seedHex);
  const out = {} as Scale;
  for (const step of SCALE_STEPS) {
    const l = STEP_L[step];
    const distance = Math.abs(l - 0.62);
    const chroma = Math.max(0.008, seed.c * (1 - distance * 0.85));
    out[step] = hex({ mode: "oklch", l, c: chroma, h: seed.h });
  }
  // Keep the brand colour itself in the scale, at the step nearest its lightness.
  const nearest = SCALE_STEPS.reduce((best, s) =>
    Math.abs(STEP_L[s] - seed.l) < Math.abs(STEP_L[best] - seed.l) ? s : best,
  );
  out[nearest] = normaliseHex(seedHex);
  return out;
}

/** A near-neutral scale that carries a hint of the brand hue. */
export function neutralScale(seedHex: string): Scale {
  const seed = parseHex(seedHex);
  const out = {} as Scale;
  for (const step of SCALE_STEPS) {
    out[step] = hex({ mode: "oklch", l: STEP_L[step], c: 0.012, h: seed.h });
  }
  return out;
}

export function normaliseHex(h: string): string {
  const rgb = toRgb(h);
  return rgb ? (formatHex(rgb) ?? h.toLowerCase()) : h.toLowerCase();
}

/**
 * Walk a scale until the colour clears `min` contrast against `bg`.
 * Returns the first passing step, or the extreme end when none do.
 */
export function pickForContrast(scale: Scale, bg: string, min: number, prefer: "dark" | "light"): string {
  const order = prefer === "dark" ? [...SCALE_STEPS].reverse() : [...SCALE_STEPS];
  const start = prefer === "dark" ? order.indexOf(700) : order.indexOf(300);
  const candidates = [...order.slice(start), ...order.slice(0, start)];
  for (const step of candidates) {
    if (contrast(scale[step], bg) >= min) return scale[step];
  }
  return prefer === "dark" ? scale[900] : scale[50];
}

/**
 * The step closest to `bg` in lightness that still clears `min` contrast.
 * Use this for secondary and tertiary text so they stay visibly lighter than
 * the primary text instead of collapsing onto the same value.
 */
export function lightestPassing(scale: Scale, bg: string, min: number, bgIsLight: boolean): string {
  const order = bgIsLight ? [...SCALE_STEPS] : [...SCALE_STEPS].reverse();
  for (const step of order) {
    if (contrast(scale[step], bg) >= min) return scale[step];
  }
  return bgIsLight ? scale[900] : scale[50];
}

/** Black or white, whichever reads better on the given background. */
export function inkOn(bg: string): string {
  return contrast("#ffffff", bg) >= contrast("#111111", bg) ? "#ffffff" : "#111111";
}

/** Mix two colours in OKLCH; `t` 0 keeps `a`, 1 keeps `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  let dh = ((y.h - x.h + 540) % 360) - 180;
  return hex({
    mode: "oklch",
    l: x.l + (y.l - x.l) * t,
    c: x.c + (y.c - x.c) * t,
    h: x.h + dh * t,
  });
}

/** A hue-rotated companion, used when the document yields only one brand colour. */
export function derivedAccent(primaryHex: string): string {
  const p = parseHex(primaryHex);
  const h = (p.h + 158) % 360;
  return hex({ mode: "oklch", l: Math.min(0.78, Math.max(0.6, p.l + 0.18)), c: Math.max(0.11, p.c * 1.25), h });
}

/**
 * Chart series that stay inside the brand's own hues.
 * The brand colours come first, then lighter and darker variants of the same
 * hues, so a chart never introduces a colour the brand does not own.
 */
export function chartSeries(seeds: string[], count = 5): string[] {
  const base = seeds.filter(Boolean).map(normaliseHex);
  if (!base.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (c: string) => {
    if (out.length >= count || seen.has(c)) return;
    seen.add(c);
    out.push(c);
  };

  for (const c of base) add(c);
  // Second pass: a lighter take on each brand hue.
  for (const c of base) {
    const p = parseHex(c);
    add(hex({ mode: "oklch", l: Math.min(0.82, p.l + 0.2), c: Math.max(0.05, p.c * 0.8), h: p.h }));
  }
  // Third pass: a deeper take.
  for (const c of base) {
    const p = parseHex(c);
    add(hex({ mode: "oklch", l: Math.max(0.3, p.l - 0.16), c: Math.max(0.05, p.c * 0.9), h: p.h }));
  }
  return out.slice(0, count);
}
