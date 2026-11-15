"use client";
import { useEffect } from "react";
import { drivePreview } from "@/lib/links";

export type LightboxItem =
  | { kind: "drive"; driveId: string; title: string; openUrl: string }
  | { kind: "image"; src: string; title: string }
  | { kind: "video"; src: string; title: string };

/** Full-screen viewer: Drive files in Drive's own player, images and videos natively. Closes on click or Escape. */
export default function Lightbox({ item, onClose }: { item: LightboxItem; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.title}>
      <button className="close" aria-label="Close">×</button>
      {item.kind === "drive" ? (
        <>
          <iframe className="drive-frame" src={drivePreview(item.driveId)} allow="autoplay; fullscreen" allowFullScreen title={item.title} onClick={(e) => e.stopPropagation()} />
          <a className="open-drive" href={item.openUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Open in Drive ↗</a>
        </>
      ) : item.kind === "image" ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={item.src} alt={item.title} onClick={(e) => e.stopPropagation()} />
      ) : (
        <video src={item.src} controls autoPlay onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}
