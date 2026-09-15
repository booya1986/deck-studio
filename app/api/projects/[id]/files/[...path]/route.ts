import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { isValidProjectId, projectDir } from "@/lib/store/paths";
import { fail } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

const inside = (root: string, target: string) => target === root || target.startsWith(root + path.sep);

/** Serves project artifacts so the brand board and the deck can load in an iframe. */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]/files/[...path]">) {
  const { id, path: segments } = await ctx.params;
  // Params arrive percent-decoded: "..%2F.." would otherwise walk out of the data folder.
  if (!isValidProjectId(id)) return fail("לא נמצא", 404);

  const root = projectDir(id);
  const target = path.resolve(root, ...segments);
  if (!inside(root, target)) return fail("נתיב לא חוקי", 400);

  try {
    // Check again after resolving symlinks, so a link inside the project cannot point outside it.
    const [realRoot, realTarget] = await Promise.all([fs.realpath(root), fs.realpath(target)]);
    if (!inside(realRoot, realTarget)) return fail("נתיב לא חוקי", 400);

    const stat = await fs.stat(realTarget);
    if (!stat.isFile()) return fail("לא נמצא", 404);
    const type = MIME[path.extname(realTarget).toLowerCase()] ?? "application/octet-stream";
    const body = Readable.toWeb(createReadStream(realTarget)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(stat.size),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return fail("לא נמצא", 404);
  }
}
