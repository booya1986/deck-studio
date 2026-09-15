import { z } from "zod";

export const LayoutId = z.enum([
  "title", "agenda", "divider", "split", "centered", "cards", "process",
  "timeline", "quote", "comparison", "summary", "cta",
]);
export type LayoutId = z.infer<typeof LayoutId>;

const VISUAL_TYPES = ["svg_diagram", "chart", "icon_grid", "image", "gsap_reveal", "none"] as const;

/**
 * Agents confuse a layout id with a visual type ("timeline", "process") or use a
 * plain synonym ("diagram", "graph"). The meaning is unambiguous, and failing a
 * paid research run over a label is worse than mapping it. Anything not listed
 * here still fails validation.
 */
const VISUAL_SYNONYMS: Record<string, (typeof VISUAL_TYPES)[number]> = {
  timeline: "svg_diagram",
  process: "svg_diagram",
  diagram: "svg_diagram",
  flow: "svg_diagram",
  flowchart: "svg_diagram",
  graph: "chart",
  bar_chart: "chart",
  icons: "icon_grid",
  cards: "icon_grid",
  reveal: "gsap_reveal",
};

export const VisualType = z.preprocess(
  (v) => (typeof v === "string" ? (VISUAL_SYNONYMS[v.toLowerCase()] ?? v) : v),
  z.enum(VISUAL_TYPES),
);

export const Slide = z.object({
  n: z.number().int().positive(),
  sectionId: z.string(),
  layout: LayoutId,
  title: z.string(),
  keyMessage: z.string(),
  body: z.array(z.string()),
  visual: z.object({
    type: VisualType,
    /** What to draw, in words. For charts: series + values. For diagrams: nodes + flow. */
    spec: z.string(),
    /** design-system asset path when type === image */
    imagePath: z.string().optional(),
  }),
  speakerNotes: z.string(),
  claimIds: z.array(z.string()),
  /** 0..1, derived from fact verdicts */
  confidence: z.number().min(0).max(1),
});
export type Slide = z.infer<typeof Slide>;

export const Breakdown = z.object({
  title: z.string(),
  slides: z.array(Slide).min(1),
  revisionLog: z.array(z.object({ iteration: z.number(), summary: z.string() })).default([]),
});
export type Breakdown = z.infer<typeof Breakdown>;
