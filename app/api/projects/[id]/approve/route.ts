import { StageId, nextStage } from "@/lib/schema/project";
import { approveStage, startStage } from "@/lib/runner/runner";
import { stageModule } from "@/lib/runner/stages";
import { loadProject } from "@/lib/store/projects";
import { failure, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * Approve a gate and immediately start the next stage, so the reviewer moves
 * from one gate to the next without a separate "run" click. The next stage
 * still stops at its own gate.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const { stage: raw } = (await request.json()) as { stage?: string };
    const stage = StageId.parse(raw);
    await approveStage(id, stage);

    const next = nextStage(stage);
    let started: StageId | null = null;
    let startError: string | null = null;
    if (next !== "done") {
      try {
        await startStage({ projectId: id, stage: next, mode: "initial", module: stageModule(next) });
        started = next;
      } catch (e) {
        // The approval stands; the reviewer can start the next stage by hand.
        startError = e instanceof Error ? e.message : String(e);
      }
    }
    return ok({ ...(await loadProject(id)), started, startError });
  } catch (e) {
    return failure(e, 409);
  }
}
