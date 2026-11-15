/** Helpers for attaching images/videos as links (Google Drive in particular). Safe to import on client and server. */

export type LinkType = "drive" | "image" | "video" | "web";

export type ParsedLink = { url: string; type: LinkType; driveId: string | null; defaultName: string };

const DRIVE_HOSTS = /^(drive|docs)\.google\.com$/;
const IMG = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i;
const VID = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;

/** Returns null when the text is not an http(s) URL. */
export function parseLink(input: string): ParsedLink | null {
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  if (DRIVE_HOSTS.test(u.hostname)) {
    const m = /\/(?:file|document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([\w-]{10,})/.exec(u.pathname) ?? /\/folders\/([\w-]{10,})/.exec(u.pathname);
    const id = m?.[1] ?? u.searchParams.get("id");
    if (id) {
      const folder = u.pathname.includes("/folders/");
      return { url: u.toString(), type: folder ? "web" : "drive", driveId: folder ? null : id, defaultName: folder ? "Drive folder" : "Drive file" };
    }
  }
  if (IMG.test(u.pathname)) return { url: u.toString(), type: "image", driveId: null, defaultName: decodeURIComponent(u.pathname.split("/").pop() || "image") };
  if (VID.test(u.pathname)) return { url: u.toString(), type: "video", driveId: null, defaultName: decodeURIComponent(u.pathname.split("/").pop() || "video") };
  return { url: u.toString(), type: "web", driveId: null, defaultName: u.hostname };
}

export const driveThumb = (id: string, w = 480) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
/** Drive's embeddable viewer: plays videos and shows images, PDFs and docs. */
export const drivePreview = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
