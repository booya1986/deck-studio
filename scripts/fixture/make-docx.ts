import {
  AlignmentType, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageBreak,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { BLOCKS, BRAND, DOC_TITLE, type Block } from "./content";
import { logoPng } from "./logo";

const RTL = { bidirectional: true, alignment: AlignmentType.RIGHT } as const;

function runOpts(extra: Record<string, unknown> = {}) {
  // w:cs carries the Hebrew (complex-script) font; w:ascii carries the Latin one.
  return {
    font: { ascii: BRAND.latinFont, hAnsi: BRAND.latinFont, eastAsia: BRAND.latinFont, cs: BRAND.docFont },
    rightToLeft: true,
    ...extra,
  };
}

function blockToDocx(b: Block): (Paragraph | Table)[] {
  switch (b.kind) {
    case "h1":
      return [new Paragraph({
        ...RTL, heading: HeadingLevel.HEADING_1, spacing: { after: 240 },
        children: [new TextRun(runOpts({ text: b.text, bold: true, size: 40, color: BRAND.primary }))],
      })];
    case "h2":
      return [new Paragraph({
        ...RTL, heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 160 },
        children: [new TextRun(runOpts({ text: b.text, bold: true, size: 30, color: BRAND.primary }))],
      })];
    case "h3":
      return [new Paragraph({
        ...RTL, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 },
        children: [new TextRun(runOpts({ text: b.text, bold: true, size: 24, color: BRAND.secondary }))],
      })];
    case "p":
      return [new Paragraph({
        ...RTL, spacing: { after: 140, line: 320 },
        children: [new TextRun(runOpts({ text: b.text, size: 22, color: BRAND.ink }))],
      })];
    case "li":
      return [new Paragraph({
        ...RTL, bullet: { level: 0 }, spacing: { after: 90, line: 300 },
        children: [new TextRun(runOpts({ text: b.text, size: 22, color: BRAND.ink }))],
      })];
    case "callout":
      return [new Paragraph({
        ...RTL, spacing: { before: 180, after: 180 },
        shading: { type: ShadingType.CLEAR, fill: "FFF6E0" },
        border: { right: { style: "single", size: 18, color: BRAND.accent, space: 6 } },
        children: [new TextRun(runOpts({ text: b.text, size: 22, bold: true, color: BRAND.ink }))],
      })];
    case "pagebreak":
      return [new Paragraph({ children: [new PageBreak()] })];
    case "table": {
      const head = new TableRow({
        tableHeader: true,
        children: b.head.map((h) => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: BRAND.primary },
          children: [new Paragraph({ ...RTL, children: [new TextRun(runOpts({ text: h, bold: true, size: 20, color: "FFFFFF" }))] })],
        })),
      });
      const rows = b.rows.map((r, i) => new TableRow({
        children: r.map((c) => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: i % 2 ? "F2F5F8" : "FFFFFF" },
          children: [new Paragraph({ ...RTL, children: [new TextRun(runOpts({ text: c, size: 20, color: BRAND.ink }))] })],
        })),
      }));
      return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: true, rows: [head, ...rows] })];
    }
  }
}

export async function buildDocx(): Promise<Buffer> {
  const logo = await logoPng(420);
  const header = new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new ImageRun({ type: "png", data: logo, transformation: { width: 150, height: 57 } })],
    })],
  });
  const footer = new Footer({
    children: [new Paragraph({
      ...RTL,
      children: [new TextRun(runOpts({ text: `${BRAND.org} · ${DOC_TITLE} · לשימוש פנימי`, size: 16, color: "7A8794" }))],
    })],
  });

  const doc = new Document({
    creator: BRAND.org,
    title: DOC_TITLE,
    description: `${BRAND.org} — נוהל פנימי`,
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: BRAND.latinFont, hAnsi: BRAND.latinFont, eastAsia: BRAND.latinFont, cs: BRAND.docFont },
            size: 22,
            color: BRAND.ink,
          },
        },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 1000, right: 1100, bottom: 1000, left: 1100 } } },
      headers: { default: header },
      footers: { default: footer },
      children: BLOCKS.flatMap(blockToDocx),
    }],
  });
  return Packer.toBuffer(doc) as unknown as Promise<Buffer>;
}
