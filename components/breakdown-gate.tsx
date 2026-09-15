"use client";

import { useEffect, useState } from "react";
import type { Breakdown } from "@/lib/schema/breakdown";
import type { Facts } from "@/lib/schema/facts";
import type { Comment } from "@/lib/schema/comments";
import { artifact } from "@/lib/ui/client";
import { CommentComposer, CommentList } from "./comment-list";

const VERDICT_CLASS: Record<string, string> = {
  SOURCED: "bg-ok-soft text-ok",
  STALE: "bg-warn-soft text-warn",
  UNSOURCED: "bg-warn-soft text-warn",
  DISTORTED: "bg-err-soft text-err",
  WRONG: "bg-err-soft text-err",
};
const VERDICT_LABEL: Record<string, string> = {
  SOURCED: "מהמסמך",
  STALE: "עלול להתיישן",
  UNSOURCED: "לא במסמך",
  DISTORTED: "עוות",
  WRONG: "סותר את המסמך",
};
const VISUAL_LABEL: Record<string, string> = {
  svg_diagram: "דיאגרמה",
  chart: "גרף",
  icon_grid: "רשת אייקונים",
  image: "תמונה מהמסמך",
  gsap_reveal: "חשיפה בשלבים",
  none: "ללא",
};

/** Gate 3: one card per planned slide, with the facts it rests on and a comment box. */
export function BreakdownGate({
  projectId, editable, comments, onChanged,
}: {
  projectId: string;
  editable: boolean;
  comments: Comment[];
  onChanged: () => void;
}) {
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openNotes, setOpenNotes] = useState<Set<number>>(new Set());

  useEffect(() => {
    artifact<Breakdown>(projectId, "breakdown").then(setBreakdown).catch((e) => setError(e.message));
    artifact<Facts>(projectId, "facts").then(setFacts).catch(() => {});
  }, [projectId, comments.length]);

  if (error) return <p className="card p-4 text-err">{error}</p>;
  if (!breakdown) return <p className="card p-4 text-ink-3">טוען פירוק שקפים…</p>;

  const claim = (id: string) => facts?.claims.find((c) => c.id === id);
  const contradictions = facts?.contradictions ?? [];

  return (
    <div className="grid gap-4">
      <section className="card flex flex-wrap items-center gap-4 p-4 text-sm">
        <span className="font-bold">{breakdown.title}</span>
        <span className="text-ink-3">{breakdown.slides.length} שקפים</span>
        {facts ? (
          <span className="text-ink-3">
            {facts.claims.length} טענות נבדקו ·{" "}
            {facts.claims.filter((c) => c.verdict !== "SOURCED").length} דורשות תשומת לב
          </span>
        ) : null}
      </section>

      {contradictions.length ? (
        <section className="card border-warn bg-warn-soft p-4">
          <h3 className="mb-2 font-bold text-warn">סתירות בין המסמך לרשת</h3>
          <ul className="grid gap-2 text-sm">
            {contradictions.map((c, i) => (
              <li key={i}>
                <div><strong>המסמך:</strong> {c.docSays}</div>
                <div><strong>הרשת:</strong> {c.webSays}</div>
                <div className="ltr text-xs text-ink-3">{c.sources.join(" · ")}</div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-2">המסמך נשאר מקור האמת במצגת. אם המסמך מיושן, כתוב הערה.</p>
        </section>
      ) : null}

      {breakdown.slides.map((s) => {
        const own = comments.filter((c) => c.target.kind === "slide" && c.target.ref === String(s.n));
        const claims = s.claimIds.map(claim).filter((c): c is NonNullable<typeof c> => !!c);
        const notesOpen = openNotes.has(s.n);
        return (
          <section key={s.n} className="card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-xs font-bold">{s.n}</span>
              <h3 className="flex-1 font-bold">{s.title}</h3>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">{s.layout}</span>
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand">{VISUAL_LABEL[s.visual.type]}</span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: s.confidence >= 0.9 ? "var(--app-ok-soft)" : "var(--app-warn-soft)", color: s.confidence >= 0.9 ? "var(--app-ok)" : "var(--app-warn)" }}
                title="ביטחון בעובדות"
              >
                {Math.round(s.confidence * 100)}%
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-ink-2">{s.keyMessage}</p>
            {s.body.length ? (
              <ul className="mt-2 grid gap-1 text-sm">
                {s.body.map((line, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" />{line}</li>)}
              </ul>
            ) : null}
            {s.visual.type !== "none" ? (
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2"><strong>המחשה:</strong> {s.visual.spec}</p>
            ) : null}
            {claims.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {claims.map((c) => (
                  <span key={c.id} className={`rounded-full px-2 py-0.5 text-[11px] ${VERDICT_CLASS[c.verdict]}`} title={c.note ?? c.docQuote ?? ""}>
                    {VERDICT_LABEL[c.verdict]}: {c.text.slice(0, 50)}{c.text.length > 50 ? "…" : ""}
                  </span>
                ))}
              </div>
            ) : null}
            <button
              className="mt-3 text-xs text-brand hover:underline"
              onClick={() => setOpenNotes((prev) => { const n = new Set(prev); if (n.has(s.n)) n.delete(s.n); else n.add(s.n); return n; })}
            >
              {notesOpen ? "הסתר הערות למציג" : "הערות למציג"}
            </button>
            {notesOpen ? <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{s.speakerNotes}</p> : null}

            {editable || own.length ? (
              <div className="mt-4 grid gap-2 border-t border-line pt-3">
                <CommentList projectId={projectId} comments={own} onChanged={onChanged} />
                {editable ? (
                  <CommentComposer
                    projectId={projectId} stage="research"
                    target={{ kind: "slide", ref: String(s.n) }}
                    placeholder="הערה על השקף הזה"
                    onAdded={onChanged} compact
                  />
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
