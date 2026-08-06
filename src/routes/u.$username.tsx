import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { getPublicProfile, type PublicTeardownCard } from "@/lib/api/public.functions";
import { FOCUS_LABELS } from "@/lib/teardowns";
import { resolveAvatar } from "@/lib/storage";

export const Route = createFileRoute("/u/$username")({
  loader: async ({ params }) => {
    const result = await getPublicProfile({ data: { username: params.username } });
    if (!result.profile) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Profile not found — Teardown Canvas" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const name = loaderData.profile?.display_name ?? loaderData.profile?.username ?? "Portfolio";
    const desc =
      loaderData.profile?.bio ?? `Product teardowns published by ${name} on Teardown Canvas.`;
    return {
      meta: [
        { title: `${name} — Teardown portfolio` },
        { name: "description", content: desc },
        { property: "og:title", content: `${name} — Teardown portfolio` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: () => <Fallback title="This profile didn't load" />,
  notFoundComponent: () => <Fallback title="That profile doesn't exist" />,
  component: PortfolioPage,
});

function Fallback({ title }: { title: string }) {
  return (
    <div className="teardown-bg flex min-h-screen items-center justify-center px-4">
      <div className="glass-card max-w-md p-10 text-center">
        <h1 className="display-h1 text-3xl">{title}</h1>
        <p className="mono-sub mt-3">Check the link, or head back and explore Teardown Canvas.</p>
        <Link to="/" className="btn-white mx-auto mt-6 w-fit">
          Go home
        </Link>
      </div>
    </div>
  );
}

function PortfolioPage() {
  const { profile, teardowns } = Route.useLoaderData();
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void resolveAvatar(profile?.avatar_url).then((url) => alive && setAvatar(url));
    return () => {
      alive = false;
    };
  }, [profile?.avatar_url]);

  const name = profile?.display_name || profile?.username || "Product thinker";

  return (
    <div className="teardown-bg min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-[860px]">
        <AppNav />

        <header className="glass-card mb-8 flex flex-wrap items-center gap-5 p-6">
          {avatar ? (
            <img
              src={avatar}
              alt={`${name}'s avatar`}
              className="h-20 w-20 rounded-full object-cover ring-1 ring-[rgba(230,161,92,0.3)]"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-2xl text-[#d4cfc9]">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="display-h1 text-3xl">{name}</h1>
            <p className="mono-sub mt-1">@{profile?.username}</p>
            {profile?.bio && (
              <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-[#d4cfc9]">
                {profile.bio}
              </p>
            )}
          </div>
        </header>

        {teardowns.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-[#ece6dd]">No public teardowns yet.</p>
            <p className="mono-sub mt-2">Check back soon — this portfolio is just getting started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(teardowns as PublicTeardownCard[]).map((t) => (
              <Link
                key={t.id}
                to="/teardown/$id"
                params={{ id: t.id }}
                className="glass-card block p-5 transition-transform hover:-translate-y-0.5"
              >
                <h2 className="truncate text-lg font-semibold text-[#f3ede4]">{t.product_name}</h2>
                <p className="mono-sub mt-1 text-xs">
                  {FOCUS_LABELS[t.focus] ?? t.focus} ·{" "}
                  {new Date(t.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
