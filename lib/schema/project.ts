import { z } from "zod";
import { Brief } from "./brief";

export const StageId = z.enum(["design_system", "outline", "research", "build", "qa"]);
export type StageId = z.infer<typeof StageId>;
export const STAGE_ORDER: StageId[] = ["design_system", "outline", "research", "build", "qa"];

export const StageStatus = z.enum(["idle", "running", "awaiting_approval", "approved", "failed", "stale"]);
export type StageStatus = z.infer<typeof StageStatus>;

export const StageState = z.object({
  status: StageStatus,
  iteration: z.number().int().nonnegative(),
  sessionIds: z.array(z.string()),
  lastRun: z
    .object({
      startedAt: z.string(),
      /** Touched by the runner while the stage is alive, so a long stage is not mistaken for a crashed one. */
      heartbeatAt: z.string().optional(),
      endedAt: z.string().optional(),
      costUsd: z.number().optional(),
      numTurns: z.number().optional(),
      error: z.string().optional(),
    })
    .optional(),
});
export type StageState = z.infer<typeof StageState>;

export const ProjectState = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  brief: Brief,
  source: z.object({
    filename: z.string(),
    kind: z.enum(["pdf", "docx", "pptx"]),
    sha256: z.string(),
    bytes: z.number(),
  }),
  currentStage: z.union([StageId, z.literal("done")]),
  stages: z.record(StageId, StageState),
  totalCostUsd: z.number(),
});
export type ProjectState = z.infer<typeof ProjectState>;

export function emptyStage(): StageState {
  return { status: "idle", iteration: 0, sessionIds: [] };
}
export function nextStage(stage: StageId): StageId | "done" {
  const i = STAGE_ORDER.indexOf(stage);
  return i === STAGE_ORDER.length - 1 ? "done" : STAGE_ORDER[i + 1];
}
export function prevStage(stage: StageId): StageId | null {
  const i = STAGE_ORDER.indexOf(stage);
  return i === 0 ? null : STAGE_ORDER[i - 1];
}
