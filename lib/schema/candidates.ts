import { z } from "zod";

export const FontRef = z.object({
  family: z.string(),
  script: z.enum(["hebrew", "latin", "unknown"]).default("unknown"),
});

/** Deterministic extraction output: everything the brand-analyst agent looks at. */
export const BrandCandidates = z.object({
  kind: z.enum(["pdf", "docx", "pptx"]),
  /** Rendered page PNGs (PDF only), relative to the extraction dir */
  pages: z.array(z.string()),
  /** docProps thumbnail for OOXML, relative path */
  thumbnail: z.string().optional(),
  /** OOXML theme (if present) */
  theme: z
    .object({
      colors: z.record(z.string(), z.string()),
      majorFont: FontRef.optional(),
      minorFont: FontRef.optional(),
    })
    .optional(),
  colors: z.array(
    z.object({
      hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      count: z.number(),
      sources: z.array(z.enum(["theme", "run", "shape", "fill", "pdf_op", "pixel"])),
    }),
  ),
  fonts: z.array(
    z.object({
      family: z.string(),
      count: z.number(),
      script: z.enum(["hebrew", "latin", "unknown"]),
      embedded: z.boolean().optional(),
    }),
  ),
  images: z.array(
    z.object({
      path: z.string(),
      w: z.number(),
      h: z.number(),
      page: z.number().optional(),
      inHeader: z.boolean(),
      onMaster: z.boolean(),
      logoScore: z.number(),
      format: z.string(),
      convertible: z.boolean(),
    }),
  ),
  text: z.object({
    title: z.string().optional(),
    headings: z.array(z.string()),
    orgNameGuess: z.string().optional(),
  }),
});
export type BrandCandidates = z.infer<typeof BrandCandidates>;
