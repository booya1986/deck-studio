import { chromium } from "playwright";
import { BLOCKS, BRAND, DOC_META, DOC_TITLE, type Block } from "./content";
import { logoPng } from "./logo";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function blockToHtml(b: Block): string {
  switch (b.kind) {
    case "h1": return `<h1>${esc(b.text)}</h1>`;
    case "h2": return `<h2>${esc(b.text)}</h2>`;
    case "h3": return `<h3>${esc(b.text)}</h3>`;
    case "p": return `<p>${esc(b.text)}</p>`;
    case "li": return `<ul><li>${esc(b.text)}</li></ul>`;
    case "callout": return `<div class="callout">${esc(b.text)}</div>`;
    case "pagebreak": return `<div class="pb"></div>`;
    case "table":
      return `<table><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
        b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
      }</tbody></table>`;
  }
}

/** Merge consecutive single-item lists back into one <ul>. */
function bodyHtml(): string {
  return BLOCKS.map(blockToHtml).join("\n").replace(/<\/ul>\s*<ul>/g, "");
}

function pageHtml(fontCss: string, logoDataUri: string): string {
  const logo = `<img class="logo" src="${logoDataUri}" alt="${esc(BRAND.org)}">`;
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>${esc(DOC_TITLE)}</title>
${fontCss}
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'FixtureHebrew', 'Arial Hebrew', Arial, sans-serif; color: #${BRAND.ink};
         font-size: 11.5pt; line-height: 1.65; margin: 0; }
  header { display: flex; align-items: center; justify-content: space-between;
           border-bottom: 3px solid #${BRAND.primary}; padding-bottom: 10px; margin-bottom: 22px; }
  header .meta { font-size: 8.5pt; color: #6B7785; text-align: left; }
  header .logo { width: 150px; height: auto; }
  h1 { color: #${BRAND.primary}; font-size: 22pt; margin: 0 0 6px; }
  h2 { color: #${BRAND.primary}; font-size: 15pt; margin: 22px 0 8px;
       border-inline-start: 5px solid #${BRAND.accent}; padding-inline-start: 10px; }
  h3 { color: #${BRAND.secondary}; font-size: 12.5pt; margin: 14px 0 4px; }
  p { margin: 0 0 9px; }
  ul { margin: 0 0 10px; padding-inline-start: 20px; }
  li { margin-bottom: 5px; }
  .callout { background: #FFF6E0; border-inline-start: 6px solid #${BRAND.accent};
             padding: 11px 14px; margin: 14px 0; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 10pt; }
  th { background: #${BRAND.primary}; color: #fff; padding: 7px 9px; text-align: right; }
  td { padding: 7px 9px; border-bottom: 1px solid #E2E8EF; }
  tbody tr:nth-child(even) td { background: #F2F5F8; }
  .pb { break-after: page; }
  .doc-meta { color: #6B7785; font-size: 9.5pt; margin-bottom: 4px; }
</style></head>
<body>
  <header>${logo}<div class="meta">${esc(BRAND.org)}<br>${esc(DOC_META)}</div></header>
  ${bodyHtml()}
</body></html>`;
}

export async function buildPdf(): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Try Google Fonts so the PDF embeds a real Hebrew face; fall back to system fonts offline.
    let fontCss = "";
    try {
      const res = await page.request.get(
        "https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&display=swap",
        { timeout: 8000 },
      );
      if (res.ok()) {
        const css = (await res.text()).replace(/font-family:\s*'Heebo'/g, "font-family: 'FixtureHebrew'");
        fontCss = `<style>${css}</style>`;
      }
    } catch {
      // offline: system Hebrew fallback is fine for extraction tests
    }
    const logoDataUri = `data:image/png;base64,${(await logoPng(420)).toString("base64")}`;
    await page.setContent(pageHtml(fontCss, logoDataUri), { waitUntil: "networkidle" });
    await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready);
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
