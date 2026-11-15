import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";
import ThemeToggle from "@/components/ThemeToggle";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="login-wrap">
      <ThemeToggle floating />
      <div className="card login">
        <div className="brand" style={{ marginBottom: 8 }}><span className="brand-mark">✓</span> TaskFlow</div>
        <p className="muted" style={{ marginTop: 0 }}>Sign in to your team&apos;s boards.</p>
        <LoginForm />
        <div className="hint">
          Demo admin: <b>admin@taskflow.dev</b> / <b>admin123</b><br />
          Team member: <b>priya@taskflow.dev</b> / <b>password</b>
        </div>
      </div>
    </div>
  );
}
