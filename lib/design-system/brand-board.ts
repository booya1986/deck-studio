import type { BrandDecision, DsManifest } from "@/lib/schema/design-system";
import { contrast } from "./palette";
import type { Palette } from "./tokens";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const BADGE: Record<string, { label: string; cls: string }> = {
  extracted: { label: "מהמסמך", cls: "b-ex" },
  inferred: { label: "הושלם", cls: "b-in" },
  user: { label: "נערך", cls: "b-us" },
};

function swatch(name: string, value: string, provenance: string, note?: string) {
  const b = BADGE[provenance] ?? BADGE.inferred;
  return `<figure class="sw">
    <div class="chip" style="background:${value}"></div>
    <figcaption>
      <code dir="ltr">${esc(name)}</code>
      <span class="val" dir="ltr">${esc(value)}</span>
      <span class="badge ${b.cls}">${b.label}</span>
      ${note ? `<span class="note">${esc(note)}</span>` : ""}
    </figcaption>
  </figure>`;
}

/** Static review page for gate 1: what was extracted, what was completed, and how it reads. */
export function brandBoardHtml(args: {
  decision: BrandDecision;
  manifest: DsManifest;
  palette: Palette;
  sourceFile: string;
}): string {
  const { decision: d, manifest, palette: p } = args;
  const role = (n: string) => p.roles[n] ?? "#000000";
  const tokenProv = (n: string) => manifest.tokens.find((t) => t.name === n)?.provenance ?? "inferred";

  const roleNames = [
    "--bg", "--surface", "--surface-2", "--surface-3",
    "--text-1", "--text-2", "--text-3", "--border",
    "--primary", "--primary-soft", "--secondary", "--secondary-soft",
    "--accent", "--accent-soft",
  ];

  const contrastRows = [
    ["טקסט ראשי על הרקע", role("--text-1"), role("--bg"), 4.5],
    ["טקסט משני על הרקע", role("--text-2"), role("--bg"), 4.5],
    ["טקסט שלישוני על הרקע", role("--text-3"), role("--bg"), 4.5],
    ["צבע המותג כטקסט", role("--primary-text"), role("--bg"), 4.5],
    ["טקסט על כפתור ראשי", role("--primary-ink"), role("--primary"), 4.5],
    ["טקסט על הדגשה", role("--accent-ink"), role("--accent"), 4.5],
  ] as const;

  const logo = d.logo.path
    ? `<div class="logos">
         <div class="logo-box light"><img src="${esc(d.logo.path)}" alt="לוגו"></div>
         <div class="logo-box dark"><img src="${esc(d.logo.path)}" alt="לוגו"></div>
       </div>`
    : `<p class="missing">לא נמצא לוגו במסמך. אפשר להעלות קובץ בשער האישור.</p>`;

  const fonts = manifest.brandFonts
    .map((f) => {
      const orig = f.role === "heading" ? d.fonts.heading.value.originalFamily : d.fonts.body.value.originalFamily;
      const swap = f.status === "system_fallback" && orig
        ? `<span class="note">במקום ${esc(orig)}, שאינו נטען בדפדפן</span>`
        : "";
      return `<div class="font-row">
        <div class="specimen" style="font-family:${esc(f.family)},sans-serif">
          <div class="sp-lg">${f.role === "heading" ? "כותרת לדוגמה בעברית" : "פסקת גוף לדוגמה בעברית, עם מספרים 0123456789 ואותיות ABC."}</div>
        </div>
        <div class="font-meta"><strong>${f.role === "heading" ? "כותרות" : "גוף"}</strong>
          <code dir="ltr">${esc(f.family)}</code>${swap}</div>
      </div>`;
    })
    .join("");

  const images = manifest.assets.images.length
    ? `<section><h2>תמונות מהמסמך</h2><div class="imgs">${
        manifest.assets.images.map((i) => `<img src="${esc(i)}" alt="">`).join("")
      }</div></section>`
    : "";

  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>לוח מותג · ${esc(d.orgName)}</title>
<link rel="stylesheet" href="${esc(manifest.brandFonts[0]?.url ?? "")}">
<link rel="stylesheet" href="styles.css">
<style>
  body { margin:0; padding:32px; background:var(--bg); color:var(--text-1);
         font-family:var(--font-body); font-size:16px; line-height:1.5; }
  h1 { font-family:var(--font-heading); font-size:30px; margin:0 0 4px; color:var(--primary-text); }
  h2 { font-family:var(--font-heading); font-size:19px; margin:34px 0 12px;
       border-inline-start:4px solid var(--accent); padding-inline-start:10px; }
  .sub { color:var(--text-2); margin:0 0 8px; font-size:14px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px; }
  .sw { margin:0; background:var(--surface); border:1px solid var(--border);
        border-radius:var(--radius-md); overflow:hidden; }
  .chip { height:56px; }
  .sw figcaption { padding:8px 10px; display:flex; flex-wrap:wrap; gap:6px; align-items:center; font-size:12px; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; color:var(--text-2);
         unicode-bidi:isolate; }
  .val { color:var(--text-3); font-size:11px; unicode-bidi:isolate; }
  .badge { font-size:10px; padding:2px 7px; border-radius:var(--radius-pill); }
  .b-ex { background:var(--success-soft); color:var(--success); }
  .b-in { background:var(--warning-soft); color:var(--warning); }
  .b-us { background:var(--primary-soft); color:var(--primary-text); }
  .note { font-size:11px; color:var(--text-3); width:100%; }
  table { width:100%; border-collapse:collapse; font-size:13px; background:var(--surface);
          border:1px solid var(--border); border-radius:var(--radius-md); overflow:hidden; }
  th,td { padding:8px 10px; text-align:right; border-bottom:1px solid var(--border); }
  th { background:var(--surface-2); font-weight:600; }
  .pass { color:var(--success); font-weight:600; }
  .fail { color:var(--danger); font-weight:600; }
  .logos { display:flex; gap:14px; flex-wrap:wrap; }
  .logo-box { padding:20px 26px; border-radius:var(--radius-md); border:1px solid var(--border); }
  .logo-box.light { background:#fff; }
  .logo-box.dark { background:var(--text-1); }
  .logo-box img { max-height:56px; width:auto; display:block; }
  .font-row { display:flex; gap:18px; align-items:center; flex-wrap:wrap; padding:14px 16px;
              background:var(--surface); border:1px solid var(--border);
              border-radius:var(--radius-md); margin-bottom:10px; }
  .sp-lg { font-size:26px; }
  .font-meta { display:flex; flex-direction:column; gap:3px; font-size:12px; color:var(--text-2); min-width:200px; }
  .imgs { display:flex; gap:10px; flex-wrap:wrap; }
  .imgs img { height:90px; border-radius:var(--radius-sm); border:1px solid var(--border); }
  .sample { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg);
            padding:24px; max-width:620px; }
  .sample .eyebrow { color:var(--accent-text); font-size:12px; letter-spacing:.08em; font-weight:700; }
  .sample h3 { font-family:var(--font-heading); font-size:28px; margin:6px 0 8px; }
  .sample p { color:var(--text-2); margin:0 0 14px; }
  .btn { display:inline-block; background:var(--primary); color:var(--primary-ink);
         padding:9px 20px; border-radius:var(--radius-pill); font-weight:600; font-size:14px; }
  .btn.ghost { background:transparent; color:var(--primary-text); border:1px solid var(--primary-line); margin-inline-start:8px; }
  .bar { height:10px; border-radius:var(--radius-pill); background:var(--gradient); margin:18px 0 6px; }
  .missing { color:var(--warning); background:var(--warning-soft); padding:10px 14px; border-radius:var(--radius-md); }
  .charts { display:flex; gap:8px; }
  .charts span { width:52px; height:52px; border-radius:var(--radius-sm); }
</style></head>
<body>
  <h1>${esc(d.orgName)}</h1>
  <p class="sub">שפה עיצובית שחולצה מתוך ${esc(args.sourceFile)} · מצב ${d.colors.mode === "light" ? "בהיר" : "כהה"}</p>
  <div class="bar"></div>
  ${d.basis === "generic" ? `<p class="missing">המסמך לא מכיל שפה עיצובית משלו. זו תבנית כללית: אפשר להעלות לוגו ולשנות צבעים וגופנים בשער האישור.</p>` : ""}
  <p class="sub">${esc(d.rationale)}</p>

  <section><h2>לוגו</h2>${logo}</section>
  <section><h2>גופנים</h2>${fonts}</section>
  <section><h2>צבעי תפקיד</h2>
    <div class="grid">${roleNames.map((n) => swatch(n, role(n), tokenProv(n))).join("")}</div>
  </section>
  <section><h2>צבעי גרפים</h2><div class="charts">${
    p.chart.map((c) => `<span style="background:${c}"></span>`).join("")
  }</div></section>
  <section><h2>ניגודיות</h2>
    <table><thead><tr><th>שילוב</th><th>יחס</th><th>תקן AA</th></tr></thead><tbody>${
      contrastRows.map(([label, fg, bg, min]) => {
        const r = contrast(fg, bg);
        return `<tr><td>${esc(label)}</td><td dir="ltr">${r.toFixed(2)}</td><td class="${r >= min ? "pass" : "fail"}">${
          r >= min ? "עובר" : "נכשל"
        }</td></tr>`;
      }).join("")
    }</tbody></table>
  </section>
  <section><h2>שקף לדוגמה</h2>
    <div class="sample">
      <div class="eyebrow">נושא המצגת</div>
      <h3>כותרת שקף לדוגמה</h3>
      <p>כך ייראה טקסט גוף על גבי משטח, עם צבעי המותג שחולצו מהמסמך.</p>
      <a class="btn">פעולה ראשית</a><a class="btn ghost">פעולה משנית</a>
    </div>
  </section>
  ${images}
</body></html>`;
}
