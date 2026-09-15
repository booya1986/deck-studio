import { StageId } from "@/lib/schema/project";
import { abortJob, runningJob, startStage } from "@/lib/runner/runner";
import { stageModule } from "@/lib/runner/stages";
import { fail, failure, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as { stage?: string; mode?: string };
    const stage = StageId.parse(body.stage);
    const mode = body.mode === "revise" ? "revise" : "initial";
    // Fire and forget: the run streams over SSE and its result lands in project.json.
    const { iteration } = await startStage({ projectId: id, stage, mode, module: stageModule(stage) });
    return ok({ started: true, stage, mode, iteration });
  } catch (e) {
    return failure(e, 409);
  }
}

/** Stop the running stage. It ends as `failed` with an "aborted" error and can be run again. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const job = runningJob(id);
    if (!job || !abortJob(id)) return fail("אין שלב שרץ כרגע", 409);
    return ok({ aborted: true, stage: job.stage });
  } catch (e) {
    return failure(e, 409);
  }
}
