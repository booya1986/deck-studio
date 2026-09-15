import { promises as fs } from "node:fs";
import { loadProject, readComments } from "@/lib/store/projects";
import { pp } from "@/lib/store/paths";
import { runningJob } from "@/lib/runner/runner";
import { failure, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const project = await loadProject(id);
    const paths = pp(id);
    const has = async (file: string) => {
      try {
        await fs.access(file);
        return true;
      } catch {
        return false;
      }
    };
    // The latest iteration that carries a judge report is the one the gate shows.
    const iterations = await fs.readdir(paths.qa.dir).then(
      (names) => names.map((n) => Number(n.match(/^iter-(\d+)$/)?.[1] ?? 0)).filter(Boolean).sort((a, b) => b - a),
      () => [] as number[],
    );
    let qaIterations = 0;
    for (const i of iterations) {
      if (await has(paths.qa.report(i))) {
        qaIterations = i;
        break;
      }
    }
    return ok({
      project,
      comments: await readComments(id),
      running: runningJob(id),
      qaIterations,
      artifacts: {
        brandBoard: await has(paths.ds.brandBoard),
        brandDecision: await has(paths.ds.decision),
        outline: await has(paths.outline.json),
        breakdown: await has(paths.research.breakdownJson),
        deck: await has(paths.deck.index),
      },
    });
  } catch (e) {
    return failure(e, 404);
  }
}
