import { promises as fs } from "node:fs";
import path from "node:path";
import { Outline } from "@/lib/schema/outline";
import { TextBlocks } from "@/lib/schema/common";
import { loadProject } from "@/lib/store/projects";
import { pp } from "@/lib/store/paths";
import { MODELS, READ_TOOLS, WRITE_TOOLS } from "../sdk";
import { bashPolicyText } from "../bash-policy";
import { outlineToMarkdown } from "@/lib/render/markdown";
import { briefText, commentBlock, loadPrompt, runWithValidation, schemaFor, stageBudget } from "./shared";
import type { StageContext, StageModule, StageOutcome } from "./types";

export const outlineStage: StageModule = {
  id: "outline",
  async run(ctx: StageContext): Promise<StageOutcome> {
    const project = await loadProject(ctx.projectId);
    const paths = pp(ctx.projectId);
    const rel = (p: string) => path.relative(paths.root, p);
    await fs.mkdir(paths.outline.dir, { recursive: true });

    // Keep the previous version so a revision can be compared.
    if (ctx.mode === "revise") {
      try {
        await fs.copyFile(paths.outline.json, paths.outline.version(ctx.iteration - 1));
      } catch {
        // first revision without a prior file
      }
    }

    const textBlocks = TextBlocks.parse(JSON.parse(await fs.readFile(paths.extraction.textBlocks, "utf8")));
    const knownIds = new Set(textBlocks.blocks.map((b) => b.id));
    const [minSlides, maxSlides] = project.brief.slideRange;

    const base = `${briefText(project)}

Document: ${rel(paths.extraction.textBlocks)} (${textBlocks.blocks.length} blocks, language ${textBlocks.language})
Write the outline to: ${rel(paths.outline.json)}. Write no other file; the reviewer's Markdown is rendered from your JSON.
Slide budget total must be between ${minSlides} and ${maxSlides}.

The outline file must satisfy this JSON schema:

\`\`\`json
${await schemaFor("outline")}
\`\`\`

${bashPolicyText([])}`;

    const prompt =
      ctx.mode === "initial"
        ? base
        : `${base}

This is revision ${ctx.iteration}. The current outline is in ${rel(paths.outline.json)}.
The reviewer left these comments. Apply every one of them and change nothing else:

${await commentBlock(ctx)}`;

    const result = await runWithValidation({
      ctx,
      cwd: paths.root,
      prompt,
      systemPrompt: await loadPrompt("learning-designer"),
      model: MODELS.fast,
      effort: "high",
      maxTurns: 40,
      maxBudgetUsd: stageBudget("outline"),
      allowedTools: [...READ_TOOLS, ...WRITE_TOOLS, "Bash", "Agent", "Task"],
      agents: {
        "outline-critic": {
          description: "Reviews a draft outline for coverage, grounding, budget and blind spots. Returns findings only.",
          prompt: await loadPrompt("outline-critic"),
          tools: ["Read", "Glob", "Grep"],
          model: MODELS.cheap,
          maxTurns: 15,
        },
      },
      outputs: [paths.outline.json],
      validate: async () => {
        const problem = await validateOutline(paths.outline.json, knownIds, [minSlides, maxSlides]);
        if (problem) return problem;
        // The reviewer's Markdown is a rendering of the JSON, not agent work.
        const outline = Outline.parse(JSON.parse(await fs.readFile(paths.outline.json, "utf8")));
        await fs.writeFile(paths.outline.md, outlineToMarkdown(outline, textBlocks), "utf8");
        return null;
      },
    });

    return result;
  },
};

async function validateOutline(file: string, knownIds: Set<string>, range: [number, number]): Promise<string | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return "outline.json is missing or not valid JSON";
  }
  const parsed = Outline.safeParse(raw);
  if (!parsed.success) {
    return "outline.json does not match the schema: " +
      parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  const o = parsed.data;
  const problems: string[] = [];

  const sum = o.sections.reduce((a, s) => a + s.slideBudget, 0);
  if (sum !== o.slideBudgetTotal) problems.push(`slideBudgetTotal (${o.slideBudgetTotal}) must equal the sum of section budgets (${sum})`);
  if (sum < range[0] || sum > range[1]) problems.push(`section budgets add up to ${sum}; the brief allows ${range[0]}–${range[1]}`);
  if (o.objectives.length < 2 || o.objectives.length > 6) problems.push(`write 2–6 objectives, not ${o.objectives.length}`);

  const badCites: string[] = [];
  for (const s of o.sections) {
    if (!s.keyFacts.length) problems.push(`section ${s.id} has no key facts`);
    for (const f of s.keyFacts) {
      if (!f.cite.length) badCites.push(`"${f.text.slice(0, 40)}" has no citation`);
      for (const c of f.cite) {
        if (!knownIds.has(c.blockId)) badCites.push(`"${f.text.slice(0, 40)}" cites unknown block ${c.blockId}`);
      }
    }
  }
  if (badCites.length) problems.push(`citations must use block ids from text-blocks.json: ${badCites.slice(0, 6).join("; ")}`);

  return problems.length ? problems.join(". ") : null;
}
