import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ProjectState, StageId, StageState, emptyStage, STAGE_ORDER } from "@/lib/schema/project";
import { Brief } from "@/lib/schema/brief";
import { Comment, CommentsFile } from "@/lib/schema/comments";
import { DATA_DIR, pp, projectDir } from "./paths";

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Write JSON atomically: temp file in the same dir, then rename. The temp
 * name carries random bytes; two writes in the same millisecond once shared
 * a name and one of them renamed the other's file away.
 */
export async function writeJsonAtomic(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

/** Read-modify-write on project.json is serialised per project within this process. */
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => undefined));
  return next;
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

export async function fileExists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Project ids are ASCII only. They become directory names, URL segments and
 * shell arguments, and Hebrew in any of those reliably breaks something: route
 * params arrive percent-encoded, paths need quoting, and filesystems normalise
 * differently. The readable name lives in project.json.
 */
export function newProjectId(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 32);
  const stamp = new Date().toISOString().slice(0, 10);
  const rand = crypto.randomBytes(3).toString("hex");
  return slug ? `${stamp}-${slug}-${rand}` : `${stamp}-${rand}`;
}

export async function createProject(args: {
  name: string;
  brief: Brief;
  file: { filename: string; kind: "pdf" | "docx" | "pptx"; bytes: Buffer };
}): Promise<ProjectState> {
  await ensureDataDir();
  const id = newProjectId(args.name);
  const p = pp(id);
  await fs.mkdir(p.sourceDir, { recursive: true });
  await fs.writeFile(path.join(p.sourceDir, args.file.filename), args.file.bytes);

  const now = new Date().toISOString();
  const stages = Object.fromEntries(STAGE_ORDER.map((s) => [s, emptyStage()])) as Record<StageId, StageState>;
  const state: ProjectState = {
    id,
    name: args.name,
    createdAt: now,
    updatedAt: now,
    brief: args.brief,
    source: {
      filename: args.file.filename,
      kind: args.file.kind,
      sha256: crypto.createHash("sha256").update(args.file.bytes).digest("hex"),
      bytes: args.file.bytes.length,
    },
    currentStage: "design_system",
    stages,
    totalCostUsd: 0,
  };
  await writeJsonAtomic(p.projectJson, state);
  await writeJsonAtomic(p.commentsJson, { comments: [] } satisfies CommentsFile);
  return state;
}

export async function loadProject(id: string): Promise<ProjectState> {
  const raw = await readJson<unknown>(pp(id).projectJson);
  const state = ProjectState.parse(raw);
  return reconcileInterrupted(state);
}

/**
 * A stage left `running` by a crashed/restarted server becomes `failed`.
 * "Crashed" means: no live job for this project in this process, and no
 * heartbeat from any process for STALE_RUN_MS. A long Opus stage (12+ minutes
 * on a 12-page document) is not a crash; it heartbeats every 30 seconds.
 */
const STALE_RUN_MS = 10 * 60 * 1000;
function hasLiveJob(projectId: string): boolean {
  // The runner keeps its jobs on globalThis (see lib/runner/runner.ts); read it
  // without importing the runner, which imports this module.
  const runner = (globalThis as { __deckStudioRunner?: { jobs: Map<string, unknown> } }).__deckStudioRunner;
  return runner?.jobs.has(projectId) ?? false;
}
function reconcileInterrupted(state: ProjectState): ProjectState {
  let changed = false;
  if (hasLiveJob(state.id)) return state;
  for (const s of STAGE_ORDER) {
    const st = state.stages[s];
    if (!st || st.status !== "running") continue;
    const lastSeen = Math.max(
      st.lastRun?.startedAt ? Date.parse(st.lastRun.startedAt) : 0,
      st.lastRun?.heartbeatAt ? Date.parse(st.lastRun.heartbeatAt) : 0,
    );
    if (Date.now() - lastSeen > STALE_RUN_MS) {
      st.status = "failed";
      st.lastRun = { ...(st.lastRun ?? { startedAt: new Date().toISOString() }), error: "interrupted" };
      changed = true;
    }
  }
  if (changed) void writeJsonAtomic(pp(state.id).projectJson, state);
  return state;
}

export async function saveProject(state: ProjectState) {
  state.updatedAt = new Date().toISOString();
  await writeJsonAtomic(pp(state.id).projectJson, ProjectState.parse(state));
}

export async function mutateProject(
  id: string,
  fn: (s: ProjectState) => void | Promise<void>,
): Promise<ProjectState> {
  return withLock(id, async () => {
    const state = await loadProject(id);
    await fn(state);
    await saveProject(state);
    return state;
  });
}

export async function listProjects(): Promise<ProjectState[]> {
  await ensureDataDir();
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const out: ProjectState[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      out.push(ProjectState.parse(await readJson(pp(e.name).projectJson)));
    } catch {
      // skip unreadable project dirs
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readComments(id: string): Promise<Comment[]> {
  const f = pp(id).commentsJson;
  if (!(await fileExists(f))) return [];
  return CommentsFile.parse(await readJson(f)).comments;
}

export async function addComment(id: string, c: Omit<Comment, "id" | "createdAt">): Promise<Comment> {
  const comments = await readComments(id);
  const comment: Comment = {
    ...c,
    id: crypto.randomBytes(6).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  comments.push(Comment.parse(comment));
  await writeJsonAtomic(pp(id).commentsJson, { comments });
  return comment;
}

export async function deleteComment(id: string, commentId: string) {
  const comments = (await readComments(id)).filter((c) => c.id !== commentId);
  await writeJsonAtomic(pp(id).commentsJson, { comments });
}

export async function unresolvedComments(id: string, stage: StageId): Promise<Comment[]> {
  return (await readComments(id)).filter((c) => c.stage === stage && c.resolvedInIteration === undefined);
}

export async function resolveComments(id: string, stage: StageId, iteration: number) {
  const comments = await readComments(id);
  for (const c of comments) {
    if (c.stage === stage && c.resolvedInIteration === undefined) c.resolvedInIteration = iteration;
  }
  await writeJsonAtomic(pp(id).commentsJson, { comments });
}

export { projectDir, pp };
