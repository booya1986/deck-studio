import { z } from "zod";

export const Provenance = z.enum(["extracted", "inferred", "user"]);
export type Provenance = z.infer<typeof Provenance>;

export const prov = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value,
    provenance: Provenance,
    /** 0..1 */
    confidence: z.number().min(0).max(1),
  });

/** Where a text block lives inside the source document. */
export const Locator = z.object({
  blockId: z.string(),
  page: z.number().int().positive().optional(),
  slide: z.number().int().positive().optional(),
  paragraph: z.number().int().nonnegative().optional(),
  quote: z.string().optional(),
});
export type Locator = z.infer<typeof Locator>;

export const SourceBlock = z.object({
  id: z.string(),
  kind: z.enum(["title", "heading", "paragraph", "list", "table", "caption", "other"]),
  level: z.number().int().min(1).max(6).optional(),
  text: z.string(),
  page: z.number().int().positive().optional(),
  slide: z.number().int().positive().optional(),
  paragraph: z.number().int().nonnegative().optional(),
  fontSize: z.number().optional(),
});
export type SourceBlock = z.infer<typeof SourceBlock>;

export const TextBlocks = z.object({
  filename: z.string(),
  kind: z.enum(["pdf", "docx", "pptx"]),
  language: z.enum(["he", "en", "mixed", "unknown"]),
  title: z.string().optional(),
  pageCount: z.number().int().nonnegative().optional(),
  blocks: z.array(SourceBlock),
});
export type TextBlocks = z.infer<typeof TextBlocks>;
