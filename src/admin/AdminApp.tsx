import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import logoImage from "@/assets/vbuild-mark.webp";
import { Editor } from "./Editor";
import { TextInput } from "./fields";
import { supabase } from "./lib";

type AuthState =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "recovery"; session: Session }
  | { kind: "notAdmin"; session: Session }
  | { kind: "ready"; session: Session };

/** /admin — sign in with Supabase Auth, then edit the site. */
export function AdminApp() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });

  useEffect(() => {
    document.title = "Admin · VBUILD";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    // A password-reset link signs the user in and then fires PASSWORD_RECOVERY;
    // remember it so a slower admin check can't override the "new password" screen.
    let recovering = false;
    const resolve = async (session: Session | null) => {
      if (!session) return setAuth({ kind: "signedOut" });
      if (recovering) return setAuth({ kind: "recovery", session });
      const { data, error } = await supabase!.rpc("is_admin");
      if (cancelled || recovering) return;
      setAuth(!error && data === true ? { kind: "ready", session } : { kind: "notAdmin", session });
    };
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recovering = true;
        void resolve(session);
      } else if (event === "SIGNED_IN" || event === "SIGNED_OUT") void resolve(session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!supabase) return <NotConfigured />;
  if (auth.kind === "loading")
    return (
      <Shell>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      </Shell>
    );
  if (auth.kind === "signedOut") return <SignIn />;
  if (auth.kind === "recovery")
    return <SetPassword onDone={() => window.location.replace("/admin")} />;
  if (auth.kind === "notAdmin")
    return (
      <Shell title="No editing access">
        <p className="text-sm leading-6 text-muted-foreground">
          You're signed in as <span className="text-foreground">{auth.session.user.email}</span>,
          but this account isn't an admin yet. Add it with the SQL at the bottom of{" "}
          <code>supabase/setup.sql</code>, then reload.
        </p>
        <Button variant="outline" className="mt-6 w-full" onClick={() => supabase!.auth.signOut()}>
          Sign out
        </Button>
      </Shell>
    );
  return <Editor session={auth.session} />;
}

function Shell(props: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-16 text-foreground">
      <div className="glass-panel w-full max-w-sm rounded-2xl p-7">
        <div className="mb-6 flex items-center gap-3">
          <img src={logoImage} alt="" className="h-9 w-9 rounded-full object-cover" />
          <div>
            <p className="font-display text-sm font-semibold tracking-[0.16em]">VBUILD</p>
            <p className="text-xs text-muted-foreground">Site admin</p>
          </div>
        </div>
        {props.title && (
          <h1 className="mb-3 font-display text-2xl font-medium tracking-[-0.03em]">
            {props.title}
          </h1>
        )}
        {props.children}
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <Shell title="Connect Supabase first">
      <p className="text-sm leading-6 text-muted-foreground">
        This site doesn't know which Supabase project to use yet. Add <code>VITE_SUPABASE_URL</code>{" "}
        and <code>VITE_SUPABASE_ANON_KEY</code> in Vercel → Settings → Environment Variables, then
        redeploy. Step-by-step instructions are in <code>ADMIN_SETUP.md</code> in the repo.
      </p>
    </Shell>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage({ tone: "error", text: error.message });
  };
  const forgot = async () => {
    if (!email.trim()) return setMessage({ tone: "error", text: "Enter your email first." });
    setBusy(true);
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin`,
    });
    setBusy(false);
    setMessage(
      error
        ? { tone: "error", text: error.message }
        : { tone: "info", text: "If that account exists, a reset link is on its way." },
    );
  };

  return (
    <Shell title="Sign in">
      <form onSubmit={submit} className="space-y-4">
        <TextInput label="Email" type="email" value={email} onChange={setEmail} />
        <TextInput label="Password" type="password" value={password} onChange={setPassword} />
        {message && (
          <p
            className={
              message.tone === "error" ? "text-sm text-destructive" : "text-sm text-primary"
            }
          >
            {message.text}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Sign in
        </Button>
        <button
          type="button"
          onClick={forgot}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Forgot password?
        </button>
      </form>
    </Shell>
  );
}

function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  };
  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <TextInput label="New password" type="password" value={password} onChange={setPassword} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Save password
        </Button>
      </form>
    </Shell>
  );
}
