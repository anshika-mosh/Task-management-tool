/** Small stroke icon set (24×24, currentColor) used by the editor toolbar and UI. */
const P: Record<string, string> = {
  bold: "M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z",
  italic: "M19 4h-9M14 20H5M15 4 9 20",
  underline: "M6 3v7a6 6 0 0 0 12 0V3M4 21h16",
  strike: "M16 4H9a3 3 0 0 0-2.8 4M14 12a4 4 0 0 1 0 8H6M4 12h16",
  highlight: "m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4",
  bullets: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  numbers: "M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1",
  checklist: "m3 5 2 2 4-4M3 13l2 2 4-4M13 6h8M13 14h8M3 20h.01M13 20h8",
  quote: "M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 0-1 1v2c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z",
  code: "m16 18 6-6-6-6M8 6l-6 6 6 6",
  codeblock: "m10 9-3 3 3 3M14 15l3-3-3-3M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  attach: "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
  table: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
  divider: "M4 12h16M8 6l4-3 4 3M8 18l4 3 4-3",
  undo: "M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8",
  redo: "M21 7v6h-6M21 13a9 9 0 1 1-3-7.7L21 8",
  alignLeft: "M17 10H3M21 6H3M21 14H3M17 18H3",
  alignCenter: "M18 10H6M21 6H3M21 14H3M18 18H6",
  alignRight: "M21 10H7M21 6H3M21 14H3M21 18H7",
  clear: "M7 21h10M5.5 13.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8l-8 8H8.6l-3.1-3.1a2 2 0 0 1 0-2.9z",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 5 5L20 7",
  x: "M18 6 6 18M6 6l12 12",
  sun: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={P[name]} />
    </svg>
  );
}
