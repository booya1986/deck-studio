import type { SourceBlock, TextBlocks } from "@/lib/schema/common";

const HEBREW = /[\u0590-\u05FF]/;
const LATIN = /[A-Za-z]/;

export function detectLanguage(text: string): TextBlocks["language"] {
  const he = (text.match(/[\u0590-\u05FF]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]/g) ?? []).length;
  if (he === 0 && en === 0) return "unknown";
  if (he > en * 3) return "he";
  if (en > he * 3) return "en";
  return "mixed";
}

export function scriptOf(text: string): "hebrew" | "latin" | "unknown" {
  if (HEBREW.test(text)) return "hebrew";
  if (LATIN.test(text)) return "latin";
  return "unknown";
}

export function cleanText(s: string): string {
  return s.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

/**
 * PDF bidi puts a Hebrew heading's leading number at the end of the line
 * ("הגדרות .2"). Move it back to the front.
 */
export function fixRtlLeadingNumber(text: string): string {
  const m = text.match(/^(.*?)\s*\.?\s*(\d{1,2})\.?$/u);
  if (!m) return text;
  const [, body, num] = m;
  if (!body || !/[\u0590-\u05FF]/.test(body) || /\d/.test(body.slice(-2))) return text;
  if (body.length > 60) return text;
  return `${num}. ${body.trim()}`;
}

/** Headings are short lines; combined with format hints this classifies a block. */
export function looksLikeHeading(text: string): boolean {
  const t = cleanText(text);
  return t.length > 0 && t.length <= 90 && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 14;
}

export function makeBlock(
  seq: number,
  partial: Omit<SourceBlock, "id" | "text"> & { text: string },
): SourceBlock {
  return { id: `b${String(seq).padStart(4, "0")}`, ...partial };
}

/** First non-empty title-ish block. */
export function guessTitle(blocks: SourceBlock[]): string | undefined {
  const t = blocks.find((b) => b.kind === "title") ?? blocks.find((b) => b.kind === "heading");
  return t ? cleanText(t.text) : undefined;
}

/** Organisation name guess: a short line containing a known org word, or the doc creator. */
const ORG_WORD = "בנק|חברת|קבוצת|עמותת|מכללת|אוניברסיטת|משרד|רשות|קופת|Bank|Group|Ltd|Inc";
const ORG_RE = new RegExp(`((?:${ORG_WORD})\\s+[\\p{L}\\d'"׳״-]+(?:\\s+[\\p{L}\\d'"׳״-]+)?)`, "u");
/** Words that start the next phrase, so the org name ends before them. */
const ORG_STOP = /^(מסמך|נוהל|גרסה|תאריך|עמוד|סיווג|הנחיה|הוראה|תקנון|מדיניות|לשימוש|כל|בע"?מ)$/u;

/**
 * Best-effort organisation name. Captions (header/footer) win over body text,
 * because that is where the name almost always sits.
 */
export function guessOrgName(blocks: SourceBlock[], fallback?: string): string | undefined {
  const ordered = [
    ...blocks.filter((b) => b.kind === "caption"),
    ...blocks.filter((b) => b.kind !== "caption").slice(0, 40),
  ];
  for (const b of ordered) {
    const m = cleanText(b.text).match(ORG_RE);
    if (!m) continue;
    const words = m[1].split(/\s+/);
    const kept = [words[0]];
    for (const w of words.slice(1)) {
      if (ORG_STOP.test(w)) break;
      kept.push(w);
    }
    if (kept.length >= 2) return kept.join(" ");
  }
  return fallback ? cleanText(fallback) : undefined;
}
