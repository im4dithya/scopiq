import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your password — Teardown Canvas" },
      {
        name: "description",
        content: "Choose a new password for your Teardown Canvas account and get back to work.",
      },
      { property: "og:title", content: "Reset your password — Teardown Canvas" },
      { property: "og:description", content: "Set a new password for your Teardown Canvas account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setValid(true);
        setReady(true);
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setValid(!!data.session);
      setReady(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Use at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Those passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated. You're signed in.");
      setTimeout(() => void navigate({ to: "/dashboard" }), 900);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="teardown-bg flex min-h-screen items-center justify-center px-4 py-14">
      <div className="w-full max-w-[420px]">
        <header className="mb-8 text-center">
          <div className="eyebrow">Account recovery</div>
          <h1 className="display-h1 mt-3 text-4xl">Set a new password</h1>
          <p className="mono-sub mt-3">
            Choose a new password for your Teardown Canvas account.
          </p>
        </header>

        <section className="glass-card p-6">
          {!ready ? (
            <>
              <div className="skeleton h-4 w-24" />
              <div className="skeleton mt-3 h-11 w-full" />
              <div className="skeleton mt-6 h-11 w-full" />
            </>
          ) : done ? (
            <p className="text-sm leading-relaxed text-[#d4cfc9]">
              Your password has been updated. Taking you to your dashboard…
            </p>
          ) : !valid ? (
            <div className="text-center">
              <p className="text-sm leading-relaxed text-[#d4cfc9]">
                This reset link is invalid or has expired. Request a fresh one and try again.
              </p>
              <Link to="/auth" search={{ next: "/" }} className="btn-white mx-auto mt-6 w-fit">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              <div className="mb-4">
                <label className="field-label" htmlFor="new-password">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field-input"
                  autoComplete="new-password"
                />
              </div>
              <div className="mb-5">
                <label className="field-label" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="field-input"
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" disabled={busy} className="btn-white w-full">
                <KeyRound size={16} />
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
