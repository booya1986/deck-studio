"use client";

import { useEffect, useState } from "react";
import type { Outline } from "@/lib/schema/outline";
import type { TextBlocks } from "@/lib/schema/common";
import type { Comment } from "@/lib/schema/comments";
import { artifact } from "@/lib/ui/client";
import { CommentComposer, CommentList } from "./comment-list";

/** Gate 2: the outline as a reviewer reads it, with a comment box per section. */
export function OutlineGate({
  projectId, editable, comments, onChanged,
}: {
  projectId: string;
  editable: boolean;
  comments: Comment[];
  onChanged: () => void;
}) {
  const [outline, setOutline] = useState<Outline | null>(null);
  const [blocks, setBlocks] = useState<Map<string, TextBlocks["blocks"][number]>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    artifact<Outline>(projectId, "outline").then(setOutline).catch((e) => setError(e.message));
    artifact<TextBlocks>(projectId, "textBlocks")
      .then((t) => setBlocks(new Map(t.blocks.map((b) => [b.id, b]))))
      .catch(() => {});
  }, [projectId, comments.length]);

  if (error) return <p className="card p-4 text-err">{error}</p>;
  if (!outline) return <p className="card p-4 text-ink-3">טוען מתווה…</p>;

  const cite = (blockId: string) => {
    const b = blocks.get(blockId);
    if (!b) return blockId;
    if (b.page) return `עמ׳ ${b.page}`;
    if (b.slide) return `שקף ${b.slide}`;
    return `פסקה ${b.paragraph ?? "?"}`;
  };

  return (
    <div className="grid gap-5">
      <section className="card p-5">
        <h3 className="text-xl font-bold">{outline.title}</h3>
        {outline.subtitle ? <p className="text-ink-2">{outline.subtitle}</p> : null}
        <p className="mt-2 text-sm text-ink-2">{outline.audienceSummary}</p>
        <p className="mt-2 text-xs text-ink-3">
          {outline.sections.length} פרקים · {outline.slideBudgetTotal} שקפים
        </p>
      </section>

      <section className="card p-5">
        <h3 className="mb-3 font-bold">מטרות למידה</h3>
        <ol className="grid gap-2">
          {outline.objectives.map((o) => (
            <li key={o.id} className="flex gap-3 text-sm">
              <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{o.bloom}</span>
              <span>{o.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {outline.sections.map((s, i) => {
        const own = comments.filter((c) => c.target.kind === "section" && c.target.ref === s.id);
        return (
          <section key={s.id} className="card p-5">
            <div className="flex items-baseline gap-3">
              <span className="text-xs font-bold text-ink-3">{i + 1}</span>
              <h3 className="flex-1 font-bold">{s.title}</h3>
              <span className="text-xs text-ink-3">{s.slideBudget} שקפים</span>
            </div>
            <p className="mt-1 text-sm text-ink-2">{s.purpose}</p>
            {s.keyFacts.length ? (
              <ul className="mt-3 grid gap-1.5 text-sm">
                {s.keyFacts.map((f, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" />
                    <span className="flex-1">{f.text}</span>
                    <span className="shrink-0 text-xs text-ink-3">{f.cite.map((c) => cite(c.blockId)).join(", ")}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {editable || own.length ? (
              <div className="mt-4 grid gap-2 border-t border-line pt-3">
                <CommentList projectId={projectId} comments={own} onChanged={onChanged} />
                {editable ? (
                  <CommentComposer
                    projectId={projectId} stage="outline"
                    target={{ kind: "section", ref: s.id }}
                    placeholder="הערה על הפרק הזה"
                    onAdded={onChanged} compact
                  />
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}

      {outline.revisionLog.length ? (
        <section className="card p-5">
          <h3 className="mb-2 font-bold">היסטוריית שינויים</h3>
          <ul className="grid gap-1 text-sm text-ink-2">
            {outline.revisionLog.map((r, i) => <li key={i}>סבב {r.iteration}: {r.summary}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
