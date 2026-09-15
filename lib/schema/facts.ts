import { z } from "zod";
import { Locator } from "./common";

export const Verdict = z.enum(["SOURCED", "DISTORTED", "UNSOURCED", "WRONG", "STALE"]);
export type Verdict = z.infer<typeof Verdict>;

export const Facts = z.object({
  claims: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      sectionId: z.string(),
      verdict: Verdict,
      docQuote: z.string().optional(),
      locator: Locator.optional(),
      webSources: z.array(z.object({ url: z.string(), title: z.string() })).optional(),
      note: z.string().optional(),
      /** The lead checked this claim itself because the fact-checker could not be dispatched. */
      selfChecked: z.boolean().optional(),
    }),
  ),
  contradictions: z.array(
    z.object({
      claimId: z.string(),
      docSays: z.string(),
      webSays: z.string(),
      sources: z.array(z.string()),
    }),
  ),
});
export type Facts = z.infer<typeof Facts>;
