/**
 * WCAG 2.x relative luminance and contrast ratio, implemented locally so the
 * QA runner has no browser-side dependency for the maths.
 */

export type Rgba = { r: number; g: number; b: number; a: number };

const NAMED: Record<string, string> = {
  transparent: "rgba(0, 0, 0, 0)",
  white: "#ffffff",
  black: "#000000",
};

/** Parse `#hex`, `rgb()`/`rgba()` (comma or space syntax), `transparent`, `white`, `black`. */
export function parseColor(input: string | null | undefined): Rgba | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];

  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = h.split("").map((c) => parseInt(c + c, 16));
      return { r, g, b, a: h.length === 4 ? a / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }

  const fn = s.match(/^rgba?\(([^)]*)\)$/);
  if (fn) {
    const parts = fn[1].replace(/\//g, " ").split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = (v: string) => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v));
    const alpha = (v: string | undefined) =>
      v === undefined ? 1 : v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v);
    const r = ch(parts[0]);
    const g = ch(parts[1]);
    const b = ch(parts[2]);
    const a = alpha(parts[3]);
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a: Math.max(0, Math.min(1, a)) };
  }
  return null;
}

/** Canonical `r,g,b,a` string for set membership (alpha rounded to 3 places). */
export function canonical(c: Rgba): string {
  return `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${Math.round(c.a * 1000) / 1000}`;
}

/** Alpha-composite `top` over an opaque-ish `under` colour. */
export function composite(top: Rgba, under: Rgba): Rgba {
  const a = top.a + under.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, u: number) => (t * top.a + u * under.a * (1 - top.a)) / a;
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a };
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (ignores alpha; composite first). */
export function luminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** Contrast ratio 1..21. Semi-transparent foreground is composited over the background. */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const f = fg.a < 1 ? composite(fg, bg) : fg;
  const l1 = luminance(f);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA threshold: large text (>=24px, or >=19px bold) needs 3.0, everything else 4.5. */
export function requiredRatio(fontSizePx: number, fontWeight: number): 3 | 4.5 {
  const bold = fontWeight >= 700;
  return fontSizePx >= 24 || (bold && fontSizePx >= 19) ? 3 : 4.5;
}

export function isTransparent(c: Rgba | null): boolean {
  return !c || c.a === 0;
}

export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
