import { promises as fs } from "node:fs";
import path from "node:path";
import { Breakdown } from "@/lib/schema/breakdown";
import { Facts } from "@/lib/schema/facts";
import { Outline } from "@/lib/schema/outline";
import { loadProject } from "@/lib/store/projects";
import { pp } from "@/lib/store/paths";
import { MODELS, READ_TOOLS, WRITE_TOOLS } from "../sdk";
import { bashPolicyText } from "../bash-policy";
import { TextBlocks } from "@/lib/schema/common";
import { breakdownToMarkdown } from "@/lib/render/markdown";
import { briefText, commentBlock, loadPrompt, runWithValidation, schemaFor, stageBudget } from "./shared";
import type { StageContext, StageModule, StageOutcome } from "./types";

export const researchStage: StageModule = {
  id: "research",
  async run(ctx: StageContext): Promise<StageOutcome> {
    const project = await loadProject(ctx.projectId);
    const paths = pp(ctx.projectId);
    const rel = (p: string) => path.relative(paths.root, p);
    await fs.mkdir(paths.research.dir, { recursive: true });

    const outline = Outline.parse(JSON.parse(await fs.readFile(paths.outline.json, "utf8")));
    const [minSlides, maxSlides] = project.brief.slideRange;

    const base = `${briefText(project)}

Approved outline: ${rel(paths.outline.json)} (${outline.sections.length} sections, ${outline.slideBudgetTotal} slides planned)
Source document: ${rel(paths.extraction.textBlocks)}
Write into ${rel(paths.research.dir)}/: facts.json and breakdown.json. The web researcher writes
research.md itself, and breakdown.md is rendered from your JSON — do not write either of them.
Slide count must be between ${minSlides} and ${maxSlides}.

facts.json must satisfy this schema:

\`\`\`json
${await schemaFor("facts")}
\`\`\`

breakdown.json must satisfy this schema:

\`\`\`json
${await schemaFor("breakdown")}
\`\`\`

${bashPolicyText([])}`;

    const prompt =
      ctx.mode === "initial"
        ? base
        : `${base}

This is revision ${ctx.iteration}. The current breakdown is in ${rel(paths.research.breakdownJson)} and the
current facts in ${rel(paths.research.facts)}. The reviewer left these comments. Apply every one of them
and change nothing else:

${await commentBlock(ctx)}`;

    return runWithValidation({
      ctx,
      cwd: paths.root,
      prompt,
      systemPrompt: await loadPrompt("research-lead"),
      model: MODELS.fast,
      effort: "medium",
      maxTurns: 60,
      maxBudgetUsd: stageBudget("research"),
      allowedTools: [...READ_TOOLS, ...WRITE_TOOLS, "Bash", "Agent", "Task", "WebSearch", "WebFetch"],
      agents: {
        "ld-researcher": {
          description: "Finds context, examples, definitions and signs of staleness on the web for each outline section. Returns text with URLs.",
          prompt: await loadPrompt("ld-researcher"),
          // It writes research.md itself: having the lead re-emit the whole report
          // token by token cost over two minutes of pure typing on a 12-page document.
          tools: ["WebSearch", "WebFetch", "Read", "Write"],
          model: MODELS.fast,
          effort: "medium",
          maxTurns: 25,
        },
        "fact-checker": {
          description: "Verifies a list of claims against the source document only. Returns one verdict per claim.",
          prompt: await loadPrompt("fact-checker"),
          tools: ["Read", "Grep", "Glob"],
          model: MODELS.cheap,
          effort: "low",
          maxTurns: 20,
        },
        "breakdown-critic": {
          description: "Reviews a slide breakdown for one-message-per-slide, density, visual honesty, grounding and learning arc. Returns findings only.",
          prompt: await loadPrompt("breakdown-critic"),
          tools: ["Read", "Grep", "Glob"],
          model: MODELS.cheap,
          maxTurns: 15,
        },
      },
      outputs: [paths.research.facts, paths.research.breakdownJson],
      validate: async () => {
        const problem = await validateResearch(paths.research.facts, paths.research.breakdownJson, [minSlides, maxSlides]);
        if (problem) return problem;
        const breakdown = Breakdown.parse(JSON.parse(await fs.readFile(paths.research.breakdownJson, "utf8")));
        const facts = Facts.safeParse(JSON.parse(await fs.readFile(paths.research.facts, "utf8")));
        await fs.writeFile(
          paths.research.breakdownMd,
          breakdownToMarkdown(breakdown, facts.success ? facts.data : null),
          "utf8",
        );
        return null;
      },
      retryContext: async () => salvageNote(paths.research, rel),
    });
  },
};

/**
 * What the failed attempt already wrote. Web research is the expensive part of
 * this stage, so a retry that still has `research.md` must not buy it again.
 */
async function salvageNote(
  research: { dir: string; md: string; facts: string; breakdownJson: string; breakdownMd: string },
  rel: (p: string) => string,
): Promise<string> {
  const files = [research.md, research.facts, research.breakdownJson, research.breakdownMd];
  const present: string[] = [];
  for (const f of files) {
    try {
      const { size } = await fs.stat(f);
      if (size > 0) present.push(`- ${rel(f)} (${size} bytes)`);
    } catch {
      // not written by the failed attempt
    }
  }
  if (!present.length) return "";
  return `Your previous attempt already wrote these files, and they are still on disk:

${present.join("\n")}

Read them first and build on them. In particular, if \`research.md\` is there, the web research is
already done and paid for — do not run the searches again. Only redo the part that failed validation.`;
}

export async function validateResearch(factsFile: string, breakdownFile: string, range: [number, number]): Promise<string | null> {
  const problems: string[] = [];

  let facts: Facts | null = null;
  try {
    const parsed = Facts.safeParse(JSON.parse(await fs.readFile(factsFile, "utf8")));
    if (!parsed.success) {
      problems.push("facts.json does not match the schema: " + parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    } else facts = parsed.data;
  } catch {
    problems.push("facts.json is missing or not valid JSON");
  }

  let breakdown: Breakdown | null = null;
  try {
    const parsed = Breakdown.safeParse(JSON.parse(await fs.readFile(breakdownFile, "utf8")));
    if (!parsed.success) {
      problems.push("breakdown.json does not match the schema: " + parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    } else breakdown = parsed.data;
  } catch {
    problems.push("breakdown.json is missing or not valid JSON");
  }

  if (breakdown) {
    const n = breakdown.slides.length;
    if (n < range[0] || n > range[1]) problems.push(`breakdown has ${n} slides; the brief allows ${range[0]}–${range[1]}`);
    const numbers = breakdown.slides.map((s) => s.n);
    const expected = breakdown.slides.map((_, i) => i + 1);
    if (numbers.join(",") !== expected.join(",")) problems.push("slides must be numbered 1..N in order");
    if (facts) {
      const known = new Set(facts.claims.map((c) => c.id));
      const wrong = new Set(facts.claims.filter((c) => c.verdict === "WRONG").map((c) => c.id));
      const unknown = breakdown.slides.flatMap((s) => s.claimIds.filter((id) => !known.has(id)));
      if (unknown.length) problems.push(`claimIds not found in facts.json: ${[...new Set(unknown)].slice(0, 6).join(", ")}`);
      const stillWrong = breakdown.slides.filter((s) => s.claimIds.some((id) => wrong.has(id))).map((s) => s.n);
      if (stillWrong.length) problems.push(`slides ${stillWrong.join(", ")} still reference claims with verdict WRONG; drop or rewrite them`);
    }
    const dense = breakdown.slides.filter((s) => s.body.length > 6).map((s) => s.n);
    if (dense.length) problems.push(`slides ${dense.join(", ")} have more than 6 body lines`);
  }

  return problems.length ? problems.join(". ") : null;
}
