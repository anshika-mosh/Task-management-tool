// Generates docs/TaskFlow-Documentation.docx
//   node docs/render-diagrams.mjs   (once, or after changing diagrams)
//   node docs/build-docs.cjs
const fs = require("node:fs");
const path = require("node:path");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, PageNumber, TableOfContents, LevelFormat, BorderStyle, TabStopType,
} = require("docx");
const H = require("./build/helpers.cjs");

const { FONT, COLORS, table, p, spacer } = H;
const build = (m) => require(m)();

// Build body first so numbered-list references are known.
const body = [...build("./build/ch1-overview.cjs"), ...build("./build/ch2-features.cjs"), ...build("./build/ch3-how.cjs"), ...build("./build/ch4-data.cjs"), ...build("./build/ch5-api.cjs"), ...build("./build/ch6-ops.cjs")];

const cover = [
  new Paragraph({ spacing: { before: 2600, after: 120 }, children: [new TextRun({ text: "TaskFlow", font: FONT, size: 88, bold: true, color: COLORS.primary })] }),
  new Paragraph({ spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLORS.primary, space: 12 } }, children: [new TextRun({ text: "Product, Architecture and API Documentation", font: FONT, size: 34, color: COLORS.text })] }),
  new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "A Jira-style task management tool: boards per team, tickets with unique keys, sprints, a Word-style editor, Google Drive media and email notifications.", font: FONT, size: 24, color: COLORS.muted })] }),
  new Paragraph({ spacing: { before: 1800, after: 60 }, children: [new TextRun({ text: "Version 1.0", font: FONT, size: 22, bold: true })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "15 November 2026", font: FONT, size: 22 })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Stack: Next.js 16 · React 19 · TypeScript · MongoDB", font: FONT, size: 22, color: COLORS.muted })] }),
];

const control = [
  new Paragraph({ pageBreakBefore: true, spacing: { after: 160 }, children: [new TextRun({ text: "Document control", font: FONT, size: 32, bold: true, color: COLORS.primary })] }),
  table(
    ["Item", "Detail"],
    [
      ["Document", "TaskFlow — Product, Architecture and API Documentation"],
      ["Version", "1.0"],
      ["Date", "15 November 2026"],
      ["Audience", "Product owners, administrators, developers, testers"],
      ["Covers", "Scope and roles, all features, how the website works (with diagrams), data model and business rules, API reference, configuration and operations, testing, security"],
      ["Regenerate", "`node docs/render-diagrams.mjs` then `node docs/build-docs.cjs` (diagram sources are in `docs/diagrams/diagrams.mjs`)"],
    ],
    [2000, 7360],
  ),
  spacer(240),
  new Paragraph({ spacing: { before: 200, after: 120 }, children: [new TextRun({ text: "Contents", font: FONT, size: 32, bold: true, color: COLORS.primary })] }),
  new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  p("The table of contents is a Word field: if it appears empty, right-click it and choose “Update field”, or press F9."),
];

const doc = new Document({
  creator: "TaskFlow",
  title: "TaskFlow — Product, Architecture and API Documentation",
  description: "Features, flows, data model and API reference",
  features: { updateFields: false },
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: COLORS.text } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 36, bold: true, color: COLORS.primary }, paragraph: { spacing: { before: 120, after: 200 }, keepNext: true, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border, space: 6 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 28, bold: true, color: "1E293B" }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 23, bold: true, color: COLORS.primary }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }, { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } }] },
      ...H.numbered.refs.map((reference) => ({ reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] })),
    ],
  },
  sections: [
    {
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1300, right: 1440, bottom: 1200, left: 1440 } }, titlePage: true },
      headers: {
        default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border, space: 4 } }, tabStops: [{ type: TabStopType.RIGHT, position: 9360 }], children: [new TextRun({ text: "TaskFlow", bold: true, font: FONT, size: 18, color: COLORS.primary }), new TextRun({ text: "\tProduct, Architecture and API Documentation", font: FONT, size: 18, color: COLORS.muted })] })] }),
        first: new Header({ children: [new Paragraph({ children: [] })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Page ", font: FONT, size: 18, color: COLORS.muted }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: COLORS.muted }), new TextRun({ text: " of ", font: FONT, size: 18, color: COLORS.muted }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: COLORS.muted })] })] }),
        first: new Footer({ children: [new Paragraph({ children: [] })] }),
      },
      children: [...cover, ...control, ...body],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "TaskFlow-Documentation.docx");
  fs.writeFileSync(out, buf);
  console.log("wrote", out, `${(buf.length / 1024).toFixed(0)} KB`);
});
