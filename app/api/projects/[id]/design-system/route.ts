import { promises as fs } from "node:fs";
import path from "node:path";
import { BrandDecision } from "@/lib/schema/design-system";
import { emitDesignSystem } from "@/lib/design-system/emit";
import { loadProject } from "@/lib/store/projects";
import { pp } from "@/lib/store/paths";
import { runningJob } from "@/lib/runner/runner";
import { failure, fail, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const paths = pp(id);
    const decision = BrandDecision.parse(JSON.parse(await fs.readFile(paths.ds.decision, "utf8")));
    const manifest = JSON.parse(await fs.readFile(paths.ds.manifest, "utf8"));
    return ok({ decision, manifest });
  } catch (e) {
    return failure(e, 404);
  }
}

/**
 * Gate 1 edits. The reviewer's values are marked `user` so the brand board
 * shows what a person changed, then the emitter re-runs. No agent involved.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    if (runningJob(id)) return fail("לא ניתן לערוך בזמן ריצה", 409);

    const project = await loadProject(id);
    const paths = pp(id);
    const current = BrandDecision.parse(JSON.parse(await fs.readFile(paths.ds.decision, "utf8")));
    const patch = (await request.json()) as Record<string, unknown>;

    const next = applyPatch(current, patch);
    await fs.writeFile(paths.ds.decision, JSON.stringify(BrandDecision.parse(next), null, 2) + "\n", "utf8");
    const manifest = await emitDesignSystem({
      dsDir: paths.ds.dir,
      extractionDir: paths.extraction.dir,
      sourceFile: project.source.filename,
    });
    return ok({ manifest });
  } catch (e) {
    return failure(e);
  }
}

type Patch = {
  orgName?: string;
  mode?: "light" | "dark";
  colors?: Partial<Record<"primary" | "secondary" | "accent" | "neutralSeed", string>>;
  fonts?: Partial<Record<"heading" | "body", string>>;
  logoPath?: string | null;
  logoBackground?: "light" | "dark" | "transparent";
};

function applyPatch(current: BrandDecision, raw: Record<string, unknown>): BrandDecision {
  const patch = raw as Patch;
  const next: BrandDecision = structuredClone(current);

  if (patch.orgName) next.orgName = patch.orgName.trim();
  if (patch.mode) next.colors.mode = patch.mode;

  for (const key of ["primary", "secondary", "accent", "neutralSeed"] as const) {
    const value = patch.colors?.[key];
    if (value === undefined) continue;
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`ערך צבע לא תקין עבור ${key}`);
    // A value a person typed is authoritative, and labelled as such.
    next.colors[key] = { value: value.toLowerCase(), provenance: "user", confidence: 1 };
  }

  for (const role of ["heading", "body"] as const) {
    const family = patch.fonts?.[role];
    if (!family) continue;
    next.fonts[role] = {
      value: { ...next.fonts[role].value, family, originalFamily: next.fonts[role].value.originalFamily },
      provenance: "user",
      confidence: 1,
    };
  }

  if (patch.logoBackground) next.logo.background = patch.logoBackground;
  if (patch.logoPath !== undefined) {
    next.logo.path = patch.logoPath ?? undefined;
    next.logo.provenance = "user";
    next.logo.cropFromPage = undefined;
    next.logo.needsUpload = !patch.logoPath;
  }
  return next;
}

/** Logo upload: the file lands in the design system and the decision points at it. */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    if (runningJob(id)) return fail("לא ניתן לערוך בזמן ריצה", 409);

    const form = await request.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) return fail("לא צורף קובץ לוגו");
    const ext = path.extname(file.name).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".svg", ".webp"].includes(ext)) {
      return fail("נתמכים קבצי PNG, JPG, SVG ו‑WEBP");
    }

    const project = await loadProject(id);
    const paths = pp(id);
    await fs.mkdir(paths.ds.logoDir, { recursive: true });
    const rel = path.posix.join("assets", "logo", `logo${ext}`);
    await fs.writeFile(path.join(paths.ds.dir, rel), Buffer.from(await file.arrayBuffer()));

    const decision = BrandDecision.parse(JSON.parse(await fs.readFile(paths.ds.decision, "utf8")));
    decision.logo = { ...decision.logo, path: rel, provenance: "user", needsUpload: false, cropFromPage: undefined };
    await fs.writeFile(paths.ds.decision, JSON.stringify(decision, null, 2) + "\n", "utf8");

    const manifest = await emitDesignSystem({
      dsDir: paths.ds.dir,
      extractionDir: paths.extraction.dir,
      sourceFile: project.source.filename,
    });
    return ok({ manifest, logo: rel });
  } catch (e) {
    return failure(e);
  }
}
