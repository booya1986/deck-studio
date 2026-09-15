import { Brief, slideRangeForDuration } from "@/lib/schema/brief";
import { createProject, listProjects } from "@/lib/store/projects";
import { kindOf } from "@/lib/extract";
import { startStage } from "@/lib/runner/runner";
import { stageModule } from "@/lib/runner/stages";
import { failure, fail, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function GET() {
  return ok(await listProjects());
}

const MAX_BYTES = 40 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("לא צורף קובץ מקור");
    if (file.size > MAX_BYTES) return fail("הקובץ גדול מ‑40MB");

    const kind = kindOf(file.name);
    if (!kind) return fail("נתמכים קבצי PDF, DOCX ו‑PPTX בלבד");

    const durationMin = Number(form.get("durationMin") ?? 15);
    const brief = Brief.parse({
      audience: String(form.get("audience") ?? "").trim(),
      durationMin,
      slideRange: slideRangeForDuration(durationMin),
      goal: String(form.get("goal") ?? "").trim(),
      deckType: String(form.get("deckType") ?? "training"),
      notes: String(form.get("notes") ?? "").trim() || undefined,
      aiImages: form.get("aiImages") === "true",
    });

    const name = String(form.get("name") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
    const project = await createProject({
      name,
      brief,
      file: { filename: file.name, kind, bytes: Buffer.from(await file.arrayBuffer()) },
    });
    // Uploading a document starts the first stage right away; it still stops at its gate.
    try {
      await startStage({ projectId: project.id, stage: "design_system", mode: "initial", module: stageModule("design_system") });
    } catch {
      // The project exists either way; the reviewer can start the stage by hand.
    }
    return ok(project);
  } catch (e) {
    return failure(e);
  }
}
