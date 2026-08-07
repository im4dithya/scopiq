import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { getMyProfile } from "@/lib/profiles";

function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/";
  // Same-origin relative paths only.
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ next: safeNext(s['next']) }),
  head: () => ({
    meta: [
      { title: "Sign in — Teardown Canvas" },
      {
        name: "description",
        content:
          "Sign in to Teardown Canvas to generate product teardowns and PRDs, and to connect AI assistants to your account.",
      },
      { property: "og:title", content: "Sign in — Teardown Canvas" },
      {
        property: "og:description",
        content: "Access your product teardown and PRD workspace.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    async function routeAfterAuth() {
      try {
        const profile = await getMyProfile();
        if (!profile?.username) {
          window.location.assign("/settings?onboarding=1");
          return;
        }
      } catch {
        // fall through to the requested destination
      }
      window.location.assign(next);
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void routeAfterAuth();
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void routeAfterAuth();
    });
    return () => sub.subscription.unsubscribe();
  }, [next, navigate]);


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setResetSent(true);
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${next}`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) setPendingConfirm(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onResendConfirmation() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}${next}` },
      });
      if (error) throw error;
      toast.success("Confirmation email sent again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend that email.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}${next}`,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Google sign-in failed. Please try again.");
    }
  }

  return (
    <div className="teardown-bg flex min-h-screen items-center justify-center px-4 py-14">
      <div className="w-full max-w-[420px]">
        <header className="mb-8 text-center">
          <div className="eyebrow">Teardown Canvas</div>
          <h1 className="display-h1 mt-3 text-4xl">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mono-sub mt-3">
            Sign in to generate teardowns and connect AI assistants to your account.
          </p>
        </header>

        <section className="glass-card p-6">
          {pendingConfirm ? (
            <p className="text-sm leading-relaxed text-[#d4cfc9]">
              Check your email to confirm your address, then come back and sign in.
            </p>
          ) : (
            <>
              <form onSubmit={onSubmit}>
                {mode === "signup" && (
                  <div className="mb-4">
                    <label className="field-label" htmlFor="display-name">
                      Display name
                    </label>
                    <input
                      id="display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="field-input"
                      placeholder="Ada Lovelace"
                      autoComplete="name"
                    />
                  </div>
                )}
                <div className="mb-4">
                  <label className="field-label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="field-input"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                <div className="mb-5">
                  <label className="field-label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field-input"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  />
                </div>
                <button type="submit" disabled={busy} className="btn-white w-full">
                  <LogIn size={16} />
                  {mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </form>

              <div className="my-5 text-center text-xs tracking-widest text-[#8b857f]">OR</div>

              <button type="button" onClick={onGoogle} disabled={busy} className="btn-white w-full">
                Continue with Google
              </button>

              <button
                type="button"
                className="reset-btn mt-6 w-full text-center"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin"
                  ? "No account yet? Create one"
                  : "Already have an account? Sign in"}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
