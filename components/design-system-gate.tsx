"use client";

import { useEffect, useRef, useState } from "react";
import type { BrandDecision, DsManifest } from "@/lib/schema/design-system";
import { GOOGLE_FONTS } from "@/lib/design-system/fonts";
import { api, fileUrl } from "@/lib/ui/client";
import { PROVENANCE_LABEL } from "@/lib/ui/labels";

const COLOR_ROLES = [
  { key: "primary", label: "צבע ראשי" },
  { key: "secondary", label: "צבע משני" },
  { key: "accent", label: "צבע הדגשה" },
  { key: "neutralSeed", label: "גוון הניטרלים" },
] as const;

const PROV_CLASS: Record<string, string> = {
  extracted: "bg-ok-soft text-ok",
  inferred: "bg-warn-soft text-warn",
  user: "bg-brand-soft text-brand",
};

/** Gate 1: review what was extracted, correct it, then approve. */
export function DesignSystemGate({
  projectId, editable, onChanged,
}: {
  projectId: string;
  editable: boolean;
  onChanged: () => void;
}) {
  const [decision, setDecision] = useState<BrandDecision | null>(null);
  const [manifest, setManifest] = useState<DsManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [boardKey, setBoardKey] = useState(0);
  const logoInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const data = await api.getDesignSystem(projectId);
      setDecision(data.decision);
      setManifest(data.manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function patch(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api.patchDesignSystem(projectId, body);
      await load();
      setBoardKey((k) => k + 1);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  if (error && !decision) return <p className="card p-4 text-err">{error}</p>;
  if (!decision || !manifest) return <p className="card p-4 text-ink-3">טוען שפה עיצובית…</p>;

  const hebrewFonts = GOOGLE_FONTS.filter((f) => f.script === "hebrew");

  return (
    <div className="grid gap-5">
      <section className="card p-5">
        <h3 className="mb-1 font-bold">מה חולץ מהמסמך</h3>
        <p className="text-sm leading-relaxed text-ink-2">{decision.rationale}</p>
      </section>

      <section className="card p-5">
        <h3 className="mb-4 font-bold">צבעים</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {COLOR_ROLES.map(({ key, label }) => {
            const entry = decision.colors[key];
            return (
              <div key={key} className="flex items-center gap-3">
                <input
                  type="color"
                  className="size-10 shrink-0 cursor-pointer rounded-lg border border-line bg-surface"
                  value={entry?.value ?? "#cccccc"}
                  disabled={!editable || busy}
                  onChange={(e) => void patch({ colors: { [key]: e.currentTarget.value } })}
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="flex items-center gap-2">
                    <span className="ltr text-xs text-ink-3">{entry?.value ?? "לא נמצא"}</span>
                    {entry ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PROV_CLASS[entry.provenance]}`}>
                        {PROVENANCE_LABEL[entry.provenance]}
                        {entry.provenance !== "user" ? ` ${Math.round(entry.confidence * 100)}%` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-ink-2">מצב:</span>
          <select
            className="field w-auto py-1"
            value={decision.colors.mode}
            disabled={!editable || busy}
            onChange={(e) => void patch({ mode: e.currentTarget.value })}
          >
            <option value="light">בהיר</option>
            <option value="dark">כהה</option>
          </select>
        </label>
      </section>

      <section className="card p-5">
        <h3 className="mb-4 font-bold">גופנים</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["heading", "body"] as const).map((role) => {
            const f = decision.fonts[role];
            return (
              <div key={role}>
                <label className="label">{role === "heading" ? "כותרות" : "טקסט רץ"}</label>
                <select
                  className="field"
                  value={f.value.family}
                  disabled={!editable || busy}
                  onChange={(e) => void patch({ fonts: { [role]: e.currentTarget.value } })}
                >
                  {hebrewFonts.map((g) => <option key={g.family} value={g.family}>{g.family}</option>)}
                </select>
                {f.value.originalFamily ? (
                  <p className="mt-1 text-xs text-ink-3">
                    במסמך: <span className="ltr">{f.value.originalFamily}</span>, שאינו נטען בדפדפן
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-5">
        <h3 className="mb-3 font-bold">לוגו</h3>
        <div className="flex flex-wrap items-center gap-4">
          {decision.logo.path ? (
            <div className="rounded-lg border border-line bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${fileUrl(projectId, `design-system/${decision.logo.path}`)}?v=${boardKey}`}
                alt="לוגו" className="max-h-14 w-auto"
              />
            </div>
          ) : (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              לא נמצא לוגו במסמך. אפשר להעלות קובץ.
            </p>
          )}
          <input
            ref={logoInput} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="hidden"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                await api.uploadLogo(projectId, file);
                await load();
                setBoardKey((k) => k + 1);
                onChanged();
              } catch (err) {
                setError(err instanceof Error ? err.message : "שגיאה");
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
          <button
            className="btn btn-ghost" disabled={!editable || busy}
            onClick={() => logoInput.current?.click()}
          >
            {decision.logo.path ? "החלף לוגו" : "העלה לוגו"}
          </button>
        </div>
      </section>

      {error ? <p className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{error}</p> : null}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="font-bold">לוח המותג</h3>
          <a
            className="text-sm text-brand hover:underline"
            href={fileUrl(projectId, "design-system/brand-board.html")}
            target="_blank" rel="noreferrer"
          >
            פתח בכרטיסייה חדשה
          </a>
        </div>
        <iframe
          key={boardKey}
          title="לוח המותג"
          src={`${fileUrl(projectId, "design-system/brand-board.html")}?v=${boardKey}`}
          className="h-[70vh] w-full border-0"
        />
      </section>
    </div>
  );
}
