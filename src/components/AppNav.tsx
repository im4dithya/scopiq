import { Link, useRouterState } from "@tanstack/react-router";

export function AppNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/", label: "Teardown Generator" },
    { to: "/co-pm", label: "AI Co-PM" },
  ] as const;
  return (
    <nav className="mx-auto mb-8 flex w-fit gap-1 rounded-full border border-[rgba(230,161,92,0.18)] bg-[rgba(20,20,20,0.55)] p-1 backdrop-blur-md">
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
  );
}
