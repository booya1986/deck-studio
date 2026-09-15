#!/usr/bin/env tsx
/**
 * Accept a failed research stage whose artifacts are already on disk and valid.
 *
 *   pnpm tsx scripts/salvage-stage.ts <project-id> [costUsd] [numTurns]
 *
 * For runs that died after writing everything (usage limit on the last turn).
 * The runner now does this by itself; this script recovers runs from before that.
 */
import { promises as fs } from "node:fs";
import { Breakdown } from "@/lib/schema/breakdown";
import { Facts } from "@/lib/schema/facts";
import { loadProject, mutateProject } from "@/lib/store/projects";
import { pp } from "@/lib/store/paths";
import { breakdownToMarkdown } from "@/lib/render/markdown";
import { validateResearch } from "@/lib/runner/stages/research";

async function main() {
  const [id, cost = "0", turns = "0"] = process.argv.slice(2);
  if (!id) throw new Error("usage: salvage-stage.ts <project-id> [costUsd] [numTurns]");
  const project = await loadProject(id);
  const st = project.stages.research!;
  if (st.status !== "failed") throw new Error(`research is ${st.status}, not failed`);

  const paths = pp(id);
  const problem = await validateResearch(paths.research.facts, paths.research.breakdownJson, project.brief.slideRange);
  if (problem) throw new Error(`artifacts do not validate: ${problem}`);

  const breakdown = Breakdown.parse(JSON.parse(await fs.readFile(paths.research.breakdownJson, "utf8")));
  const facts = Facts.parse(JSON.parse(await fs.readFile(paths.research.facts, "utf8")));
  await fs.writeFile(paths.research.breakdownMd, breakdownToMarkdown(breakdown, facts), "utf8");

  const spent = Number(cost);
  await mutateProject(id, (s) => {
    const r = s.stages.research!;
    r.status = "awaiting_approval";
    r.lastRun = {
      startedAt: r.lastRun?.startedAt ?? new Date().toISOString(),
      endedAt: r.lastRun?.endedAt ?? new Date().toISOString(),
      costUsd: spent,
      numTurns: Number(turns),
    };
    s.currentStage = "research";
    s.totalCostUsd = Number((s.totalCostUsd + spent).toFixed(4));
  });
  console.log(`research salvaged: ${breakdown.slides.length} slides, ${facts.claims.length} claims, +$${spent}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
