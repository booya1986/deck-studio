import { EventEmitter } from "node:events";
import { STAGE_ORDER, nextStage, prevStage, type StageId, type ProjectState } from "@/lib/schema/project";
import { appendRunEvent, type RunEvent } from "@/lib/store/runlog";
import { loadProject, mutateProject, resolveComments, unresolvedComments } from "@/lib/store/projects";
import type { StageContext, StageModule } from "./stages/types";

export type RunMode = "initial" | "revise";

type Job = {
  projectId: string;
  stage: StageId;
  iteration: number;
  startedAt: number;
  controller: AbortController;
  promise: Promise<void>;
};

type RunnerState = {
  jobs: Map<string, Job>;
  emitters: Map<string, EventEmitter>;
};

/** Survives Next.js dev hot reloads, which would otherwise drop running jobs. */
const globalRef = globalThis as unknown as { __deckStudioRunner?: RunnerState };
const state: RunnerState = (globalRef.__deckStudioRunner ??= {
  jobs: new Map(),
  emitters: new Map(),
});

export function emitterFor(projectId: string): EventEmitter {
  let e = state.emitters.get(projectId);
  if (!e) {
    e = new EventEmitter();
    e.setMaxListeners(50);
    state.emitters.set(projectId, e);
  }
  return e;
}

export function runningJob(projectId: string): { stage: StageId; iteration: number } | null {
  const job = state.jobs.get(projectId);
  return job ? { stage: job.stage, iteration: job.iteration } : null;
}

export function abortJob(projectId: string): boolean {
  const job = state.jobs.get(projectId);
  if (!job) return false;
  job.controller.abort();
  return true;
}

export class StageError extends Error {}

/** Guard rails for what may run next, given the project state on disk. */
export async function assertCanRun(project: ProjectState, stage: StageId, mode: RunMode) {
  if (state.jobs.has(project.id)) throw new StageError("כבר רצה משימה בפרויקט הזה");
  const st = project.stages[stage];
  if (!st) throw new StageError(`שלב לא מוכר: ${stage}`);

  if (mode === "initial") {
    const prev = prevStage(stage);
    if (prev && project.stages[prev]?.status !== "approved") {
      throw new StageError("השלב הקודם עדיין לא אושר");
    }
    if (!["idle", "failed", "stale"].includes(st.status)) {
      throw new StageError(`לא ניתן להריץ שלב במצב ${st.status}`);
    }
  } else {
    if (st.status !== "awaiting_approval") throw new StageError("אפשר לתקן רק שלב שממתין לאישור");
    const open = await unresolvedComments(project.id, stage);
    if (!open.length) throw new StageError("אין הערות פתוחות לתקן");
  }
}

/** Start a stage in the background. Returns once the job is registered. */
export async function startStage(args: {
  projectId: string;
  stage: StageId;
  mode: RunMode;
  module: StageModule;
}): Promise<{ iteration: number }> {
  const project = await loadProject(args.projectId);
  await assertCanRun(project, args.stage, args.mode);

  const iteration = args.mode === "revise" ? project.stages[args.stage]!.iteration + 1 : 1;
  const controller = new AbortController();
  const emitter = emitterFor(args.projectId);

  const HEARTBEAT_MS = 30_000;
  let lastBeat = Date.now();
  const publish = (e: Omit<RunEvent, "ts">) => {
    const full: RunEvent = { ...e, ts: new Date().toISOString() };
    void appendRunEvent(args.projectId, full);
    emitter.emit("event", full);
    // Every event proves the stage is alive; record that at most every 30s so a
    // reader in another process does not mistake a long stage for a crashed one.
    if (Date.now() - lastBeat > HEARTBEAT_MS) {
      lastBeat = Date.now();
      void mutateProject(args.projectId, (s) => {
        const st = s.stages[args.stage]!;
        if (st.status === "running" && st.lastRun) st.lastRun.heartbeatAt = full.ts;
      }).catch(() => undefined);
    }
  };

  await mutateProject(args.projectId, (s) => {
    const st = s.stages[args.stage]!;
    st.status = "running";
    st.iteration = iteration;
    st.lastRun = { startedAt: new Date().toISOString() };
    s.currentStage = args.stage;
    // Re-running a stage invalidates everything downstream.
    for (const later of STAGE_ORDER.slice(STAGE_ORDER.indexOf(args.stage) + 1)) {
      const ls = s.stages[later];
      if (ls && ls.status !== "idle") ls.status = "stale";
    }
  });

  const ctx: StageContext = {
    projectId: args.projectId,
    stage: args.stage,
    iteration,
    mode: args.mode,
    signal: controller.signal,
    emit: publish,
  };

  const promise = (async () => {
    try {
      const outcome = await args.module.run(ctx);
      await mutateProject(args.projectId, (s) => {
        const st = s.stages[args.stage]!;
        st.status = "awaiting_approval";
        st.sessionIds = [...st.sessionIds, ...outcome.sessionIds].filter(Boolean);
        st.lastRun = {
          startedAt: st.lastRun?.startedAt ?? new Date().toISOString(),
          endedAt: new Date().toISOString(),
          costUsd: outcome.costUsd,
          numTurns: outcome.numTurns,
        };
        s.totalCostUsd = Number((s.totalCostUsd + outcome.costUsd).toFixed(4));
      });
      if (args.mode === "revise") await resolveComments(args.projectId, args.stage, iteration);
      publish({ stage: args.stage, iteration, type: "progress", payload: { done: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const spent = (error as { costUsd?: number }).costUsd ?? 0;
      const turns = (error as { numTurns?: number }).numTurns ?? 0;
      await mutateProject(args.projectId, (s) => {
        const st = s.stages[args.stage]!;
        st.status = "failed";
        st.lastRun = {
          startedAt: st.lastRun?.startedAt ?? new Date().toISOString(),
          endedAt: new Date().toISOString(),
          error: message,
          costUsd: spent || undefined,
          numTurns: turns || undefined,
        };
        s.totalCostUsd = Number((s.totalCostUsd + spent).toFixed(4));
      });
      publish({ stage: args.stage, iteration, type: "error", payload: { message } });
    } finally {
      state.jobs.delete(args.projectId);
      emitter.emit("event", {
        ts: new Date().toISOString(),
        stage: args.stage,
        iteration,
        type: "progress",
        payload: { finished: true },
      } satisfies RunEvent);
    }
  })();

  state.jobs.set(args.projectId, {
    projectId: args.projectId,
    stage: args.stage,
    iteration,
    startedAt: Date.now(),
    controller,
    promise,
  });

  return { iteration };
}

export async function approveStage(projectId: string, stage: StageId): Promise<ProjectState> {
  return mutateProject(projectId, (s) => {
    const st = s.stages[stage]!;
    if (st.status !== "awaiting_approval") throw new StageError("השלב אינו ממתין לאישור");
    st.status = "approved";
    s.currentStage = nextStage(stage);
  });
}

/** Await a running job — used by tests and by the CLI, never by a request handler. */
export async function waitForJob(projectId: string): Promise<void> {
  await state.jobs.get(projectId)?.promise;
}
