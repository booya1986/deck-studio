import { StageId } from "@/lib/schema/project";
import { addComment, deleteComment, loadProject, readComments } from "@/lib/store/projects";
import { failure, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    return ok(await readComments(id));
  } catch (e) {
    return failure(e, 404);
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      stage?: string;
      text?: string;
      target?: { kind?: string; ref?: string };
    };
    const stage = StageId.parse(body.stage);
    const text = String(body.text ?? "").trim();
    if (!text) return failure(new Error("הערה ריקה"));
    const project = await loadProject(id);
    const comment = await addComment(id, {
      stage,
      iteration: project.stages[stage]?.iteration ?? 0,
      target: {
        kind: (body.target?.kind ?? "general") as "general" | "section" | "slide",
        ref: body.target?.ref,
      },
      text,
    });
    return ok(comment);
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const commentId = new URL(request.url).searchParams.get("commentId");
    if (!commentId) return failure(new Error("חסר מזהה הערה"));
    await deleteComment(id, commentId);
    return ok({ deleted: commentId });
  } catch (e) {
    return failure(e);
  }
}
