"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import Modal from "./Modal";

export type ConfirmOptions = {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Confirm | null>(null);

/**
 * In-app replacement for window.confirm(): `if (await confirm({ message: "…", danger: true })) …`
 * Resolves true on confirm and false on cancel / Escape / backdrop click.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false); // a newer question cancels an unanswered one
        resolver.current = resolve;
        setRequest(options);
      }),
    [],
  );

  const answer = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <Modal role="alertdialog" size="sm" label={request.title ?? "Please confirm"} onClose={() => answer(false)}>
          <h2 className="confirm-title">{request.title ?? "Are you sure?"}</h2>
          <div className="confirm-message">{request.message}</div>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={() => answer(false)}>{request.cancelLabel ?? "Cancel"}</button>
            <button type="button" className={"btn " + (request.danger ? "danger-solid" : "primary")} onClick={() => answer(true)} autoFocus>
              {request.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const c = useContext(ConfirmContext);
  if (!c) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return c;
}
