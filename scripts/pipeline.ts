#!/usr/bin/env tsx
/**
 * Run the pipeline from the command line, approving each gate automatically.
 *
 *   pnpm pipeline fixtures/ofek-procedure.pdf research      # run up to and including a stage
 *   pnpm pipeline --project <id> build                       # continue an existing project
 *
 * Used for end-to-end verification; the web app is the real interface.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createProject, loadProject } from "@/lib/store/projects";
import { slideRangeForDuration } from "@/lib/schema/brief";
import { STAGE_ORDER, type StageId } from "@/lib/schema/project";
import { kindOf } from "@/lib/extract";
import { approveStage, emitterFor, startStage, waitForJob } from "@/lib/runner/runner";
import { stageModule } from "@/lib/runner/stages";

async function main() {
  const args = process.argv.slice(2);
  let projectId: string | null = null;
  let fixture: string | null = null;
  let target: StageId = "qa";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project") projectId = args[++i];
    else if (STAGE_ORDER.includes(args[i] as StageId)) target = args[i] as StageId;
    else fixture = args[i];
  }

  if (!projectId) {
    if (!fixture) throw new Error("usage: pnpm pipeline <source-file> [stage] | --project <id> [stage]");
    const file = path.resolve(fixture);
    const filename = path.basename(file);
    const kind = kindOf(filename);
    if (!kind) throw new Error(`unsupported file: ${filename}`);
    const project = await createProject({
      name: `בדיקה · ${filename}`,
      brief: {
        audience: "בנקאי מרכז השירות הדיגיטלי, ותק שנה עד שלוש",
        durationMin: 15,
        slideRange: slideRangeForDuration(15),
        goal: "לטפל בפנייה דיגיטלית לפי חמשת השלבים ובתוך זמן התקן",
        deckType: "procedure",
        aiImages: false,
      },
      file: { filename, kind, bytes: await fs.readFile(file) },
    });
    projectId = project.id;
    console.log(`project ${projectId}`);
  }

  emitterFor(projectId).on("event", (e) => {
    const p = JSON.stringify(e.payload);
    const short = p.length > 150 ? p.slice(0, 150) + "…" : p;
    console.log(`  ${e.ts.slice(11, 19)} [${e.stage}:${e.type}]${e.agent ? " " + e.agent : ""} ${short}`);
  });

  for (const stage of STAGE_ORDER) {
    const project = await loadProject(projectId);
    const st = project.stages[stage]!;
    if (st.status === "approved") {
      console.log(`✓ ${stage} already approved`);
      if (stage === target) break;
      continue;
    }
    if (st.status === "awaiting_approval") {
      await approveStage(projectId, stage);
      console.log(`✓ ${stage} was waiting for approval; approved`);
      if (stage === target) break;
      continue;
    }
    console.log(`\n▶ ${stage}`);
    await startStage({ projectId, stage, mode: "initial", module: stageModule(stage) });
    await waitForJob(projectId);
    const after = (await loadProject(projectId)).stages[stage]!;
    console.log(`  status=${after.status} cost=$${(after.lastRun?.costUsd ?? 0).toFixed(3)} turns=${after.lastRun?.numTurns ?? 0} ${after.lastRun?.error ?? ""}`);
    if (after.status !== "awaiting_approval") process.exit(1);
    await approveStage(projectId, stage);
    console.log(`  approved`);
    if (stage === target) break;
  }
  const final = await loadProject(projectId);
  console.log(`\ntotal cost $${final.totalCostUsd.toFixed(2)} · project ${projectId}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
