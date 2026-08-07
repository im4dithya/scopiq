import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Trash2, ExternalLink, Pencil } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import {
  deleteTeardown,
  listMyTeardowns,
  setTeardownPublic,
  FOCUS_LABELS,
  type SavedTeardown,
} from "@/lib/teardowns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My Teardowns — Teardown Canvas" },
      { name: "description", content: "Manage, share and delete your saved product teardowns." },
      { property: "og:title", content: "My Teardowns — Teardown Canvas" },
      { property: "og:description", content: "Your private library of saved product teardowns." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [items, setItems] = useState<SavedTeardown[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listMyTeardowns()
      .then((rows) => alive && setItems(rows))
      .catch((e: unknown) => {
        if (!alive) return;
        setItems([]);
        setError(e instanceof Error ? e.message : "Could not load your teardowns.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) => t.product_name.toLowerCase().includes(q));
  }, [items, query]);

  async function togglePublic(t: SavedTeardown) {
    setBusyId(t.id);
    const next = !t.public;
    try {
      await setTeardownPublic(t.id, next);
      setItems((prev) => prev?.map((x) => (x.id === t.id ? { ...x, public: next } : x)) ?? prev);
      toast.success(next ? "Teardown is now public." : "Teardown is now private.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update visibility.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(t: SavedTeardown) {
    if (!window.confirm(`Delete the teardown for "${t.product_name}"?`)) return;
    setBusyId(t.id);
    try {
      await deleteTeardown(t.id);
      setItems((prev) => prev?.filter((x) => x.id !== t.id) ?? prev);
      toast.success("Teardown deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete this teardown.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="teardown-bg min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-[860px]">
        <AppNav />

        <header className="mb-8">
          <div className="eyebrow">Your library</div>
          <h1 className="display-h1 mt-3 text-4xl">My Teardowns</h1>
          <p className="mono-sub mt-3">
            Everything you've saved. Toggle a teardown public to feature it on your portfolio.
          </p>
        </header>

        <div className="relative mb-6">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#8b857f]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by product name…"
            className="field-input pl-11"
          />
        </div>

        {error && <div className="error-box mb-6">{error}</div>}

        {filtered === null ? (
          <div className="grid gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-card p-5">
                <div className="skeleton h-5 w-2/5" />
                <div className="skeleton mt-3 h-3.5 w-3/5" />
                <div className="skeleton mt-4 h-8 w-40" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-[#ece6dd]">
              {items && items.length > 0
                ? "No teardowns match that search."
                : "No teardowns yet — generate your first one"}
            </p>
            <Link to="/" className="btn-white mx-auto mt-6 w-fit">
              Generate a teardown
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((t) => (
              <article key={t.id} className="glass-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-[#f3ede4]">
                      {t.product_name}
                    </h2>
                    <p className="mono-sub mt-1 text-xs">
                      {FOCUS_LABELS[t.focus] ?? t.focus} ·{" "}
                      {new Date(t.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span className={t.public ? "badge badge-public" : "badge"}>
                    {t.public ? "Public" : "Private"}
                  </span>
                </div>

                <p className="mt-3 line-clamp-2 text-sm text-[#d4cfc9]/80">{t.post}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link
                    to="/teardown/$id"
                    params={{ id: t.id }}
                    className="btn-white-sm"
                  >
                    <ExternalLink size={13} /> View
                  </Link>
                  <Link to="/edit/$id" params={{ id: t.id }} className="btn-white-sm">
                    <Pencil size={13} /> Edit
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => void togglePublic(t)}
                    className="btn-white-sm"
                  >
                    {t.public ? "Make private" : "Make public"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => void remove(t)}
                    className="reset-btn ml-auto"
                  >
                    <Trash2 size={14} className="mr-1 inline" /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
