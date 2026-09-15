import { promises as fs } from "node:fs";
import path from "node:path";
import { BrandDecision } from "@/lib/schema/design-system";
import { extractInChildProcess } from "@/lib/extract/run";
import { emitDesignSystem } from "@/lib/design-system/emit";
import { genericDecision, genericSkillDoc, hasNoBrandSignal } from "@/lib/design-system/generic";
import { loadProject } from "@/lib/store/projects";
import { pp, REPO_ROOT } from "@/lib/store/paths";
import { MODELS, READ_TOOLS, WRITE_TOOLS, runAgent } from "../sdk";
import { bashPolicyText } from "../bash-policy";
import { loadPrompt, schemaFor, stageBudget } from "./shared";
import type { StageContext, StageModule, StageOutcome } from "./types";

export const designSystemStage: StageModule = {
  id: "design_system",
  async run(ctx: StageContext): Promise<StageOutcome> {
    const project = await loadProject(ctx.projectId);
    const paths = pp(ctx.projectId);
    const sourcePath = path.join(paths.sourceDir, project.source.filename);

    // 1. Deterministic pass. Cheap enough to redo on a revision.
    ctx.emit({ stage: ctx.stage, iteration: ctx.iteration, type: "progress", payload: { step: "extract" } });
    const { textBlocks, candidates } = await extractInChildProcess({
      sourcePath,
      outDir: paths.extraction.dir,
    });
    ctx.emit({
      stage: ctx.stage,
      iteration: ctx.iteration,
      type: "progress",
      payload: {
        step: "extracted",
        blocks: textBlocks.blocks.length,
        colors: candidates.colors.length,
        fonts: candidates.fonts.length,
        images: candidates.images.length,
        pages: candidates.pages.length,
      },
    });

    await fs.mkdir(paths.ds.dir, { recursive: true });

    // 2a. A document with no brand signal gets the generic template without an agent run.
    if (ctx.mode === "initial" && hasNoBrandSignal(candidates)) {
      const language = textBlocks.language === "en" ? "en" : "he";
      const decision = genericDecision({
        orgName: candidates.text.orgNameGuess ?? project.name,
        language,
      });
      await fs.writeFile(paths.ds.decision, JSON.stringify(decision, null, 2) + "\n", "utf8");
      await emitDesignSystem({
        dsDir: paths.ds.dir,
        extractionDir: paths.extraction.dir,
        sourceFile: project.source.filename,
      });
      await fs.writeFile(paths.ds.skill, genericSkillDoc(language, decision.orgName), "utf8");
      ctx.emit({
        stage: ctx.stage,
        iteration: ctx.iteration,
        type: "progress",
        payload: { step: "generic_template", reason: "no brand signal in document" },
      });
      return { sessionIds: [], costUsd: 0, numTurns: 0 };
    }

    // 2b. The agent decides what the brand is.
    const commands = ["pnpm ds:emit"];
    const prompt = await buildPrompt(ctx, project.source.filename, bashPolicyText(commands));
    const result = await runAgent({
      stage: ctx.stage,
      iteration: ctx.iteration,
      cwd: paths.root,
      prompt,
      systemPrompt: await loadPrompt("brand-analyst"),
      model: MODELS.main,
      effort: "high",
      maxTurns: 60,
      maxBudgetUsd: stageBudget("design_system"),
      allowedTools: [...READ_TOOLS, ...WRITE_TOOLS, "Bash"],
      allowedCommands: commands,
      signal: ctx.signal,
      onEvent: ctx.emit,
    });

    if (result.isError) throw new Error(`סוכן המותג נכשל: ${result.errorSubtype ?? "שגיאה"}`);

    // 3. Validate, then emit from our own code so the output is always consistent.
    await validateDecision(paths.ds.decision);
    await emitDesignSystem({
      dsDir: paths.ds.dir,
      extractionDir: paths.extraction.dir,
      sourceFile: project.source.filename,
    });
    await ensureSkillDoc(paths.ds.skill);

    return { sessionIds: [result.sessionId].filter((s): s is string => !!s), costUsd: result.costUsd, numTurns: result.numTurns };
  },
};

async function buildPrompt(ctx: StageContext, sourceFilename: string, bashPolicy: string): Promise<string> {
  const paths = pp(ctx.projectId);
  const rel = (p: string) => path.relative(paths.root, p);
  const schema = await schemaFor("brand-decision");

  const base = `Source document: ${sourceFilename}
Extraction output: ${rel(paths.extraction.dir)}/
Write your decision to: ${rel(paths.ds.decision)}
Write the brand rules to: ${rel(paths.ds.skill)}

The decision file must satisfy this JSON schema:

\`\`\`json
${schema}
\`\`\`

${bashPolicy}

Start by reading ${rel(paths.extraction.candidates)}, then look at the rendered pages and the images.`;

  if (ctx.mode === "initial") return base;

  const comments = await commentBlock(ctx);
  const current = await fs.readFile(paths.ds.decision, "utf8").catch(() => "{}");
  return `${base}

This is revision ${ctx.iteration}. Your previous decision was:

\`\`\`json
${current}
\`\`\`

The reviewer left these comments. Apply every one of them, and change nothing else:

${comments}`;
}

async function commentBlock(ctx: StageContext): Promise<string> {
  const { unresolvedComments } = await import("@/lib/store/projects");
  const comments = await unresolvedComments(ctx.projectId, ctx.stage);
  return comments
    .map((c) => `- ${c.target.kind === "general" ? "כללי" : `${c.target.kind} ${c.target.ref}`}: ${c.text}`)
    .join("\n");
}

async function validateDecision(file: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw new Error("הסוכן לא כתב brand-decision.json תקין");
  }
  const parsed = BrandDecision.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`brand-decision.json אינו תואם לסכימה: ${issues}`);
  }
}

/** The brand rules doc is what every later stage reads; never let it be missing. */
async function ensureSkillDoc(file: string) {
  try {
    const text = await fs.readFile(file, "utf8");
    if (text.trim().length > 200) return;
  } catch {
    // fall through
  }
  throw new Error("הסוכן לא כתב מסמך כללי מותג (SKILL.md)");
}

export { REPO_ROOT };
