"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { STAGE_ORDER, type StageId } from "@/lib/schema/project";
import type { RunEvent } from "@/lib/store/runlog";
import { api, fileUrl, subscribe, type ProjectView } from "@/lib/ui/client";
import {
  DECK_TYPE_LABEL, STAGE_DESCRIPTION, STAGE_HINT, STAGE_LABEL, STATUS_CLASS, STATUS_LABEL, formatCost,
} from "@/lib/ui/labels";
import { DesignSystemGate } from "./design-system-gate";
import { OutlineGate } from "./outline-gate";
import { BreakdownGate } from "./breakdown-gate";
import { DeckGate } from "./deck-gate";
import { CommentComposer, CommentList } from "./comment-list";
import { RunLog, describeEvent } from "./run-log";

/** Human-readable artifacts a reviewer may want to open as-is, per stage. */
const STAGE_FILES: Partial<Record<StageId, { label: string; path: string }[]>> = {
  design_system: [{ label: "לוח המותג", path: "design-system/brand-board.html" }],
  outline: [{ label: "המתווה (Markdown)", path: "outline/outline.md" }],
  research: [
    { label: "דוח המחקר", path: "research/research.md" },
    { label: "פירוק השקפים", path: "research/breakdown.md" },
  ],
  build: [{ label: "המצגת", path: "deck/index.html" }],
  qa: [{ label: "המצגת", path: "deck/index.html" }],
};

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, "0")} דק׳` : `${s} שנ׳`;
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ProjectView | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [selected, setSelected] = useState<StageId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [allStagesLog, setAllStagesLog] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      setView(await api.getProject(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    return subscribe(projectId, {
      onReplay: (list) => setEvents(list),
      onEvent: (e) => {
        setEvents((prev) => [...prev, e].slice(-400));
        // A finished or failed run changes project state; pull it again.
        if (e.type === "result" || e.type === "error" || (e.payload as { finished?: boolean })?.finished) {
          void refresh();
        }
      },
    });
  }, [projectId, refresh]);

  // A one-second clock so the running card shows elapsed time.
  useEffect(() => {
    if (!view?.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [view?.running]);

  const project = view?.project;
  const activeStage: StageId = useMemo(() => {
    if (selected) return selected;
    if (view?.running) return view.running.stage;
    if (project && project.currentStage !== "done") return project.currentStage;
    return "qa";
  }, [selected, view, project]);

  if (error && !view) return <main className="p-10 text-err">{error}</main>;
  if (!view || !project) return <main className="p-10 text-ink-3">טוען…</main>;

  const stageState = project.stages[activeStage]!;
  const isRunning = view.running?.stage === activeStage;
  const stageComments = view.comments.filter(
    (c) => c.stage === activeStage && c.resolvedInIteration === undefined,
  );

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  const stageEvents = allStagesLog ? events : events.filter((e) => e.stage === activeStage);
  const lastActivity = [...stageEvents].reverse().find((e) => e.type === "text" || e.type === "tool" || e.type === "progress");
  const startedAt = stageState.lastRun?.startedAt ? Date.parse(stageState.lastRun.startedAt) : null;
  const stageFiles = (STAGE_FILES[activeStage] ?? []).filter((f) => {
    if (activeStage === "design_system") return view.artifacts.brandBoard;
    if (activeStage === "outline") return view.artifacts.outline;
    if (activeStage === "research") return view.artifacts.breakdown;
    return view.artifacts.deck;
  });

  const canStart = ["idle", "failed", "stale"].includes(stageState.status) && !view.running;
  const canRevise = stageState.status === "awaiting_approval" && stageComments.length > 0 && !view.running;
  const canApprove = stageState.status === "awaiting_approval" && !view.running;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[280px_1fr]">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <Link href="/" className="text-sm text-ink-3 hover:text-ink">← כל הפרויקטים</Link>
        <h1 className="mt-2 text-xl font-bold leading-tight">{project.name}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {DECK_TYPE_LABEL[project.brief.deckType]} · {project.brief.durationMin} דקות ·{" "}
          {project.brief.slideRange[0]}–{project.brief.slideRange[1]} שקפים
        </p>
        <p className="mt-1 text-sm text-ink-3">
          עלות עד כה {formatCost(project.totalCostUsd)}
        </p>

        <ol className="mt-5 grid gap-2">
          {STAGE_ORDER.map((stage, i) => {
            const st = project.stages[stage]!;
            const active = stage === activeStage;
            return (
              <li key={stage}>
                <button
                  onClick={() => setSelected(stage)}
                  className={`card w-full p-3 text-right transition-colors ${active ? "border-brand" : "hover:border-line-strong"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-ink-2">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-sm font-semibold">{STAGE_LABEL[stage]}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[st.status]}`}>
                      {STATUS_LABEL[st.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-3">
                    {STAGE_HINT[stage]}
                    {st.lastRun?.costUsd ? <> · <bdi>{formatCost(st.lastRun.costUsd)}</bdi></> : null}
                  </p>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <section className="min-w-0">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold">{STAGE_LABEL[activeStage]}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[stageState.status]}`}>
            {STATUS_LABEL[stageState.status]}
            {stageState.iteration > 1 ? ` · סבב ${stageState.iteration}` : ""}
          </span>
          {stageState.lastRun?.endedAt && stageState.lastRun.costUsd !== undefined ? (
            <span className="text-xs text-ink-3">
              {formatCost(stageState.lastRun.costUsd)} · {stageState.lastRun.numTurns ?? 0} סבבים
            </span>
          ) : null}
          <div className="ms-auto flex gap-2">
            {isRunning ? (
              <button
                className="btn btn-ghost" disabled={busy}
                onClick={() => {
                  if (window.confirm("לעצור את השלב? מה שהסוכן כבר עשה בריצה הזאת לא יישמר.")) void act(() => api.stop(projectId));
                }}
              >
                עצור שלב
              </button>
            ) : null}
            {canStart ? (
              <button className="btn btn-primary" disabled={busy} onClick={() => act(() => api.run(projectId, activeStage, "initial"))}>
                {stageState.status === "idle" ? "הפעל שלב" : "הרץ מחדש"}
              </button>
            ) : null}
            {canRevise ? (
              <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => api.run(projectId, activeStage, "revise"))}>
                שלח לתיקון ({stageComments.length})
              </button>
            ) : null}
            {canApprove ? (
              <button
                className="btn btn-primary" disabled={busy}
                onClick={() => act(async () => {
                  await api.approve(projectId, activeStage);
                  // Follow the stage that the approval just started.
                  setSelected(null);
                })}
              >
                אשר והמשך
              </button>
            ) : null}
          </div>
        </header>

        {stageState.lastRun?.error ? (
          <p className="mb-4 rounded-lg bg-err-soft px-4 py-3 text-sm text-err">
            {stageState.lastRun.error}
          </p>
        ) : null}
        {error ? <p className="mb-4 rounded-lg bg-err-soft px-4 py-3 text-sm text-err">{error}</p> : null}

        {isRunning ? (
          <div className="mb-4 rounded-lg bg-brand-soft px-4 py-3 text-sm text-brand">
            <div className="flex flex-wrap items-center gap-3">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
              </span>
              <span className="font-semibold">{STAGE_LABEL[activeStage]} רץ עכשיו</span>
              {startedAt ? <span className="ltr text-xs">{formatElapsed(now - startedAt)}</span> : null}
              <span className="text-xs">{stageEvents.length} אירועים ביומן</span>
            </div>
            {lastActivity ? (
              <p className={`mt-2 line-clamp-2 text-xs text-ink-2 ${lastActivity.type === "tool" ? "ltr text-left" : ""}`}>
                {describeEvent(lastActivity)}
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-2">מתחיל…</p>
            )}
          </div>
        ) : null}

        <details className="card mb-4 px-5 py-3 text-sm" open={stageState.status === "idle" || stageState.status === "running"}>
          <summary className="cursor-pointer font-semibold">מה קורה בשלב הזה</summary>
          <p className="mt-2 leading-relaxed text-ink-2">{STAGE_DESCRIPTION[activeStage].runs}</p>
          <p className="mt-2 leading-relaxed text-ink-2"><strong>בשער:</strong> {STAGE_DESCRIPTION[activeStage].gate}</p>
          <p className="ltr mt-2 text-left text-xs text-ink-3">{STAGE_DESCRIPTION[activeStage].agents}</p>
        </details>

        {stageFiles.length ? (
          <p className="mb-4 flex flex-wrap gap-3 text-sm">
            {stageFiles.map((f) => (
              <a
                key={f.path} className="text-brand hover:underline"
                href={fileUrl(projectId, f.path)} target="_blank" rel="noreferrer"
              >
                פתח {f.label} בכרטיסייה חדשה
              </a>
            ))}
          </p>
        ) : null}

        {isRunning && stageFiles.length > 0 ? (
          <p className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
            התוצר שמוצג למטה הוא מהריצה הקודמת. כפתור האישור יופיע כשהריצה הנוכחית תסתיים והתוצר יתעדכן.
          </p>
        ) : null}

        <StagePanel
          stage={activeStage}
          projectId={projectId}
          view={view}
          editable={stageState.status === "awaiting_approval" && !view.running}
          onChanged={refresh}
        />

        {stageState.status === "awaiting_approval" ? (
          <section className="card mt-5 p-5">
            <h3 className="mb-3 font-bold">הערות לשלב</h3>
            <CommentList projectId={projectId} comments={stageComments} onChanged={refresh} />
            <div className="mt-3">
              <CommentComposer
                projectId={projectId}
                stage={activeStage}
                target={{ kind: "general" }}
                placeholder="מה לשנות? ההערה נשלחת לסוכן בסבב התיקון."
                onAdded={refresh}
              />
            </div>
          </section>
        ) : null}

        <section className="card mt-5 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <h3 className="font-bold">יומן ריצה · {allStagesLog ? "כל השלבים" : STAGE_LABEL[activeStage]}</h3>
            <span className="text-xs text-ink-3">{stageEvents.length}</span>
            <label className="ms-auto flex items-center gap-2 text-xs text-ink-2">
              <input type="checkbox" className="size-3.5" checked={allStagesLog} onChange={(e) => setAllStagesLog(e.currentTarget.checked)} />
              הצג את כל השלבים
            </label>
          </div>
          <RunLog events={stageEvents} />
        </section>
      </section>
    </main>
  );
}

function StagePanel({
  stage, projectId, view, editable, onChanged,
}: {
  stage: StageId;
  projectId: string;
  view: ProjectView;
  editable: boolean;
  onChanged: () => void;
}) {
  const status = view.project.stages[stage]!.status;

  if (stage === "design_system") {
    if (!view.artifacts.brandDecision) {
      return (
        <p className="card p-6 text-ink-3">
          {status === "running"
            ? "מחלץ את השפה העיצובית מהמסמך…"
            : "השלב עוד לא רץ. הפעל אותו כדי לחלץ לוגו, צבעים וגופנים מהמסמך."}
        </p>
      );
    }
    return <DesignSystemGate projectId={projectId} editable={editable} onChanged={onChanged} />;
  }

  const stageComments = view.comments.filter((c) => c.stage === stage && c.resolvedInIteration === undefined);
  const waiting = (what: string) => (
    <p className="card p-6 text-ink-3">
      {status === "running" ? `${what}…` : "השלב עוד לא רץ. הוא מתחיל אוטומטית אחרי אישור השלב הקודם."}
    </p>
  );

  if (stage === "outline") {
    if (!view.artifacts.outline) return waiting("כותב מתווה ומטרות למידה");
    return <OutlineGate projectId={projectId} editable={editable} comments={stageComments} onChanged={onChanged} />;
  }
  if (stage === "research") {
    if (!view.artifacts.breakdown) return waiting("חוקר, מאמת עובדות מול המסמך ומפרק לשקפים");
    return <BreakdownGate projectId={projectId} editable={editable} comments={stageComments} onChanged={onChanged} />;
  }

  if (stage === "build" || stage === "qa") {
    if (!view.artifacts.deck) return waiting(stage === "build" ? "בונה את המצגת מהטוקנים" : "בודק את המצגת בדפדפן");
    return (
      <DeckGate
        projectId={projectId} project={view.project} stage={stage} qaIterations={view.qaIterations}
        editable={editable} comments={stageComments} onChanged={onChanged}
      />
    );
  }

  return <p className="card p-6 text-ink-3">שלב לא מוכר.</p>;
}
