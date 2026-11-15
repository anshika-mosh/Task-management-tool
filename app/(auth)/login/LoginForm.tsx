"use client";
import { useFormAction } from "@/lib/use-form-action";
import { login } from "@/lib/actions";

export default function LoginForm() {
  const { state, onSubmit, pending } = useFormAction(login);
  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required autoFocus autoComplete="username" />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" required autoComplete="current-password" />
      {state?.error && <p className="err">{state.error}</p>}
      <button className="btn primary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
