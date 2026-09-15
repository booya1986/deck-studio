import Link from "next/link";
import { listProjects } from "@/lib/store/projects";
import { NewProjectForm } from "@/components/new-project-form";
import { STAGE_ORDER } from "@/lib/schema/project";
import { DECK_TYPE_LABEL, STAGE_DESCRIPTION, STAGE_LABEL, STATUS_CLASS, STATUS_LABEL, formatCost } from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await listProjects();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Deck Studio</h1>
        <p className="mt-1 text-ink-2">
          מסמך ארגוני אחד נכנס, מצגת הדרכה ממותגת יוצאת. כל שלב נעצר לאישור שלך.
        </p>
      </header>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-bold">פרויקט חדש</h2>
        <NewProjectForm />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">איך זה עובד</h2>
        <ol className="grid gap-2">
          {STAGE_ORDER.map((stage, i) => (
            <li key={stage} className="card flex gap-3 p-4 text-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-ink-2">{i + 1}</span>
              <div>
                <div className="font-semibold">{STAGE_LABEL[stage]}</div>
                <p className="mt-1 text-ink-2">{STAGE_DESCRIPTION[stage].runs}</p>
                <p className="mt-1 text-ink-3"><strong>בשער:</strong> {STAGE_DESCRIPTION[stage].gate}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold">פרויקטים</h2>
        {projects.length === 0 ? (
          <p className="card p-6 text-ink-3">עדיין אין פרויקטים. העלה מסמך כדי להתחיל.</p>
        ) : (
          <ul className="grid gap-3">
            {projects.map((p) => {
              const stage = p.currentStage === "done" ? null : p.currentStage;
              const status = stage ? p.stages[stage]!.status : "approved";
              return (
                <li key={p.id}>
                  <Link href={`/p/${p.id}`} className="card flex items-center gap-4 p-4 hover:border-line-strong">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{p.name}</div>
                      <div className="mt-0.5 truncate text-sm text-ink-3">
                        {DECK_TYPE_LABEL[p.brief.deckType]} · {p.brief.durationMin} דקות ·{" "}
                        {p.brief.slideRange[0]}–{p.brief.slideRange[1]} שקפים · {p.source.filename}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm text-ink-3">{formatCost(p.totalCostUsd)}</span>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}>
                      {stage ? `${STAGE_LABEL[stage]} · ${STATUS_LABEL[status]}` : "הושלם"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
