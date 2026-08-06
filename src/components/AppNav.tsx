import { Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

export function AppNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useSession();
  const tabs = [
    { to: "/", label: "Teardown Generator" },
    { to: "/co-pm", label: "AI Co-PM" },
    ...(user ? ([{ to: "/dashboard", label: "My Teardowns" }] as const) : []),
  ] as { to: "/" | "/co-pm" | "/dashboard"; label: string }[];

  const name =
    (user?.user_metadata?.["display_name"] as string | undefined) ??
    (user?.user_metadata?.["full_name"] as string | undefined) ??
    user?.email?.split("@")[0];

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/");
  }

  return (
    <div className="mx-auto mb-8 flex w-fit flex-wrap items-center justify-center gap-3">
      <nav className="flex gap-1 rounded-full border border-[rgba(230,161,92,0.18)] bg-[rgba(20,20,20,0.55)] p-1 backdrop-blur-md">
        {tabs.map((t) => {
          const active = pathname === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`rounded-full px-5 py-2 text-sm font-medium tracking-wide transition-all ${
                active
                  ? "bg-gradient-to-r from-[#FFB866] to-[#E6A15C] text-black shadow-[0_0_24px_rgba(255,184,102,0.35)]"
                  : "text-[#d4cfc9] hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {!loading &&
        (user ? (
          <div className="flex items-center gap-2 rounded-full border border-[rgba(230,161,92,0.18)] bg-[rgba(20,20,20,0.55)] py-1 pr-1 pl-4 backdrop-blur-md">
            <Link
              to="/settings"
              search={{ onboarding: false }}
              className="max-w-[140px] truncate text-sm text-[#d4cfc9] transition-colors hover:text-white"
            >
              {name}
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="rounded-full px-4 py-1.5 text-sm text-[#8b857f] transition-colors hover:text-white"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link
            to="/auth"
            search={{ next: pathname }}
            className="rounded-full border border-[rgba(230,161,92,0.18)] bg-[rgba(20,20,20,0.55)] px-5 py-2.5 text-sm font-medium text-[#d4cfc9] backdrop-blur-md transition-colors hover:text-white"
          >
            Sign in
          </Link>
        ))}
    </div>
  );
}
