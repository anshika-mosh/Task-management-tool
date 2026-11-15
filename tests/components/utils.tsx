import { act, fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { expect } from "vitest";
import type { Editor } from "@tiptap/react";
import { ConfirmProvider } from "@/components/ConfirmProvider";

/** Render inside the app's confirm-dialog provider (components that delete things need it). */
export const renderWithConfirm = (ui: React.ReactElement): RenderResult => render(<ConfirmProvider>{ui}</ConfirmProvider>);

/** The in-app confirmation modal (replaces window.confirm). */
export const confirmDialog = () => screen.findByRole("alertdialog");
export async function answerConfirm(accept: boolean) {
  const dialog = await confirmDialog();
  const label = accept ? /^(Confirm|Delete|Remove|Delete ticket|Delete board|Delete sprint|Remove user)$/ : /^Cancel$/;
  const buttons = Array.from(dialog.querySelectorAll("button"));
  const btn = buttons.find((b) => label.test((b.textContent ?? "").trim())) ?? buttons[accept ? 1 : 0];
  fireEvent.click(btn);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
}

/** The TipTap editor behind the n-th rich-text editor on screen (TipTap exposes it on the editable element). */
export function editorAt(index = 0): Editor {
  const els = document.querySelectorAll<HTMLElement & { editor?: Editor }>(".ProseMirror");
  const editor = els[index]?.editor;
  if (!editor) throw new Error(`no rich-text editor at index ${index}`);
  return editor;
}
/** Type text into the n-th editor (goes through the real editor pipeline, so onChange fires). */
export function typeInto(index: number, text: string) {
  act(() => {
    editorAt(index).commands.focus("end");
    editorAt(index).commands.insertContent(text);
  });
}
