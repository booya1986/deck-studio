import { z } from "zod";

export const QaIssue = z.object({
  slide: z.number().int().nonnegative(),
  severity: z.enum(["blocker", "fix", "consider"]),
  category: z.enum(["overflow", "rtl", "token", "font", "contrast", "parity", "visual", "console", "text"]),
  issue: z.string(),
  fixHint: z.string(),
  source: z.enum(["auto", "judge", "user"]),
  /** css selector or text snippet when known */
  where: z.string().optional(),
});
export type QaIssue = z.infer<typeof QaIssue>;

export const QaReport = z.object({
  iteration: z.number().int().nonnegative(),
  issues: z.array(QaIssue),
  summary: z.object({ slides: z.number(), clean: z.number() }),
  screenshots: z.array(z.string()).default([]),
});
export type QaReport = z.infer<typeof QaReport>;
