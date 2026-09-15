/**
 * Design-token whitelist helpers for the deck QA runner.
 *
 * - `parseTokens` turns the design-system manifest into a `--name -> value` map.
 * - `literalColoursInCss` finds literal colours in CSS that should have been tokens.
 */

export type TokenLike = { name: string; value: string; kind?: string };

/** `--name -> value` for every token in the manifest (names normalised to start with `--`). */
export function parseTokens(manifest: { tokens?: TokenLike[] } | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of manifest?.tokens ?? []) {
    if (!t?.name || typeof t.value !== "string") continue;
    const name = t.name.startsWith("--") ? t.name : `--${t.name.replace(/^-+/, "")}`;
    out.set(name, t.value.trim());
  }
  return out;
}

/** Colour tokens only (kind === "color", or a value that looks like a colour when kind is missing). */
export function colourTokens(tokens: Map<string, string>, kinds?: Map<string, string | undefined>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of tokens) {
    const kind = kinds?.get(name);
    if (kind === "color" || (kind === undefined && LOOKS_LIKE_COLOUR.test(value))) out.set(name, value);
  }
  return out;
}

const LOOKS_LIKE_COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|transparent$|white$|black$)/i;

export type LiteralColour = { value: string; line: number };

const HEX_RE = /(?<![\w-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const FN_RE = /\b(rgba?|hsla?)\(([^()]*)\)/g;

/**
 * Literal hex / rgb / hsl colours in a CSS string, with 1-based line numbers.
 *
 * Ignored: comments, anything inside `var(...)` or `url(...)`, and custom-property
 * declarations (`--x: #123`), because tokens have to be defined literally somewhere.
 * Pure black / white inside `rgb()`/`rgba()` are allowed (overlay & scrim use).
 */
export function literalColoursInCss(css: string): LiteralColour[] {
  // Blank out ignored regions while preserving length and newlines so line numbers stay right.
  let src = blankRegions(css, /\/\*[\s\S]*?\*\//g);
  src = blankBalanced(src, /\b(?:var|url)\(/g);
  src = blankCustomPropertyDeclarations(src);

  const found: { index: number; value: string }[] = [];
  for (const m of src.matchAll(HEX_RE)) found.push({ index: m.index ?? 0, value: m[0] });
  for (const m of src.matchAll(FN_RE)) {
    const fn = m[1].toLowerCase();
    const args = m[2];
    if ((fn === "rgb" || fn === "rgba") && isBlackOrWhiteArgs(args)) continue;
    found.push({ index: m.index ?? 0, value: m[0].replace(/\s+/g, " ") });
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((f) => ({ value: f.value, line: lineOf(src, f.index) }));
}

function isBlackOrWhiteArgs(args: string): boolean {
  const parts = args.replace(/\//g, " ").split(/[\s,]+/).filter(Boolean).slice(0, 3);
  if (parts.length < 3) return false;
  const nums = parts.map((p) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
  if (nums.some((n) => Number.isNaN(n))) return false;
  return nums.every((n) => n === 0) || nums.every((n) => n >= 255);
}

function lineOf(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

/** Replace every regex match with spaces (newlines kept). */
function blankRegions(src: string, re: RegExp): string {
  return src.replace(re, (m) => m.replace(/[^\n]/g, " "));
}

/** Blank `fn(` ... matching `)` including nested parens. */
function blankBalanced(src: string, opener: RegExp): string {
  const chars = src.split("");
  for (const m of src.matchAll(opener)) {
    const start = m.index ?? 0;
    let depth = 0;
    for (let i = start; i < chars.length; i++) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          for (let k = start; k <= i; k++) if (chars[k] !== "\n") chars[k] = " ";
          break;
        }
      }
    }
  }
  return chars.join("");
}

/** Blank `--custom-prop: value;` declarations (up to `;` or `}`), keeping newlines. */
function blankCustomPropertyDeclarations(src: string): string {
  return src.replace(/(^|[{;\s])(--[\w-]+\s*:[^;}]*)/g, (_m, pre: string, decl: string) => pre + decl.replace(/[^\n]/g, " "));
}
