import type { StageId, StageStatus } from "@/lib/schema/project";

export const STAGE_LABEL: Record<StageId, string> = {
  design_system: "שפה עיצובית",
  outline: "מתווה",
  research: "מחקר ופירוק שקפים",
  build: "בניית המצגת",
  qa: "בקרת איכות",
};

export const STAGE_HINT: Record<StageId, string> = {
  design_system: "חילוץ לוגו, צבעים וגופנים מהמסמך",
  outline: "מטרות למידה וחלוקה לפרקים",
  research: "אימות עובדות ופירוק לשקפים",
  build: "כתיבת המצגת מהטוקנים",
  qa: "בדיקה בדפדפן ותיקונים",
};

/** What actually happens in each stage, and what the reviewer does at its gate. */
export const STAGE_DESCRIPTION: Record<StageId, { runs: string; gate: string; agents: string }> = {
  design_system: {
    runs:
      "חילוץ דטרמיניסטי של הטקסט, התמונות והצבעים מהמסמך, ואז סוכן ניתוח מותג מחליט על צבע ראשי, משני והדגשה, גופנים ולוגו, ומסביר מה חולץ ומה הושלם בהיסק. מסמך בלי סימני מיתוג מקבל תבנית גנרית בלי הרצת סוכן.",
    gate: "אפשר לשנות צבעים, גופנים ולוגו ישירות, בלי עלות סוכן. לוח המותג מתעדכן מיד. כשמרוצים, מאשרים.",
    agents: "brand-analyst",
  },
  outline: {
    runs:
      "סוכן מעצב למידה קורא את כל המסמך, מנסח מטרות למידה לפי הקהל והמטרה שבבריף, ומחלק לפרקים עם תקציב שקפים. סוכן מבקר בודק כיסוי, עיגון במסמך ונקודות עיוורות, והמעצב מתקן לפי הממצאים. כל עובדה במתווה מצטטת מקום במסמך.",
    gate: "קוראים את המטרות והפרקים. הערה על פרק ו\"שלח לתיקון\" מריצים סבב תיקון וחוזרים לשער. אישור מפעיל את שלב המחקר.",
    agents: "learning-designer, outline-critic",
  },
  research: {
    runs:
      "מוביל מחקר מפעיל שלושה סוכני משנה: חוקר שמחפש ברשת הקשר, דוגמאות וסימני התיישנות לכל פרק; בודק עובדות שמאמת כל טענה מול המסמך בלבד; ומבקר פירוק. התוצר הוא פירוק לשקפים, מסר אחד לשקף, עם פסק דין לכל עובדה. סתירות בין המסמך לרשת מוצגות לך ולא נפתרות על ידי סוכן.",
    gate: "עוברים על השקפים ועל פסקי הדין. הערה על שקף מריצה סבב תיקון. אישור מפעיל את בניית המצגת.",
    agents: "research-lead, ld-researcher, fact-checker, breakdown-critic",
  },
  build: {
    runs:
      "סוכן בונה המצגת כותב את השקפים ב־HTML ו־CSS מתוך טוקני השפה העיצובית בלבד, ומרכיב דטרמיניסטי מכניס אותם לתבנית ומייצר קובץ מצגת אחד עצמאי. בדיקה מכנית של גלישה, צבעים מחוץ לטוקנים וניגודיות רצה כבר כאן.",
    gate: "עוברים על המצגת בתוך הדף. הערה נצמדת לשקף שמוצג. אישור מפעיל את בקרת האיכות.",
    agents: "deck-builder",
  },
  qa: {
    runs:
      "בודק אוטומטי מצלם כל שקף בדפדפן ומאתר גלישה, צבעים מחוץ לשפה וטקסט חסר. שופט קורא את הצילומים ומדרג ממצאים לפי חומרה, ובונה המצגת מתקן. עד שני סבבים, עד שמונה ממצאים בכל סבב.",
    gate: "ממצאים מוצגים לפי השקף שמוצג. הערות שלך מפעילות סבב תיקון נוסף. אישור מסיים את הפרויקט.",
    agents: "qa-judge, deck-builder",
  },
};

export const STATUS_LABEL: Record<StageStatus, string> = {
  idle: "ממתין",
  running: "רץ",
  awaiting_approval: "ממתין לאישור",
  approved: "אושר",
  failed: "נכשל",
  stale: "לא מעודכן",
};

export const STATUS_CLASS: Record<StageStatus, string> = {
  idle: "bg-surface-2 text-ink-3",
  running: "bg-brand-soft text-brand",
  awaiting_approval: "bg-warn-soft text-warn",
  approved: "bg-ok-soft text-ok",
  failed: "bg-err-soft text-err",
  stale: "bg-warn-soft text-warn",
};

export const DECK_TYPE_LABEL: Record<string, string> = {
  training: "הדרכה",
  procedure: "נוהל",
  onboarding: "קליטה",
  policy_update: "עדכון מדיניות",
  workshop: "סדנה",
};

export const PROVENANCE_LABEL: Record<string, string> = {
  extracted: "מהמסמך",
  inferred: "הושלם",
  user: "נערך",
};

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
