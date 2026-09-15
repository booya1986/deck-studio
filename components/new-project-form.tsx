"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { slideRangeForDuration } from "@/lib/schema/brief";
import { api } from "@/lib/ui/client";
import { DECK_TYPE_LABEL } from "@/lib/ui/labels";

const DURATIONS = [5, 10, 15, 20, 30, 45, 60];

export function NewProjectForm() {
  const router = useRouter();
  const [durationMin, setDurationMin] = useState(15);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [min, max] = slideRangeForDuration(durationMin);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const project = await api.createProject(new FormData(e.currentTarget));
      router.push(`/p/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div>
        <label className="label" htmlFor="file">מסמך המקור</label>
        <input
          id="file" name="file" type="file" required accept=".pdf,.docx,.pptx"
          onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? null)}
          className="field file:me-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:py-1.5 file:text-sm file:font-semibold"
        />
        <p className="mt-1 text-xs text-ink-3">
          PDF, DOCX או PPTX. אותו קובץ משמש גם לחילוץ השפה העיצובית וגם לתוכן.
          {fileName ? <span className="ltr ms-1 inline-block">{fileName}</span> : null}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">שם הפרויקט</label>
          <input id="name" name="name" className="field" placeholder="נלקח משם הקובץ אם ריק" />
        </div>
        <div>
          <label className="label" htmlFor="deckType">סוג המצגת</label>
          <select id="deckType" name="deckType" className="field" defaultValue="training">
            {Object.entries(DECK_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="audience">קהל היעד</label>
        <input
          id="audience" name="audience" required className="field"
          placeholder="למשל: בנקאי מרכז שירות, ותק שנה עד שלוש"
        />
      </div>

      <div>
        <label className="label" htmlFor="goal">מה הלומד יידע או יעשה בסוף</label>
        <input
          id="goal" name="goal" required className="field"
          placeholder="למשל: יטפל בפנייה דיגיטלית לפי חמשת השלבים ובתוך זמן התקן"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="durationMin">משך המצגת</label>
          <select
            id="durationMin" name="durationMin" className="field" value={durationMin}
            onChange={(e) => setDurationMin(Number(e.currentTarget.value))}
          >
            {DURATIONS.map((d) => <option key={d} value={d}>{d} דקות</option>)}
          </select>
          <p className="mt-1 text-xs text-ink-3">{min}–{max} שקפים</p>
        </div>
        <div>
          <label className="label" htmlFor="notes">הערות (רשות)</label>
          <input id="notes" name="notes" className="field" placeholder="דגשים, מה להשמיט, טון" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" name="aiImages" value="true" className="size-4" />
        לאפשר תמונות שנוצרות ב‑AI. כבוי כברירת מחדל, כי הן נוטות לשבור את השפה העיצובית.
      </label>

      {error ? <p className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{error}</p> : null}

      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "מעלה…" : "צור פרויקט"}
        </button>
      </div>
    </form>
  );
}
