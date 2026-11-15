"use client";
import { useState } from "react";
import Modal from "./Modal";
import { parseLink, type ParsedLink } from "@/lib/links";

export type LinkDialogResult = { link: ParsedLink; name: string };

/**
 * Small dialog for the editor's two link tools:
 *  - "link":   insert / edit an ordinary hyperlink
 *  - "attach": attach an image, video or file by link (Google Drive share link, or any URL)
 * Deliberately not a <form>: it is opened from inside forms, and nested forms break submit handling.
 */
export default function LinkDialog({
  mode, initialUrl = "", onSubmit, onClose,
}: { mode: "link" | "attach"; initialUrl?: string; onSubmit: (r: LinkDialogResult) => void; onClose: () => void }) {
  const [url, setUrl] = useState(initialUrl);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const attach = mode === "attach";

  function submit() {
    const link = parseLink(url);
    if (!link) return setError("Enter a full link starting with https://");
    onSubmit({ link, name: name.trim() || link.defaultName });
  }
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Modal onClose={onClose} size="sm" label={attach ? "Attach image, video or file" : initialUrl ? "Edit link" : "Insert link"}>
      <h2>{attach ? "Attach an image, video or file" : initialUrl ? "Edit link" : "Insert link"}</h2>
      {attach && <p className="muted small" style={{ margin: "4px 0 0" }}>Paste a Google Drive share link (or any image/video/web URL). It appears in the text and in the ticket's attachments.</p>}
      <label htmlFor="ld-url">Link</label>
      <input id="ld-url" value={url} onChange={(e) => { setUrl(e.target.value); setError(""); }} onKeyDown={onEnter} placeholder="https://drive.google.com/file/d/…" autoFocus />
      {attach && (
        <>
          <label htmlFor="ld-name">Name (optional)</label>
          <input id="ld-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter} placeholder="e.g. Pricing mockup.png" />
          <p className="muted small" style={{ margin: "8px 0 0" }}>In Drive: Share → General access → <b>Anyone with the link</b> → Copy link, so teammates can view it.</p>
        </>
      )}
      {error && <p className="err" role="alert">{error}</p>}
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={submit}>{attach ? "Attach" : "Insert"}</button>
      </div>
    </Modal>
  );
}
