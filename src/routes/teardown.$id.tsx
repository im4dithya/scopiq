import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { getPublicTeardown } from "@/lib/api/public.functions";
import { FOCUS_LABELS, getMyTeardown, type Insight, type SavedTeardown } from "@/lib/teardowns";

export const Route = createFileRoute("/teardown/$id")({
  loader: async ({ params }) => {
    try {
      return await getPublicTeardown({ data: { id: params.id } });
    } catch {
      return { teardown: null, author: null };
    }
  },
  head: ({ loaderData }) => {
    const t = loaderData?.teardown;
    if (!t) {
      return {
        meta: [
          { title: "Teardown — Teardown Canvas" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const desc = t.post.slice(0, 155);
    return {
      meta: [
        { title: `${t.product_name} teardown — Teardown Canvas` },
        { name: "description", content: desc },
        { property: "og:title", content: `${t.product_name} teardown` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: () => <Message title="This teardown didn't load" />,
  component: TeardownSharePage,
});

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <div className="teardown-bg flex min-h-screen items-center justify-center px-4">
      <div className="glass-card max-w-md p-10 text-center">
        <h1 className="display-h1 text-3xl">{title}</h1>
        <p className="mono-sub mt-3">{body ?? "Try again, or head back to the homepage."}</p>
        <Link to="/" className="btn-white mx-auto mt-6 w-fit">
          Go home
        </Link>
      </div>
    </div>
  );
}

function TeardownSharePage() {
  const { id } = Route.useParams();
  const { teardown, author } = Route.useLoaderData();
  const [owned, setOwned] = useState<SavedTeardown | null>(null);
  const [checking, setChecking] = useState(!teardown);

  useEffect(() => {
    if (teardown) return;
    let alive = true;
    void getMyTeardown(id)
      .then((row) => alive && setOwned(row))
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [id, teardown]);

  if (checking) {
    return (
      <div className="teardown-bg min-h-screen px-4 py-10 sm:py-14">
        <div className="mx-auto max-w-[720px]">
          <div className="skeleton h-8 w-2/5" />
          <div className="skeleton mt-4 h-4 w-3/5" />
          <div className="skeleton mt-6 h-64 w-full" />
        </div>
      </div>
    );
  }

  const data = teardown ?? owned;
  if (!data) {
    return (
      <Message
        title="This teardown is private"
        body="Its owner hasn't shared it publicly, or the link no longer exists."
      />
    );
  }

  const insights = (data.insights ?? []) as Insight[];
  const sources = (data.sources ?? []) as { url: string; title: string }[];

  return (
    <div className="teardown-bg min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-[720px]">
        <AppNav />

        <header className="mb-6">
          <div className="eyebrow">{FOCUS_LABELS[data.focus] ?? data.focus}</div>
          <h1 className="display-h1 mt-3 text-4xl">{data.product_name}</h1>
          <p className="mono-sub mt-2">
            {new Date(data.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {author?.username ? " · by " : ""}
            {author?.username && (
              <Link to="/u/$username" params={{ username: author.username }} className="underline">
                @{author.username}
              </Link>
            )}
          </p>
        </header>

        <div className="glass-card post-box whitespace-pre-wrap p-6">{data.post}</div>

        {insights.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {insights.map((ins, idx) => (
              <div
                key={idx}
                className={`insight-card ${ins.type === "good" ? "insight-good" : "insight-improve"}`}
              >
                <div className="insight-label">
                  {ins.type === "good" ? "What works" : "Opportunity"}
                </div>
                <div className="insight-content">{ins.text}</div>
              </div>
            ))}
          </div>
        )}

        {sources.length > 0 && (
          <details className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <summary className="cursor-pointer text-sm font-medium select-none">
              Sources ({sources.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {sources.map((s, idx) => (
                <li key={idx} className="text-sm">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-words underline"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}

        <footer className="mt-10 text-center">
          <Link to="/" className="mono-sub text-xs underline">
            Made with Teardown Canvas
          </Link>
        </footer>
      </div>
    </div>
  );
}
