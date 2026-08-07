import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/components/AppNav";
import { getMyTeardown, updateTeardown, FOCUS_LABELS } from "@/lib/teardowns";
import { signedUrl } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/edit/$id")({
  head: () => ({
    meta: [
      { title: "Edit teardown — Teardown Canvas" },
      { name: "description", content: "Update the notes, focus area, screenshot and output of a saved teardown." },
      { property: "og:title", content: "Edit teardown — Teardown Canvas" },
      { property: "og:description", content: "Refine a saved product teardown before sharing it." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditTeardownPage,
});

function EditTeardownPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [productName, setProductName] = useState("");
  const [focus, setFocus] = useState("overall");
  const [notes, setNotes] = useState("");
  const [post, setPost] = useState("");
  const [shotPreview, setShotPreview] = useState<string | null>(null);
  const [shotFile, setShotFile] = useState<File | undefined>(undefined);
  const [removeShot, setRemoveShot] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await getMyTeardown(id);
        if (!alive) return;
        if (!t) {
          setNotFound(true);
          return;
        }
        setProductName(t.product_name);
        setFocus(t.focus);
        setNotes(t.notes ?? "");
        setPost(t.post);
        setShotPreview(await signedUrl("screenshots", t.screenshot_url));
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  function onPickFile(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Use a PNG, JPG or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Screenshot must be under 5MB.");
      return;
    }
    setShotFile(file);
    setRemoveShot(false);
    setShotPreview(URL.createObjectURL(file));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!post.trim()) {
      toast.error("The teardown post can't be empty.");
      return;
    }
    setSaving(true);
    try {
      await updateTeardown(id, {
        focus,
        notes: notes.trim(),
        post: post.trim(),
        screenshotFile: shotFile,
        removeScreenshot: removeShot,
      });
      toast.success("Teardown updated.");
      void navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="teardown-bg min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-[720px]">
        <AppNav />

        <header className="mb-8">
          <div className="eyebrow">Edit teardown</div>
          <h1 className="display-h1 mt-3 text-4xl">{productName || "Loading…"}</h1>
          <p className="mono-sub mt-3">
            Update the focus, your notes, the screenshot, or the generated post itself.
          </p>
        </header>

        {!loaded ? (
          <div className="glass-card p-6">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-3 h-11 w-full" />
            <div className="skeleton mt-6 h-4 w-24" />
            <div className="skeleton mt-3 h-40 w-full" />
          </div>
        ) : notFound ? (
          <div className="glass-card p-10 text-center">
            <p className="text-[#ece6dd]">We couldn't find that teardown in your library.</p>
            <Link to="/dashboard" className="btn-white mx-auto mt-6 w-fit">
              Back to my teardowns
            </Link>
          </div>
        ) : (
          <form onSubmit={onSave} className="glass-card p-6">
            <div className="mb-5">
              <label className="field-label" htmlFor="focus">
                Focus area
              </label>
              <select
                id="focus"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                className="field-select"
              >
                {Object.entries(FOCUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-5">
              <label className="field-label" htmlFor="notes">
                Your notes
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="field-input min-h-[88px] resize-y leading-relaxed"
                maxLength={1000}
                placeholder="Personal observations about this product…"
              />
              <div className="mono-sub mt-1 text-xs">{notes.length}/1000</div>
            </div>

            <div className="mb-5">
              <div className="field-label">Screenshot</div>
              <div className="flex flex-wrap items-center gap-4">
                {shotPreview && !removeShot ? (
                  <img
                    src={shotPreview}
                    alt={`${productName} screenshot`}
                    className="h-24 w-24 rounded-lg object-cover ring-1 ring-[rgba(230,161,92,0.3)]"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-white/10 text-xs text-[#d4cfc9]">
                    None
                  </div>
                )}
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPickFile(f);
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-white-sm"
                      onClick={() => fileRef.current?.click()}
                    >
                      {shotPreview && !removeShot ? "Replace" : "Upload"}
                    </button>
                    {shotPreview && !removeShot && (
                      <button
                        type="button"
                        className="reset-btn"
                        onClick={() => {
                          setRemoveShot(true);
                          setShotFile(undefined);
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mono-sub mt-2 text-xs">PNG, JPG or WEBP · max 5MB</div>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="field-label" htmlFor="post">
                Generated post
              </label>
              <textarea
                id="post"
                value={post}
                onChange={(e) => setPost(e.target.value)}
                className="field-input min-h-[320px] resize-y leading-relaxed"
                placeholder="Your teardown post…"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={saving} className="btn-white flex-1">
                {saving ? "Saving…" : "Save changes"}
              </button>
              <Link to="/dashboard" className="btn-white-sm">
                Cancel
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
