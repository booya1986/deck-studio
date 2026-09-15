import { z } from "zod";

export const DeckType = z.enum(["training", "procedure", "onboarding", "policy_update", "workshop"]);
export type DeckType = z.infer<typeof DeckType>;

export const Brief = z.object({
  audience: z.string().min(1),
  durationMin: z.number().int().min(3).max(120),
  slideRange: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  goal: z.string().min(1),
  deckType: DeckType,
  notes: z.string().optional(),
  aiImages: z.boolean().default(false),
});
export type Brief = z.infer<typeof Brief>;

/** Duration → slide range: about one slide a minute for short sessions, slower for long ones. */
export function slideRangeForDuration(min: number): [number, number] {
  if (min <= 7) return [5, 7];
  if (min <= 15) return [10, 15];
  if (min <= 30) return [20, 30];
  if (min <= 60) return [35, 45];
  return [45, 60];
}
