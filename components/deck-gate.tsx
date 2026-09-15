"use client";

import { useEffect, useRef, useState } from "react";
import type { QaReport } from "@/lib/schema/qa";
import type { Comment } from "@/lib/schema/comments";
import type { ProjectState } from "@/lib/schema/project";
import { artifact, fileUrl } from "@/lib/ui/client";
import { CommentComposer, CommentList } from "./comment-list";

const SEV_CLASS: Record<string, string> = {
  blocker: "bg-err-soft text-err",
  fix: "bg-warn-soft text-warn",
  consider: "bg-surface-2 text-ink-2",
};
const SEV_LABEL: Record<string, string> = { blocker: "חוסם", fix: "לתיקון", consider: "לשיקול" };

/** Gate 4 (and the build stage view): the deck itself, the QA findings, and per-slide comments. */
export function DeckGate({
  projectId, project, stage, qaIterations, editable, comments, onChanged,
}: {
  projectId: string;
  project: ProjectState;
  stage: "build" | "qa";
  qaIterations: number;
  editable: boolean;
  comments: Comment[];
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState<{ n: number; total: number; title: string }>({ n: 1, total: 0, title: "" });
  const [report, setReport] = useState<QaReport | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  // The deck posts its current slide; comments attach to it.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; n?: number; total?: number; title?: string };
      if (d?.type === "slidechange" && typeof d.n === "number") {
        setCurrent({ n: d.n, total: d.total ?? 0, title: d.title ?? "" });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    setReloadKey((k) => k + 1);
    if (stage !== "qa") return;
    // The server names the latest iteration that has a judge report.
    if (!qaIterations) {
      setReport(null);
      return;
    }
    artifact<QaReport>(projectId, "qa", qaIterations).then(setReport).catch(() => setReport(null));
  }, [projectId, stage, qaIterations, project.stages[stage]?.iteration, project.updatedAt]);

  const deckUrl = `${fileUrl(projectId, "deck/index.html")}?v=${reloadKey}`;
  const slideComments = comments.filter((c) => c.target.kind === "slide" && c.target.ref === String(current.n));
  const generalComments = comments.filter((c) => c.target.kind === "general");
  const issuesHere = report?.issues.filter((i) => i.slide === current.n) ?? [];

  return (
    <div className="grid gap-4">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 text-sm">
          <span className="font-bold">המצגת</span>
          <span className="text-ink-3">
            שקף <bdi>{current.n}</bdi>{current.total ? <> מתוך <bdi>{current.total}</bdi></> : null}
            {current.title ? ` · ${current.title}` : ""}
          </span>
          <span className="ms-auto flex gap-3">
            <button className="text-brand hover:underline" onClick={() => setReloadKey((k) => k + 1)}>רענן</button>
            <a className="text-brand hover:underline" href={fileUrl(projectId, "deck/index.html")} target="_blank" rel="noreferrer">פתח בכרטיסייה</a>
            <a className="text-brand hover:underline" href={`${fileUrl(projectId, "deck/index.html")}?print=1`} target="_blank" rel="noreferrer">גרסת הדפסה</a>
          </span>
        </div>
        <div className="aspect-video w-full bg-surface-2">
          <iframe key={reloadKey} ref={frame} title="המצגת" src={deckUrl} className="size-full border-0" allow="fullscreen" />
        </div>
        <p className="px-4 py-2 text-xs text-ink-3">ניווט: חיצים או רווח בתוך המצגת. F למסך מלא.</p>
      </section>

      {report ? (
        <section className="card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-bold">ממצאי בקרת האיכות</h3>
            <span className="text-xs text-ink-3">
              סבב {report.iteration} · {report.summary.clean} מתוך {report.summary.slides} שקפים נקיים · {report.issues.length} ממצאים
            </span>
          </div>
          {issuesHere.length ? (
            <ul className="mt-3 grid gap-1.5">
              {issuesHere.map((i, k) => (
                <li key={k} className="flex items-start gap-2 text-sm">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${SEV_CLASS[i.severity]}`}>{SEV_LABEL[i.severity]}</span>
                  <span className="flex-1">{i.issue}<span className="text-ink-3"> · {i.fixHint}</span></span>
                  <span className="shrink-0 text-[11px] text-ink-3">{i.source === "judge" ? "שופט" : i.source === "auto" ? "אוטומטי" : "משתמש"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-3">אין ממצאים על השקף הנוכחי.</p>
          )}
          {report.issues.filter((i) => i.slide !== current.n && i.severity !== "consider").length ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-brand">כל הממצאים בשקפים אחרים</summary>
              <ul className="mt-2 grid gap-1">
                {report.issues.filter((i) => i.slide !== current.n).map((i, k) => (
                  <li key={k} className="flex gap-2">
                    <span className="shrink-0 text-xs text-ink-3">שקף <bdi>{i.slide}</bdi></span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${SEV_CLASS[i.severity]}`}>{SEV_LABEL[i.severity]}</span>
                    <span>{i.issue}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      <section className="card p-5">
        <h3 className="mb-2 font-bold">הערות על שקף <bdi>{current.n}</bdi></h3>
        <CommentList projectId={projectId} comments={slideComments} onChanged={onChanged} />
        {editable ? (
          <div className="mt-2">
            <CommentComposer
              projectId={projectId} stage={stage}
              target={{ kind: "slide", ref: String(current.n) }}
              placeholder="מה לתקן בשקף הזה? עבור לשקף במצגת כדי להעיר עליו."
              onAdded={onChanged} compact
            />
          </div>
        ) : null}
        {generalComments.length ? (
          <div className="mt-4 border-t border-line pt-3">
            <h4 className="mb-2 text-sm font-semibold text-ink-2">הערות כלליות</h4>
            <CommentList projectId={projectId} comments={generalComments} onChanged={onChanged} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
