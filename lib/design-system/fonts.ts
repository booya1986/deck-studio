import type { FontChoice } from "@/lib/schema/design-system";

export type GoogleFont = {
  family: string;
  /** Google Fonts family id used to build the stylesheet URL */
  id: string;
  script: "hebrew" | "latin";
  /** rough visual character, used to pick a replacement for a system font */
  tone: "geometric" | "humanist" | "neutral" | "serif" | "rounded" | "display";
  weights: number[];
};

/** Hebrew-capable Google families, plus a few Latin companions. */
export const GOOGLE_FONTS: GoogleFont[] = [
  { family: "Heebo", id: "Heebo", script: "hebrew", tone: "neutral", weights: [300, 400, 500, 700, 800] },
  { family: "Assistant", id: "Assistant", script: "hebrew", tone: "humanist", weights: [300, 400, 600, 700] },
  { family: "Rubik", id: "Rubik", script: "hebrew", tone: "rounded", weights: [300, 400, 500, 700] },
  { family: "Noto Sans Hebrew", id: "Noto+Sans+Hebrew", script: "hebrew", tone: "neutral", weights: [400, 500, 700] },
  { family: "Alef", id: "Alef", script: "hebrew", tone: "humanist", weights: [400, 700] },
  { family: "Arimo", id: "Arimo", script: "hebrew", tone: "neutral", weights: [400, 500, 700] },
  { family: "Varela Round", id: "Varela+Round", script: "hebrew", tone: "rounded", weights: [400] },
  { family: "Secular One", id: "Secular+One", script: "hebrew", tone: "display", weights: [400] },
  { family: "Frank Ruhl Libre", id: "Frank+Ruhl+Libre", script: "hebrew", tone: "serif", weights: [400, 500, 700, 900] },
  { family: "David Libre", id: "David+Libre", script: "hebrew", tone: "serif", weights: [400, 500, 700] },
  { family: "Open Sans", id: "Open+Sans", script: "hebrew", tone: "humanist", weights: [400, 600, 700] },
  { family: "Inter", id: "Inter", script: "latin", tone: "neutral", weights: [400, 500, 600, 700] },
  { family: "Poppins", id: "Poppins", script: "latin", tone: "geometric", weights: [400, 500, 600, 700] },
];

const BY_FAMILY = new Map(GOOGLE_FONTS.map((f) => [f.family.toLowerCase(), f]));

/**
 * Fonts that appear in Hebrew documents but cannot be served on the web,
 * mapped to the closest Google family.
 */
const SYSTEM_MAP: Record<string, string> = {
  narkisim: "Frank Ruhl Libre",
  "narkis block": "Frank Ruhl Libre",
  david: "David Libre",
  "david libre": "David Libre",
  frank: "Frank Ruhl Libre",
  "frank ruehl": "Frank Ruhl Libre",
  miriam: "Arimo",
  "miriam fixed": "Arimo",
  gisha: "Assistant",
  guttman: "Frank Ruhl Libre",
  almoni: "Assistant",
  "almoni neue": "Assistant",
  fbreforma: "Assistant",
  reforma: "Assistant",
  hadasa: "Frank Ruhl Libre",
  arial: "Arimo",
  "arial hebrew": "Arimo",
  helvetica: "Arimo",
  calibri: "Open Sans",
  tahoma: "Open Sans",
  verdana: "Open Sans",
  "segoe ui": "Open Sans",
  "times new roman": "Frank Ruhl Libre",
  cambria: "Frank Ruhl Libre",
  georgia: "Frank Ruhl Libre",
};

export const DEFAULT_HEADING = "Heebo";
export const DEFAULT_BODY = "Assistant";

export type FontResolution = FontChoice & { status: "google" | "system_fallback" };

/**
 * Map a family found in the document to a family we can actually serve.
 * An exact Google match keeps its name; anything else is replaced and the
 * original is recorded so the brand board can show what was swapped.
 */
export function resolveFont(family: string | undefined, role: "heading" | "body"): FontResolution {
  const fallback = role === "heading" ? DEFAULT_HEADING : DEFAULT_BODY;
  const raw = (family ?? "").trim();
  const key = raw.toLowerCase();

  const direct = BY_FAMILY.get(key);
  if (direct) return { family: direct.family, googleUrl: googleUrl([direct]), status: "google" };

  const mapped = SYSTEM_MAP[key] ? BY_FAMILY.get(SYSTEM_MAP[key].toLowerCase()) : undefined;
  if (mapped) {
    return {
      family: mapped.family,
      googleUrl: googleUrl([mapped]),
      originalFamily: raw,
      status: "system_fallback",
    };
  }

  const def = BY_FAMILY.get(fallback.toLowerCase())!;
  return {
    family: def.family,
    googleUrl: googleUrl([def]),
    originalFamily: raw || undefined,
    status: raw ? "system_fallback" : "google",
  };
}

export function fontByFamily(family: string): GoogleFont | undefined {
  return BY_FAMILY.get(family.toLowerCase());
}

/** One stylesheet URL covering every family in the deck. */
export function googleUrl(fonts: GoogleFont[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const f of fonts) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    parts.push(`family=${f.id}:wght@${f.weights.join(";")}`);
  }
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

/** CSS stack with system fallbacks that still render Hebrew. */
export function fontStack(family: string): string {
  return `'${family}', 'Assistant', 'Arial Hebrew', Arial, system-ui, sans-serif`;
}
