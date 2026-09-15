import { z } from "zod";
import { Locator } from "./common";

export const Outline = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  audienceSummary: z.string(),
  objectives: z.array(z.object({ id: z.string(), text: z.string(), bloom: z.string() })),
  sections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      purpose: z.string(),
      slideBudget: z.number().int().positive(),
      keyFacts: z.array(z.object({ text: z.string(), cite: z.array(Locator) })),
    }),
  ),
  slideBudgetTotal: z.number().int().positive(),
  revisionLog: z.array(z.object({ iteration: z.number(), summary: z.string() })).default([]),
});
export type Outline = z.infer<typeof Outline>;
