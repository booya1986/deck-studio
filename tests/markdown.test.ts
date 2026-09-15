import { describe, expect, it } from "vitest";
import { breakdownToMarkdown, outlineToMarkdown } from "@/lib/render/markdown";
import type { Outline } from "@/lib/schema/outline";
import type { Breakdown } from "@/lib/schema/breakdown";
import type { Facts } from "@/lib/schema/facts";
import type { TextBlocks } from "@/lib/schema/common";

const textBlocks = {
  filename: "doc.pdf", kind: "pdf", language: "he", title: "מסמך", pageCount: 3,
  blocks: [{ id: "b1", kind: "paragraph", text: "טקסט", page: 4 }],
} as unknown as TextBlocks;

const outline: Outline = {
  title: "כותרת", subtitle: "תת", audienceSummary: "לבנקאים",
  objectives: [{ id: "o1", text: "יסווג פנייה", bloom: "יישום" }],
  sections: [{
    id: "s1", title: "פתיחה", purpose: "למקם", slideBudget: 2,
    keyFacts: [{ text: "העמלה עד 5 ש\"ח", cite: [{ blockId: "b1" }] }],
  }],
  slideBudgetTotal: 2,
  revisionLog: [{ iteration: 1, summary: "תוקן" }],
};

const breakdown: Breakdown = {
  title: "מצגת",
  slides: [{
    n: 1, sectionId: "s1", layout: "title", title: "שקף ראשון", keyMessage: "המסר",
    body: ["שורה"], visual: { type: "chart", spec: "עמודות" }, speakerNotes: "לומר",
    claimIds: ["c1", "c2"], confidence: 0.7,
  }],
  revisionLog: [],
};

const facts: Facts = {
  claims: [
    { id: "c1", text: "טענה מעוגנת", sectionId: "s1", verdict: "SOURCED" },
    { id: "c2", text: "טענה מתיישנת", sectionId: "s1", verdict: "STALE", note: "תלוי בתקנה" },
  ],
  contradictions: [{ claimId: "c1", docSays: "כך", webSays: "אחרת", sources: ["https://x"] }],
};

describe("reviewer markdown", () => {
  it("renders the outline with page citations and objectives", () => {
    const md = outlineToMarkdown(outline, textBlocks);
    expect(md).toContain("# כותרת");
    expect(md).toContain("**יישום** — יסווג פנייה");
    expect(md).toContain("(עמ׳ 4)");
    expect(md).toContain("סבב 1: תוקן");
  });

  it("falls back to the block id when the document is unavailable", () => {
    expect(outlineToMarkdown(outline, null)).toContain("(b1)");
  });

  it("renders the breakdown with contradictions and only non-sourced verdicts", () => {
    const md = breakdownToMarkdown(breakdown, facts);
    expect(md).toContain("## שקף 1 · שקף ראשון");
    expect(md).toContain("סתירות בין המסמך לרשת");
    expect(md).toContain("עלול להתיישן: טענה מתיישנת — תלוי בתקנה");
    expect(md).not.toContain("טענה מעוגנת");
    expect(md).toContain("ביטחון 70%");
  });

  it("renders without facts", () => {
    expect(breakdownToMarkdown(breakdown, null)).toContain("**המסר**");
  });
});
