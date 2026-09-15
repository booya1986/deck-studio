import { promises as fs } from "node:fs";
import { pp } from "@/lib/store/paths";
import { fail, failure, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Typed JSON artifacts for the gate views. */
export async function GET(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const name = new URL(request.url).searchParams.get("name");
    const paths = pp(id);
    const files: Record<string, string> = {
      textBlocks: paths.extraction.textBlocks,
      outline: paths.outline.json,
      facts: paths.research.facts,
      breakdown: paths.research.breakdownJson,
      qa: paths.qa.report(Number(new URL(request.url).searchParams.get("iteration") ?? 1)),
    };
    const file = name ? files[name] : undefined;
    if (!file) return fail("artifact לא מוכר", 400);
    try {
      return ok(JSON.parse(await fs.readFile(file, "utf8")));
    } catch {
      return fail("הקובץ עדיין לא קיים", 404);
    }
  } catch (e) {
    return failure(e);
  }
}
