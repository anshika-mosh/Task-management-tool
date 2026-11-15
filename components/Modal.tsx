"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Open modals, oldest first. Escape only closes the top-most one (e.g. a link dialog above the create-ticket dialog). */
const stack: symbol[] = [];

export default function Modal({
  onClose, children, role = "dialog", label, size = "md",
}: { onClose: () => void; children: React.ReactNode; role?: "dialog" | "alertdialog"; label?: string; size?: "sm" | "md" | "lg" }) {
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const id = Symbol("modal");
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack[stack.length - 1] === id) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    // Keyboard users land inside the dialog (unless a field already grabbed focus via autoFocus).
    if (boxRef.current && !boxRef.current.contains(document.activeElement)) boxRef.current.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [mounted]);

  if (!mounted) return null;
  // Portal: keeps dialogs out of any <form> they are opened from (nested forms would break submit handling).
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div ref={boxRef} className={`modal modal-${size}`} role={role} aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
