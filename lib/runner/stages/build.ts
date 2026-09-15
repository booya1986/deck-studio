import { promises as fs } from "node:fs";
import path from "node:path";
import { Breakdown } from "@/lib/schema/breakdown";
import { loadProject } from "@/lib/store/projects";
import { pp, TEMPLATES_DIR } from "@/lib/store/paths";
import { MODELS, READ_TOOLS, WRITE_TOOLS } from "../sdk";
import { bashPolicyText } from "../bash-policy";
import { briefText, commentBlock, loadPrompt, runWithValidation, stageBudget } from "./shared";
import type { StageContext, StageModule, StageOutcome } from "./types";

export const BUILD_COMMANDS = ["pnpm deck:assemble", "pnpm deck:qa"];

export const buildStage: StageModule = {
  id: "build",
  async run(ctx: StageContext): Promise<StageOutcome> {
    const project = await loadProject(ctx.projectId);
    const paths = pp(ctx.projectId);
    const rel = (p: string) => path.relative(paths.root, p);
    await fs.mkdir(paths.deck.dir, { recursive: true });

    const breakdown = Breakdown.parse(JSON.parse(await fs.readFile(paths.research.breakdownJson, "utf8")));

    const base = `${briefText(project)}

Brand rules: ${rel(paths.ds.skill)}
Tokens: ${rel(paths.ds.tokensDir)}/*.css (manifest at ${rel(paths.ds.manifest)})
Template catalogue: ${path.relative(paths.root, TEMPLATES_DIR)}/LAYOUTS.md, COMPONENTS.md, MOTION.md
Breakdown: ${rel(paths.research.breakdownJson)} (${breakdown.slides.length} slides)
Write: ${rel(paths.deck.slides)} and ${rel(paths.deck.slideStyles)}
Then run \`pnpm deck:assemble\` and \`pnpm deck:qa --quick\` from this folder.

${bashPolicyText(BUILD_COMMANDS)}`;

    const prompt =
      ctx.mode === "initial"
        ? base
        : `${base}

This is fix round ${ctx.iteration}. The deck already exists. The reviewer left these comments; fix exactly
these, on exactly these slides, and leave every other slide untouched:

${await commentBlock(ctx)}`;

    return runWithValidation({
      ctx,
      cwd: paths.root,
      prompt,
      systemPrompt: await loadPrompt("deck-builder"),
      model: MODELS.main,
      effort: "high",
      maxTurns: 80,
      maxBudgetUsd: stageBudget("build"),
      allowedTools: [...READ_TOOLS, ...WRITE_TOOLS, "Bash"],
      allowedCommands: BUILD_COMMANDS,
      // The template catalogue lives in the repo, outside the project folder.
      writableDirs: [],
      validate: async () => validateDeck(paths.deck.index, paths.deck.slides, breakdown.slides.length),
    });
  },
};

export async function validateDeck(indexFile: string, slidesFile: string, expected: number): Promise<string | null> {
  let slides: string;
  try {
    slides = await fs.readFile(slidesFile, "utf8");
  } catch {
    return "deck/slides.html is missing";
  }
  const count = (slides.match(/<section\b[^>]*class="[^"]*\bslide\b/g) ?? []).length;
  if (count !== expected) return `deck/slides.html has ${count} slides; the breakdown has ${expected}`;
  try {
    const index = await fs.readFile(indexFile, "utf8");
    if (index.includes("{{")) return "deck/index.html still contains template placeholders; run pnpm deck:assemble";
  } catch {
    return "deck/index.html is missing; run pnpm deck:assemble";
  }
  return null;
}
