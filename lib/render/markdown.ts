import type { Outline } from "@/lib/schema/outline";
import type { Breakdown } from "@/lib/schema/breakdown";
import type { Facts } from "@/lib/schema/facts";
import type { TextBlocks } from "@/lib/schema/common";

/**
 * The reviewer-facing Markdown for the outline and the breakdown is a
 * rendering of the JSON, not new thinking. An agent writing it re-emits
 * every fact token by token: on a 12-page regulation that cost about two
 * minutes per file and bought nothing the JSON did not already hold. So the
 * agents write JSON only and these functions render the Markdown.
 */

/** "עמ׳ 4" / "שקף 2" / "פסקה 7" for a block id, falling back to the id itself. */
export function citeLabel(blocks: Map<string, TextBlocks["blocks"][number]>, blockId: string): string {
  const b = blocks.get(blockId);
  if (!b) return blockId;
  if (b.page) return `עמ׳ ${b.page}`;
  if (b.slide) return `שקף ${b.slide}`;
  if (b.paragraph) return `פסקה ${b.paragraph}`;
  return blockId;
}

export function blockIndex(textBlocks: TextBlocks | null): Map<string, TextBlocks["blocks"][number]> {
  return new Map((textBlocks?.blocks ?? []).map((b) => [b.id, b]));
}

export function outlineToMarkdown(outline: Outline, textBlocks: TextBlocks | null): string {
  const blocks = blockIndex(textBlocks);
  const out: string[] = [];
  out.push(`# ${outline.title}`);
  if (outline.subtitle) out.push(`## ${outline.subtitle}`);
  out.push("");
  out.push(outline.audienceSummary);
  out.push("");
  out.push(`${outline.sections.length} פרקים · ${outline.slideBudgetTotal} שקפים`);
  out.push("");
  out.push("## מטרות למידה");
  out.push("");
  for (const o of outline.objectives) out.push(`- **${o.bloom}** — ${o.text}`);
  out.push("");

  outline.sections.forEach((s, i) => {
    out.push(`## ${i + 1}. ${s.title}`);
    out.push("");
    out.push(`*${s.slideBudget} שקפים*`);
    out.push("");
    out.push(s.purpose);
    if (s.keyFacts.length) {
      out.push("");
      out.push("**עובדות מפתח**");
      out.push("");
      for (const f of s.keyFacts) {
        const cites = f.cite.map((c) => citeLabel(blocks, c.blockId)).join(", ");
        out.push(`- ${f.text}${cites ? ` (${cites})` : ""}`);
      }
    }
    out.push("");
  });

  if (outline.revisionLog.length) {
    out.push("## היסטוריית שינויים");
    out.push("");
    for (const r of outline.revisionLog) out.push(`- סבב ${r.iteration}: ${r.summary}`);
    out.push("");
  }
  return out.join("\n");
}

const VISUAL_LABEL: Record<string, string> = {
  svg_diagram: "דיאגרמה",
  chart: "גרף",
  icon_grid: "רשת אייקונים",
  image: "תמונה מהמסמך",
  gsap_reveal: "חשיפה בשלבים",
  none: "ללא",
};

const VERDICT_LABEL: Record<string, string> = {
  SOURCED: "מהמסמך",
  STALE: "עלול להתיישן",
  UNSOURCED: "לא במסמך",
  DISTORTED: "עוות",
  WRONG: "סותר את המסמך",
};

export function breakdownToMarkdown(breakdown: Breakdown, facts: Facts | null): string {
  const claim = (id: string) => facts?.claims.find((c) => c.id === id);
  const out: string[] = [];
  out.push(`# ${breakdown.title}`);
  out.push("");
  out.push(`${breakdown.slides.length} שקפים`);
  out.push("");

  if (facts?.contradictions.length) {
    out.push("## סתירות בין המסמך לרשת");
    out.push("");
    for (const c of facts.contradictions) {
      out.push(`- **המסמך:** ${c.docSays}`);
      out.push(`  **הרשת:** ${c.webSays}`);
      if (c.sources.length) out.push(`  ${c.sources.join(" · ")}`);
    }
    out.push("");
  }

  for (const s of breakdown.slides) {
    out.push(`## שקף ${s.n} · ${s.title}`);
    out.push("");
    out.push(`*${s.layout} · ${VISUAL_LABEL[s.visual.type] ?? s.visual.type} · ביטחון ${Math.round(s.confidence * 100)}%*`);
    out.push("");
    out.push(`**${s.keyMessage}**`);
    if (s.body.length) {
      out.push("");
      for (const line of s.body) out.push(`- ${line}`);
    }
    if (s.visual.type !== "none") {
      out.push("");
      out.push(`**המחשה:** ${s.visual.spec}`);
    }
    const flagged = s.claimIds.map(claim).filter((c) => c && c.verdict !== "SOURCED");
    if (flagged.length) {
      out.push("");
      out.push("**טענות שדורשות תשומת לב**");
      out.push("");
      for (const c of flagged) {
        if (!c) continue;
        out.push(`- ${VERDICT_LABEL[c.verdict] ?? c.verdict}: ${c.text}${c.note ? ` — ${c.note}` : ""}`);
      }
    }
    out.push("");
    out.push(`**הערות למציג:** ${s.speakerNotes}`);
    out.push("");
  }

  if (breakdown.revisionLog.length) {
    out.push("## היסטוריית שינויים");
    out.push("");
    for (const r of breakdown.revisionLog) out.push(`- סבב ${r.iteration}: ${r.summary}`);
    out.push("");
  }
  return out.join("\n");
}
