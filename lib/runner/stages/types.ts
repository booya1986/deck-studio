import type { StageId } from "@/lib/schema/project";
import type { RunEvent } from "@/lib/store/runlog";

export type StageContext = {
  projectId: string;
  stage: StageId;
  iteration: number;
  mode: "initial" | "revise";
  signal: AbortSignal;
  emit: (e: Omit<RunEvent, "ts">) => void;
};

export type StageOutcome = {
  sessionIds: string[];
  costUsd: number;
  numTurns: number;
};

export type StageModule = {
  id: StageId;
  run: (ctx: StageContext) => Promise<StageOutcome>;
};
