import { promises as fs } from "node:fs";
import path from "node:path";
import { QaReport } from "@/lib/schema/qa";
import { mergeJudgeReport, recheckScope } from "@/lib/qa/merge-report";
import { loadProject, unresolvedComments } from "@/lib/store/projects";
import { pp } from "@/lib/store/paths";
import { MODELS, READ_TOOLS, WRITE_TOOLS, runAgent } from "../sdk";
import { bashPolicyText } from "../bash-policy";
import { AgentFailure, describeSubtype, loadPrompt, schemaFor, stageBudget } from "./shared";
import { BUILD_COMMANDS, validateDeck } from "./build";
import type { StageContext, StageModule, StageOutcome } from "./types";

const MAX_AUTO_ROUNDS = 2;
const MAX_FIXES_PER_ROUND = 8;

/**
 * QA loop: mechanical checks → vision judge → builder fixes, at most twice.
 * On a revision run (reviewer comments after the gate) it does one fix round
 * followed by a quick mechanical re-check.
 */
export const qaStage: StageModule = {
  id: "qa",
  async run(ctx: StageContext): Promise<StageOutcome> {
    const paths = pp(ctx.projectId);
    const { runDeckQa } = await import("@/lib/qa/run-qa");
    const { assembleDeck } = await import("@/lib/deck/assemble");
    // A previous fix round may have edited slides.html without re-assembling.
    await assembleDeck({ projectDir: paths.root });
    const outcome: StageOutcome = { sessionIds: [], costUsd: 0, numTurns: 0 };
    const add = (r: { sessionId: string | null; costUsd: number; numTurns: number }) => {
      if (r.sessionId) outcome.sessionIds.push(r.sessionId);
      outcome.costUsd += r.costUsd;
      outcome.numTurns += r.numTurns;
    };

    if (ctx.mode === "revise") {
      const iteration = await nextIteration(paths.qa.dir);
      const comments = await unresolvedComments(ctx.projectId, ctx.stage);
      const report: QaReport = {
        iteration,
        issues: comments.map((c) => ({
          slide: c.target.kind === "slide" ? Number(c.target.ref) || 0 : 0,
          severity: "fix",
          category: "visual",
          issue: c.text,
          fixHint: c.text,
          source: "user",
        })),
        summary: { slides: 0, clean: 0 },
        screenshots: [],
      };
      await fs.mkdir(paths.qa.iterDir(iteration), { recursive: true });
      await fs.writeFile(paths.qa.report(iteration), JSON.stringify(report, null, 2) + "\n", "utf8");
      try {
        add((await fixRound(ctx, iteration)).result);
      } catch (e) {
        throw withCost(e, outcome);
      }
      await runDeckQa({ projectDir: paths.root, iteration: iteration + 1, quick: false });
      return outcome;
    }

    let previous: PreviousPass | null = null;
    for (let round = 1; round <= MAX_AUTO_ROUNDS; round++) {
      const iteration = await nextIteration(paths.qa.dir);
      ctx.emit({ stage: ctx.stage, iteration: ctx.iteration, type: "progress", payload: { step: "auto-qa", round, iteration } });
      const auto = await runDeckQa({ projectDir: paths.root, iteration, quick: false });
      ctx.emit({
        stage: ctx.stage, iteration: ctx.iteration, type: "progress",
        payload: { step: "auto-qa-done", issues: auto.issues.length, blockers: auto.issues.filter((i) => i.severity === "blocker").length },
      });

      try {
        add(await judge(ctx, iteration, previous));
      } catch (e) {
        throw withCost(e, outcome);
      }
      const report = QaReport.parse(JSON.parse(await fs.readFile(paths.qa.report(iteration), "utf8")));
      const actionable = report.issues.filter((i) => i.severity !== "consider");
      ctx.emit({
        stage: ctx.stage, iteration: ctx.iteration, type: "progress",
        payload: { step: "judged", issues: report.issues.length, actionable: actionable.length, clean: report.summary.clean },
      });
      if (!actionable.length) break;
      if (round === MAX_AUTO_ROUNDS) break;

      try {
        const fixed = await fixRound(ctx, iteration);
        add(fixed.result);
        previous = { iteration, fixedSlides: fixed.slides };
      } catch (e) {
        throw withCost(e, outcome);
      }
    }
    return outcome;
  },
};

/** The judged pass before a fix round: its report carries forward for slides the fix did not touch. */
type PreviousPass = { iteration: number; fixedSlides: number[] };

/** Attach what the stage already spent to an error from a later round. */
function withCost(e: unknown, outcome: StageOutcome): AgentFailure {
  const own = e instanceof AgentFailure ? e : new AgentFailure(e instanceof Error ? e.message : String(e), 0, 0);
  return new AgentFailure(own.message, own.costUsd + outcome.costUsd, own.numTurns + outcome.numTurns);
}

async function nextIteration(qaDir: string): Promise<number> {
  try {
    const names = await fs.readdir(qaDir);
    const nums = names.map((n) => Number(n.match(/^iter-(\d+)$/)?.[1] ?? 0));
    return Math.max(0, ...nums) + 1;
  } catch {
    return 1;
  }
}

async function judge(ctx: StageContext, iteration: number, previous: PreviousPass | null = null) {
  const paths = pp(ctx.projectId);
  const rel = (p: string) => path.relative(paths.root, p);
  const autoReport = QaReport.parse(JSON.parse(await fs.readFile(paths.qa.auto(iteration), "utf8")));
  // After a fix round only the fixed slides changed. Re-judging all of them
  // re-read fifteen screenshots to confirm seven edits.
  const scope = previous ? recheckScope(previous.fixedSlides, autoReport) : null;
  const scopeText = scope
    ? `
This is a re-check after a fix round. Judge only slides ${scope.join(", ")}: open only their screenshots,
confirm each fix landed and that the edit broke nothing else on that slide. The other slides were judged
in iteration ${previous!.iteration}, and their findings carry forward without you.
`
    : "";

  const result = await runAgent({
    stage: ctx.stage,
    iteration: ctx.iteration,
    cwd: paths.root,
    prompt: `QA iteration ${iteration}.${scopeText}
Screenshots: ${rel(paths.qa.iterDir(iteration))}/slide-NN.png
Mechanical findings: ${rel(paths.qa.auto(iteration))}
Breakdown: ${rel(paths.research.breakdownJson)}
Brand rules: ${rel(paths.ds.skill)}
Write your report to: ${rel(paths.qa.report(iteration))}

The report must satisfy this schema:

\`\`\`json
${await schemaFor("qa-report")}
\`\`\`

${bashPolicyText([])}`,
    systemPrompt: await loadPrompt("qa-judge"),
    // Measured: a judge pass is $1.7–1.9 on opus. Sonnet halves that. Watch the
    // finding quality — on the fixture the judge is the sharpest agent in the
    // pipeline, so if its reports get vaguer, put this back to MODELS.main.
    model: MODELS.cheap,
    effort: "medium",
    maxTurns: 40,
    maxBudgetUsd: stageBudget("qa") / 4,
    allowedTools: [...READ_TOOLS, "Write", "Bash"],
    signal: ctx.signal,
    onEvent: ctx.emit,
  });
  if (result.isError) throw new AgentFailure(`שופט ה-QA נכשל: ${describeSubtype(result.errorSubtype)}`, result.costUsd, result.numTurns);

  // The judge writes only its own findings. The mechanical ones, and on a
  // scoped re-check the previous findings for untouched slides, are merged here.
  const readJsonOrNull = async (file: string): Promise<unknown> => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return null;
    }
  };
  const judged = await readJsonOrNull(paths.qa.report(iteration));
  const carriedRaw = previous ? await readJsonOrNull(paths.qa.report(previous.iteration)) : null;
  const carried = carriedRaw ? QaReport.safeParse(carriedRaw) : null;
  const { report, judgeValid } = mergeJudgeReport({
    iteration,
    auto: autoReport,
    judged,
    carried: carried?.success ? carried.data : null,
    scope,
  });
  await fs.writeFile(paths.qa.report(iteration), JSON.stringify(report, null, 2) + "\n", "utf8");
  if (!judgeValid) {
    ctx.emit({ stage: ctx.stage, iteration: ctx.iteration, type: "error", payload: { message: "דוח השופט לא תקין; מוצגים הממצאים האוטומטיים בלבד" } });
  }
  return result;
}

async function fixRound(ctx: StageContext, iteration: number) {
  const project = await loadProject(ctx.projectId);
  const paths = pp(ctx.projectId);
  const rel = (p: string) => path.relative(paths.root, p);
  const report = QaReport.parse(JSON.parse(await fs.readFile(paths.qa.report(iteration), "utf8")));
  // One round fixes the worst eight; the next auto pass and judge see the rest.
  const rank = { blocker: 0, fix: 1, consider: 2 } as const;
  const actionable = report.issues
    .filter((i) => i.severity !== "consider")
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, MAX_FIXES_PER_ROUND);
  const list = actionable
    .map((i) => `- slide ${i.slide} [${i.severity}/${i.category}] ${i.issue}${i.where ? ` (${i.where})` : ""} → ${i.fixHint}`)
    .join("\n");

  ctx.emit({ stage: ctx.stage, iteration: ctx.iteration, type: "progress", payload: { step: "fix-round", issues: actionable.length } });
  const result = await runAgent({
    stage: ctx.stage,
    iteration: ctx.iteration,
    cwd: paths.root,
    prompt: `Fix round after QA iteration ${iteration}.
Deck: ${rel(paths.deck.slides)} and ${rel(paths.deck.slideStyles)}
Brand rules: ${rel(paths.ds.skill)}
Breakdown: ${rel(paths.research.breakdownJson)}
Screenshots of the current state: ${rel(paths.qa.iterDir(iteration))}/slide-NN.png (look at the slides you are fixing)

Fix exactly these issues, on exactly these slides, and leave every other slide untouched:

${list}

Read only what these fixes need: grep each listed slide's section in slides.html and the rules it uses in
slide-styles.css, plus the screenshots of the listed slides. The deck already shows the component and
token patterns; open COMPONENTS.md, LAYOUTS.md or the brand SKILL.md only when an edit needs something
the deck does not already use. The last fix round spent over three minutes re-reading all of them.

Work slide by slide with targeted Edit calls; do not rewrite the whole file. Run \`pnpm deck:assemble\`
and \`pnpm deck:qa --quick\` exactly once, after all the edits, and fix only what the quick report flags
on those slides. Do not render a second time and do not open fresh screenshots to check your work: a
judge re-checks exactly these slides right after you. Then stop.

${bashPolicyText(BUILD_COMMANDS)}`,
    systemPrompt: await loadPrompt("deck-builder"),
    model: MODELS.main,
    effort: "medium",
    maxTurns: 90,
    maxBudgetUsd: (stageBudget("qa") * 3) / 8,
    allowedTools: [...READ_TOOLS, ...WRITE_TOOLS, "Bash"],
    allowedCommands: BUILD_COMMANDS,
    signal: ctx.signal,
    onEvent: ctx.emit,
  });
  if (result.isError) throw new AgentFailure(`סבב התיקון נכשל: ${describeSubtype(result.errorSubtype)}`, result.costUsd, result.numTurns);

  const breakdownCount = JSON.parse(await fs.readFile(paths.research.breakdownJson, "utf8")).slides.length as number;
  const problem = await validateDeck(paths.deck.index, paths.deck.slides, breakdownCount);
  if (problem) throw new Error(`המצגת לא תקינה אחרי סבב התיקון: ${problem}`);
  void project;
  return { result, slides: [...new Set(actionable.map((i) => i.slide))].filter((n) => n > 0) };
}
