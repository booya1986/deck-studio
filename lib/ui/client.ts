"use client";

import type { ProjectState, StageId } from "@/lib/schema/project";
import type { Comment } from "@/lib/schema/comments";
import type { BrandDecision, DsManifest } from "@/lib/schema/design-system";
import type { RunEvent } from "@/lib/store/runlog";

export type ProjectView = {
  project: ProjectState;
  comments: Comment[];
  running: { stage: StageId; iteration: number } | null;
  qaIterations: number;
  artifacts: Record<"brandBoard" | "brandDecision" | "outline" | "breakdown" | "deck", boolean>;
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? "הבקשה נכשלה");
  return body as T;
}

export const api = {
  listProjects: () => fetch("/api/projects", { cache: "no-store" }).then(json<ProjectState[]>),

  createProject: (form: FormData) =>
    fetch("/api/projects", { method: "POST", body: form }).then(json<ProjectState>),

  getProject: (id: string) =>
    fetch(`/api/projects/${id}`, { cache: "no-store" }).then(json<ProjectView>),

  run: (id: string, stage: StageId, mode: "initial" | "revise") =>
    fetch(`/api/projects/${id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, mode }),
    }).then(json<{ started: boolean; iteration: number }>),

  stop: (id: string) =>
    fetch(`/api/projects/${id}/run`, { method: "DELETE" }).then(json<{ aborted: boolean; stage: StageId }>),

  approve: (id: string, stage: StageId) =>
    fetch(`/api/projects/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    }).then(json<ProjectState>),

  addComment: (id: string, stage: StageId, text: string, target: Comment["target"]) =>
    fetch(`/api/projects/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, text, target }),
    }).then(json<Comment>),

  deleteComment: (id: string, commentId: string) =>
    fetch(`/api/projects/${id}/comments?commentId=${commentId}`, { method: "DELETE" }).then(json),

  getDesignSystem: (id: string) =>
    fetch(`/api/projects/${id}/design-system`, { cache: "no-store" }).then(
      json<{ decision: BrandDecision; manifest: DsManifest }>,
    ),

  patchDesignSystem: (id: string, patch: unknown) =>
    fetch(`/api/projects/${id}/design-system`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(json<{ manifest: DsManifest }>),

  uploadLogo: (id: string, file: File) => {
    const form = new FormData();
    form.set("logo", file);
    return fetch(`/api/projects/${id}/design-system`, { method: "POST", body: form }).then(
      json<{ logo: string }>,
    );
  },
};

export async function artifact<T>(id: string, name: "textBlocks" | "outline" | "facts" | "breakdown" | "qa", iteration?: number): Promise<T> {
  const q = iteration ? `&iteration=${iteration}` : "";
  return fetch(`/api/projects/${id}/artifact?name=${name}${q}`, { cache: "no-store" }).then(json<T>);
}

export function fileUrl(id: string, relPath: string): string {
  return `/api/projects/${id}/files/${relPath.split("/").map(encodeURIComponent).join("/")}`;
}

/** Subscribe to a project's run events. Returns an unsubscribe function. */
export function subscribe(
  id: string,
  handlers: { onReplay?: (events: RunEvent[]) => void; onEvent?: (e: RunEvent) => void },
): () => void {
  const source = new EventSource(`/api/projects/${id}/events`);
  source.addEventListener("replay", (e) => {
    const data = JSON.parse((e as MessageEvent).data) as { events: RunEvent[] };
    handlers.onReplay?.(data.events);
  });
  source.addEventListener("run", (e) => {
    handlers.onEvent?.(JSON.parse((e as MessageEvent).data) as RunEvent);
  });
  return () => source.close();
}
