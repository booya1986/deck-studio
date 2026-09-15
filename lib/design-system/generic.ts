import type { BrandCandidates } from "@/lib/schema/candidates";
import type { BrandDecision } from "@/lib/schema/design-system";
import { isNearNeutral } from "@/lib/extract/pdf";

/**
 * The neutral house template, used when a document carries no visual
 * language of its own: a plain Word procedure, a text-only PDF, a scan.
 * Calm blue, warm amber accent, Heebo/Assistant. Everything is `inferred`.
 */
export function genericDecision(args: { orgName: string; language: "he" | "en" }): BrandDecision {
  const inferred = <T,>(value: T, confidence = 0.5) => ({ value, provenance: "inferred" as const, confidence });
  return {
    orgName: args.orgName,
    language: args.language,
    basis: "generic",
    colors: {
      primary: inferred("#1f4e79"),
      secondary: inferred("#2b7a78"),
      accent: inferred("#d98e04"),
      mode: "light",
    },
    fonts: {
      heading: inferred({ family: "Heebo" }),
      body: inferred({ family: "Assistant" }),
    },
    logo: { provenance: "inferred", background: "transparent", needsUpload: true },
    contentImages: [],
    rationale:
      args.language === "he"
        ? "המסמך לא מכיל שפה עיצובית משלו: אין לוגו, אין צבעי מותג ואין גופן ייחודי. נבחרה תבנית עיצוב כללית ונקייה. אפשר להעלות לוגו ולשנות צבעים בשער האישור."
        : "The document carries no visual language of its own: no logo, no brand colours, no distinctive typeface. A clean generic template was chosen. You can upload a logo and change colours at the approval gate.",
  };
}

/** Fonts that say nothing about a brand. */
const GENERIC_FONTS = /^(arial|calibri|times new roman|times|helvetica|cambria|verdana|tahoma|segoe ui|david|narkisim|miriam|liberation|dejavu|noto sans|noto serif|symbol|wingdings|courier( new)?)$/i;

/**
 * True when the extraction found nothing a designer would call a brand:
 * no plausible logo, no saturated colour used with any weight, no distinctive
 * font. Cheap to decide in code, and it saves an agent run.
 */
export function hasNoBrandSignal(c: BrandCandidates): boolean {
  const logo = c.images.some((i) => i.logoScore >= 0.45 && i.convertible);
  if (logo) return false;

  const totalWeight = c.colors.reduce((a, b) => a + b.count, 0) || 1;
  const brandish = c.colors.filter((col) => !isNearNeutral(col.hex) && col.count / totalWeight >= 0.03);
  if (brandish.length > 0) return false;

  const distinctiveFont = c.fonts.some((f) => f.count > 0 && !GENERIC_FONTS.test(f.family.trim()));
  if (distinctiveFont) return false;

  return true;
}

/** Brand rules for the generic template, written once in code so the stage never lacks them. */
export function genericSkillDoc(language: "he" | "en", orgName: string): string {
  if (language === "en") {
    return `# Visual language · ${orgName} (generic template)

The source document had no visual language of its own, so this deck uses the neutral house template. Every value is a token; never write a hex colour in slide code.

## Colour roles
- \`--bg\` slide background, \`--surface\` cards and tables, \`--surface-2\` subtle separation.
- \`--primary\` carries identity: slide titles, table headers, the primary button. \`--primary-text\` for titles on light ground, \`--primary-ink\` for text on a \`--primary\` surface.
- \`--accent\` (amber) is one emphasis moment per slide: a key number, one highlighted word, the active step. Never for body text.
- \`--secondary\` (teal) for status tags and timelines only.
- Text: \`--text-1\` body, \`--text-2\` secondary, \`--text-3\` notes and sources.
- Charts: \`--chart-1\` to \`--chart-5\` in order, never reordered between slides.

## Type
- Headings \`--font-heading\` weight 700, \`--lh-tight\`. Body \`--font-body\` weight 400, \`--lh-normal\`.
- Sizes only from \`--fs-*\`: display for the title slide, h1 for slide titles, h2 subtitles, body for text, kpi for big numbers, note for sources.
- At most three type sizes on a slide.

## Spacing and shape
- Slide margins \`--space-9\`, between blocks \`--space-7\`, title to body \`--space-5\`, list items \`--space-4\`.
- Cards \`--radius-lg\`, badges \`--radius-pill\`, images \`--radius-md\`. Shadow \`--shadow-sm\` only on cards over \`--bg\`.

## Logo
- None was found. If one is uploaded it sits at the inline-end top corner of the title and closing slides only, height 40 to 96px, clear space \`--space-5\`.

## Forbidden
- Any colour that is not a token. More than one accent moment per slide. Fonts or sizes outside the tokens. Left-aligned Hebrew. Arrows pointing right in RTL text.
`;
  }
  return `# שפה חזותית · ${orgName} (תבנית כללית)

למסמך המקור אין שפה עיצובית משלו, ולכן המצגת משתמשת בתבנית הבית הניטרלית. כל ערך הוא טוקן; אין לכתוב hex בקוד השקפים.

## תפקידי הצבע
- \`--bg\` רקע השקף, \`--surface\` כרטיסים וטבלאות, \`--surface-2\` הפרדה עדינה.
- \`--primary\` נושא את הזהות: כותרות שקף, כותרות טבלה, כפתור ראשי. \`--primary-text\` לכותרות על רקע בהיר, \`--primary-ink\` לטקסט על משטח \`--primary\`.
- \`--accent\` (ענבר) הוא רגע הדגשה אחד בשקף: מספר מפתח, מילה מודגשת, השלב הפעיל. לעולם לא לטקסט רץ.
- \`--secondary\` (טורקיז) לתגיות מצב ולצירי זמן בלבד.
- טקסט: \`--text-1\` גוף, \`--text-2\` משני, \`--text-3\` הערות ומקורות.
- גרפים: \`--chart-1\` עד \`--chart-5\` לפי הסדר, בלי להחליף סדר בין שקפים.

## טיפוגרפיה
- כותרות \`--font-heading\` משקל 700, \`--lh-tight\`. גוף \`--font-body\` משקל 400, \`--lh-normal\`.
- גדלים רק מתוך \`--fs-*\`: display לשקף הפתיחה, h1 לכותרת שקף, h2 לתת־כותרת, body לטקסט, kpi למספרים גדולים, note למקורות.
- לכל היותר שלושה גדלים בשקף.

## ריווח וצורה
- שולי שקף \`--space-9\`, בין בלוקים \`--space-7\`, כותרת לגוף \`--space-5\`, בין פריטי רשימה \`--space-4\`.
- כרטיסים \`--radius-lg\`, תגיות \`--radius-pill\`, תמונות \`--radius-md\`. צל \`--shadow-sm\` רק על כרטיס מעל \`--bg\`.

## לוגו
- לא נמצא לוגו. אם יועלה, מקומו בפינה העליונה בצד ההתחלה של שקף הפתיחה והסיום בלבד, גובה 40 עד 96 פיקסלים, מרווח נשימה \`--space-5\`.

## אסור
- צבע שאינו טוקן. יותר מרגע הדגשה אחד בשקף. גופן או גודל מחוץ לטוקנים. יישור לשמאל של עברית. חץ שפונה ימינה בטקסט עברי (בעברית "מוביל אל" הוא ←).
`;
}
