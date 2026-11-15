"use client";
import { useState } from "react";
import Lightbox, { type LightboxItem } from "./Lightbox";

/**
 * Renders formatted content. `html` MUST already be sanitized on the server (lib/rich.ts → toSafeHtml).
 * Clicking an attached Drive file / image / video opens it in the viewer instead of leaving the page.
 */
export default function RichContent({ html, className = "" }: { html: string; className?: string }) {
  const [item, setItem] = useState<LightboxItem | null>(null);

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const a = target.closest("a[data-media]") as HTMLAnchorElement | null;
    if (a) {
      const media = a.dataset.media;
      const title = a.textContent || "Attachment";
      if (media === "drive" && a.dataset.driveId) {
        e.preventDefault();
        setItem({ kind: "drive", driveId: a.dataset.driveId, title, openUrl: a.href });
      } else if (media === "image" || media === "video") {
        e.preventDefault();
        setItem({ kind: media, src: a.href, title });
      }
      return;
    }
    const img = target.closest("img") as HTMLImageElement | null;
    if (img) setItem({ kind: "image", src: img.src, title: img.alt || "Image" });
  }

  return (
    <>
      <div className={("rich " + className).trim()} dangerouslySetInnerHTML={{ __html: html }} onClick={onClick} />
      {item && <Lightbox item={item} onClose={() => setItem(null)} />}
    </>
  );
}
