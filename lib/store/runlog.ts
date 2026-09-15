import { promises as fs } from "node:fs";
import path from "node:path";
import type { StageId } from "@/lib/schema/project";
import { pp } from "./paths";

/** One line of the stage run log; also the SSE payload. */
export type RunEvent = {
  ts: string;
  stage: StageId;
  iteration: number;
  type: "init" | "text" | "tool" | "subagent" | "progress" | "result" | "error";
  agent?: string;
  payload: unknown;
};

export function runLogFile(id: string, stage: StageId, iteration: number) {
  return path.join(pp(id).runsDir, `${stage}-${iteration}.jsonl`);
}

export async function appendRunEvent(id: string, e: RunEvent) {
  const file = runLogFile(id, e.stage, e.iteration);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(e) + "\n", "utf8");
}

/** Last `limit` events across all stage logs, oldest first — used to replay into a new SSE client. */
export async function tailRunEvents(id: string, limit = 200): Promise<RunEvent[]> {
  const dir = pp(id).runsDir;
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const all: RunEvent[] = [];
  for (const f of files) {
    const text = await fs.readFile(path.join(dir, f), "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        all.push(JSON.parse(line) as RunEvent);
      } catch {
        // ignore truncated line
      }
    }
  }
  all.sort((a, b) => a.ts.localeCompare(b.ts));
  return all.slice(-limit);
}
