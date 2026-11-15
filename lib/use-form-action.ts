"use client";
import { useActionState, useTransition } from "react";
import type { FormEvent } from "react";

/**
 * Like `<form action={fn}>` + useActionState, but WITHOUT React 19's automatic reset of the form
 * after the action finishes. That reset also clears everything the user typed when the server
 * answers with a validation error (wrong password -> email wiped, duplicate board key -> name wiped).
 * Forms that should clear on success do so themselves (see the `state.ok` effects).
 */
export function useFormAction<S>(action: (prev: S | undefined, formData: FormData) => Promise<S | undefined>) {
  const [state, dispatch, actionPending] = useActionState(action, undefined);
  const [transitionPending, startTransition] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
  return { state, onSubmit, pending: actionPending || transitionPending };
}
