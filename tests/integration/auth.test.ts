import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser, requireAdmin, requireUser, createSession, destroySession } from "@/lib/auth";
import { login, logout } from "@/lib/actions";
import { cookieJar, expectRedirect, fd, loginAs, makeAdmin, makeUser, resetData, logoutNow } from "../helpers";

beforeEach(resetData);
afterEach(() => vi.useRealTimers());

describe("login", () => {
  it("signs in with correct credentials, sets a session cookie and redirects home", async () => {
    const u = await makeUser({ email: "ann@test.dev", password: "pw-123456" });
    await expectRedirect(() => login(undefined, fd({ email: "ann@test.dev", password: "pw-123456" })), "/");
    expect(cookieJar.get("tf_session")).toBeTruthy();
    expect((await getCurrentUser())?.id).toBe(u.id);
  });

  it("matches the email case-insensitively and ignores surrounding spaces", async () => {
    await makeUser({ email: "ann@test.dev", password: "pw-123456" });
    await expectRedirect(() => login(undefined, fd({ email: "  ANN@Test.dev ", password: "pw-123456" })), "/");
  });

  it("rejects a wrong password without creating a session", async () => {
    await makeUser({ email: "ann@test.dev", password: "pw-123456" });
    const res = await login(undefined, fd({ email: "ann@test.dev", password: "WRONG" }));
    expect(res).toEqual({ error: "Invalid email or password." });
    expect(cookieJar.has("tf_session")).toBe(false);
  });

  it("gives the same error for an unknown email (no user enumeration)", async () => {
    const res = await login(undefined, fd({ email: "ghost@test.dev", password: "whatever" }));
    expect(res).toEqual({ error: "Invalid email or password." });
  });

  it("rejects empty credentials", async () => {
    expect((await login(undefined, fd({ email: "", password: "" })))?.error).toBeTruthy();
  });
});

describe("logout", () => {
  it("clears the session and redirects to /login", async () => {
    const u = await makeUser();
    await loginAs(u);
    await expectRedirect(() => logout(), "/login");
    expect(cookieJar.has("tf_session")).toBe(false);
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("getCurrentUser", () => {
  it("is null without a cookie", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the user without exposing the password hash", async () => {
    const u = await makeUser({ name: "Ann Lee" });
    await loginAs(u);
    const me = await getCurrentUser();
    expect(me).toMatchObject({ id: u.id, name: "Ann Lee", role: "member" });
    expect(me).not.toHaveProperty("password_hash");
  });

  it("rejects a cookie whose signature was tampered with", async () => {
    const u = await makeUser();
    await loginAs(u);
    const [id, exp, sig] = cookieJar.get("tf_session")!.split(".");
    cookieJar.set("tf_session", `${id}.${exp}.${sig.slice(0, -2)}xx`);
    expect(await getCurrentUser()).toBeNull();
  });

  it("rejects a cookie where the user id was swapped (privilege escalation attempt)", async () => {
    const member = await makeUser();
    const admin = await makeAdmin();
    await loginAs(member);
    const [, exp, sig] = cookieJar.get("tf_session")!.split(".");
    cookieJar.set("tf_session", `${admin.id}.${exp}.${sig}`);
    expect(await getCurrentUser()).toBeNull();
  });

  it("rejects garbage cookies", async () => {
    for (const bad of ["", "abc", "1.2", "1.2.3.4", "....", "x.y.z"]) {
      cookieJar.set("tf_session", bad);
      expect(await getCurrentUser()).toBeNull();
    }
  });

  it("expires sessions after 7 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const u = await makeUser();
    await loginAs(u);
    vi.setSystemTime(new Date("2026-01-07T23:00:00Z"));
    expect(await getCurrentUser()).not.toBeNull();
    vi.setSystemTime(new Date("2026-01-08T00:00:01Z"));
    expect(await getCurrentUser()).toBeNull();
  });

  it("is null once the user has been deleted", async () => {
    const u = await makeUser();
    await loginAs(u);
    const { col } = await import("@/lib/db");
    await (await col("users")).deleteOne({ _id: u.id as never });
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("requireUser / requireAdmin", () => {
  it("send anonymous visitors to /login", async () => {
    await expectRedirect(() => requireUser(), "/login");
    await expectRedirect(() => requireAdmin(), "/login");
  });

  it("requireUser returns the signed-in user", async () => {
    const u = await makeUser();
    await loginAs(u);
    expect((await requireUser()).id).toBe(u.id);
  });

  it("requireAdmin sends members home and lets admins through", async () => {
    const m = await makeUser();
    await loginAs(m);
    await expectRedirect(() => requireAdmin(), "/");
    const a = await makeAdmin();
    await loginAs(a);
    expect((await requireAdmin()).id).toBe(a.id);
  });
});

describe("session helpers", () => {
  it("createSession/destroySession round-trip", async () => {
    const u = await makeUser();
    await createSession(u.id);
    expect(await getCurrentUser()).not.toBeNull();
    await destroySession();
    logoutNow();
    expect(await getCurrentUser()).toBeNull();
  });
});
