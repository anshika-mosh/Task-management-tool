import sanitizeHtml from "sanitize-html";

/**
 * Rich text (descriptions, comments, progress updates).
 *  - The editor produces HTML. EVERYTHING that is stored or rendered goes through the allow-list
 *    sanitizer below, so pasted or hand-crafted HTML can never run scripts or load odd resources.
 *  - Content written before the editor existed is plain text; it keeps working (see `toSafeHtml`).
 * Server-only (imported by server actions, pages and mail); the browser never needs the sanitizer
 * because it only ever receives already-sanitized HTML.
 */

export const MAX_RICH_LENGTH = 100_000;

const BLOCK_END = /<\/(p|div|li|h[1-6]|tr|blockquote|pre|table|ul|ol)>|<br\s*\/?>|<hr\s*\/?>/gi;

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "del", "code", "pre", "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "h4", "hr",
    "a", "img", "table", "thead", "tbody", "tr", "th", "td", "colgroup", "col", "mark", "span", "div", "label", "input", "sub", "sup",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "class", "title", "data-drive-id", "data-media"],
    img: ["src", "alt", "title", "width", "height"],
    code: ["class"],
    pre: ["class"],
    th: ["colspan", "rowspan", "colwidth"],
    td: ["colspan", "rowspan", "colwidth"],
    col: ["style"],
    ul: ["data-type"],
    li: ["data-type", "data-checked"],
    input: ["type", "checked", "disabled"],
    "*": ["style"],
  },
  allowedClasses: { a: ["media-link"], code: [/^language-[\w-]+$/], pre: [/^language-[\w-]+$/] },
  allowedStyles: { "*": { "text-align": [/^(left|right|center|justify)$/] }, col: { width: [/^\d+(\.\d+)?(px|%)$/], "min-width": [/^\d+(\.\d+)?(px|%)$/] } },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" } }),
    input: (tagName, attribs) => ({ tagName, attribs: { type: "checkbox", disabled: "disabled", ...(attribs.checked !== undefined ? { checked: "checked" } : {}) } }),
  },
  // Drop checkbox inputs that are not part of a task list, and <img> without a usable src.
  exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
};

/** True when the text contains something that looks like an HTML tag. */
export const looksLikeHtml = (s: string) => /<\/?[a-z][a-z0-9]*(\s[^>]*)?\/?>/i.test(s);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain text -> paragraphs (blank line) with <br> for single newlines. */
export function plainToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export const sanitizeRich = (html: string): string => sanitizeHtml(html.slice(0, MAX_RICH_LENGTH), options);

/** Safe HTML for display or for loading into the editor, from plain text OR HTML. */
export function toSafeHtml(content: string | null | undefined): string {
  const c = content ?? "";
  return looksLikeHtml(c) ? sanitizeRich(c) : plainToHtml(c);
}

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** Readable plain text of rich content (for emails, search previews, empty checks). */
export function richToText(content: string | null | undefined): string {
  const c = content ?? "";
  if (!looksLikeHtml(c)) return c.trim();
  const withBreaks = c.replace(BLOCK_END, (m) => m + "\n");
  const stripped = sanitizeHtml(withBreaks.slice(0, MAX_RICH_LENGTH), { allowedTags: [], allowedAttributes: {} });
  return decode(stripped).replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

/** Nothing meaningful in it (empty editor, whitespace, empty paragraphs)? Images, rules and tables count as content. */
export function isEmptyRich(content: string | null | undefined): boolean {
  const c = content ?? "";
  if (/<(img|hr|table)\b/i.test(c)) return false;
  return richToText(c).trim() === "";
}

const EMPTY_P = "<p>(?:\\s|<br\\s*/?>)*</p>";
/** The editor often leaves blank paragraphs at the start/end; they are noise when stored. */
const trimEmptyParagraphs = (html: string) => html.replace(new RegExp(`^(?:${EMPTY_P})+|(?:${EMPTY_P})+$`, "gi"), "");

/** What to store: legacy plain text stays plain; HTML is sanitized; empty becomes "". */
export function normalizeRich(input: string | null | undefined): string {
  const c = (input ?? "").trim();
  if (!c) return "";
  const out = looksLikeHtml(c) ? trimEmptyParagraphs(sanitizeRich(c)) : c.slice(0, MAX_RICH_LENGTH);
  return isEmptyRich(out) ? "" : out;
}
