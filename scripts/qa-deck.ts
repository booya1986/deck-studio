#!/usr/bin/env tsx
import { promises as fs } from "node:fs";
import path from "node:path";
import { runDeckQa } from "@/lib/qa/run-qa";

const SEV: Record<string, string> = { blocker: "חוסם", fix: "לתיקון", consider: "לשיקול" };

async function nextIteration(qaDir: string): Promise<number> {
  try {
    const names = await fs.readdir(qaDir);
    return Math.max(0, ...names.map((n) => Number(n.match(/^iter-(\d+)$/)?.[1] ?? 0))) + 1;
  } catch {
    return 1;
  }
}

/**
 * pnpm deck:qa [--quick] [--iteration N] [projectDir]
 * With no projectDir, INIT_CWD (where the agent invoked pnpm) is the project.
 */
async function main() {
  const args = process.argv.slice(2);
  let quick = false;
  let iteration: number | null = null;
  let dirArg: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--quick") quick = true;
    else if (args[i] === "--iteration") iteration = Number(args[++i]);
    else dirArg = args[i];
  }
  const projectDir = path.resolve(dirArg ?? process.env.INIT_CWD ?? process.cwd());
  const iter = iteration ?? (await nextIteration(path.join(projectDir, "qa")));

  const report = await runDeckQa({ projectDir, iteration: iter, quick });
  const rows = report.issues
    .slice()
    .sort((a, b) => a.slide - b.slide)
    .map((i) => `${String(i.slide).padStart(3)}  ${SEV[i.severity].padEnd(6)}  ${i.category.padEnd(9)}  ${i.issue.slice(0, 80)}`);
  if (rows.length) {
    console.log("שקף  חומרה   קטגוריה   ממצא");
    console.log(rows.join("\n"));
  }
  const blockers = report.issues.filter((i) => i.severity === "blocker").length;
  const fixes = report.issues.filter((i) => i.severity === "fix").length;
  console.log(
    `\n${report.summary.clean}/${report.summary.slides} שקפים נקיים · ${blockers} חוסמים · ${fixes} לתיקון · דוח: qa/iter-${iter}/auto-report.json`,
  );
  process.exit(blockers ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
