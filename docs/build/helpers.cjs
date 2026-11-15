// Small helper layer over docx-js: headings, paragraphs with **bold** / `code` mini-markup, lists, tables, code blocks, figures.
const fs = require("node:fs");
const path = require("node:path");
const {
  Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType, ImageRun, LevelFormat, PageBreak,
} = require("docx");

const FONT = "Arial";
const MONO = "Consolas";
const CONTENT_WIDTH = 9360; // US Letter, 1" margins, in DXA
const COLORS = { primary: "3F58D4", text: "1F2937", muted: "6B7280", head: "E8ECFF", band: "F6F7FB", border: "CBD2E3", code: "F3F4F6", ok: "E6F6F0", warn: "FFF4DB" };

/** "Some **bold** and `code`" -> TextRuns */
function runs(text, base = {}) {
  return String(text)
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter((s) => s !== "")
    .map((part) => {
      if (part.startsWith("**")) return new TextRun({ text: part.slice(2, -2), bold: true, font: FONT, ...base });
      if (part.startsWith("`")) return new TextRun({ text: part.slice(1, -1), font: MONO, size: (base.size ?? 21) - 2, color: "9A3412", ...base, bold: base.bold });
      return new TextRun({ text: part, font: FONT, ...base });
    });
}

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT })], pageBreakBefore: true });
const h1Inline = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT })] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t, font: FONT })] });

const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, children: runs(text), ...opts });

const bullets = (items, level = 0) =>
  items.map((t) => new Paragraph({ numbering: { reference: "bullets", level }, spacing: { after: 60, line: 264 }, children: runs(t) }));

let numberedCounter = 0;
/** Each call restarts numbering at 1. */
const numbered = (items) => {
  const ref = `numbers-${++numberedCounter}`;
  numbered.refs.push(ref);
  return items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60, line: 264 }, children: runs(t) }));
};
numbered.refs = [];

const border = { style: BorderStyle.SINGLE, size: 4, color: COLORS.border };
const borders = { top: border, bottom: border, left: border, right: border };

/** widths: DXA numbers summing to CONTENT_WIDTH (or less). */
function table(headers, rows, widths, opts = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (content, w, i, header, rowIdx) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      borders,
      shading: header ? { type: ShadingType.CLEAR, fill: COLORS.head } : rowIdx % 2 === 1 ? { type: ShadingType.CLEAR, fill: COLORS.band } : undefined,
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      children: String(content)
        .split("\n")
        .map((line) => new Paragraph({ spacing: { after: 20 }, children: runs(line, { size: opts.size ?? 18, bold: header ? true : undefined }) })),
    });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, widths[i], i, true, 0)) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], i, false, ri)) })),
    ],
  });
}

/** Shaded monospace block, one Paragraph per line. */
function code(lines, caption) {
  const out = lines.map(
    (line, i) =>
      new Paragraph({
        spacing: { after: 0, line: 252 },
        shading: { type: ShadingType.CLEAR, fill: COLORS.code },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.primary, space: 6 } },
        indent: { left: 140 },
        keepLines: true,
        keepNext: i < lines.length - 1,
        children: [new TextRun({ text: line === "" ? " " : line, font: MONO, size: 18 })],
      }),
  );
  out.push(new Paragraph({ spacing: { after: 120 }, children: caption ? [new TextRun({ text: caption, italics: true, size: 17, color: COLORS.muted, font: FONT })] : [] }));
  return out;
}

/** Call-out box (single-cell table). kind: "note" | "tip" | "warn" */
function callout(title, text, kind = "note") {
  const fill = kind === "warn" ? COLORS.warn : kind === "tip" ? COLORS.ok : COLORS.head;
  const bar = kind === "warn" ? "D97706" : kind === "tip" ? "059669" : COLORS.primary;
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill },
            borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.SINGLE, size: 24, color: bar } },
            margins: { top: 100, bottom: 100, left: 180, right: 160 },
            children: [
              new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: title, bold: true, font: FONT, size: 20 })] }),
              ...String(text).split("\n").map((l) => new Paragraph({ spacing: { after: 40, line: 264 }, children: runs(l, { size: 19 }) })),
            ],
          }),
        ],
      }),
    ],
  });
}

const spacer = (after = 120) => new Paragraph({ spacing: { after }, children: [] });

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

let figureNo = 0;
/** Embeds docs/diagrams/png/<name>.png scaled to fit the page. */
function figure(name, caption, { maxW = 600, maxH = 680 } = {}) {
  const file = path.join(__dirname, "..", "diagrams", "png", `${name}.png`);
  const { w, h } = pngSize(file);
  const cssW = w / 2;
  const cssH = h / 2;
  const scale = Math.min(1, maxW / cssW, maxH / cssH);
  figureNo += 1;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
      keepNext: true,
      children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: Math.round(cssW * scale), height: Math.round(cssH * scale) }, altText: { title: caption, description: caption, name } })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `Figure ${figureNo}. ${caption}`, italics: true, size: 18, color: COLORS.muted, font: FONT })] }),
  ];
}

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

module.exports = { FONT, MONO, COLORS, CONTENT_WIDTH, runs, h1, h1Inline, h2, h3, p, bullets, numbered, table, code, callout, spacer, figure, pageBreak, LevelFormat };
