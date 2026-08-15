import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, type MouseEvent, type ChangeEvent, type DragEvent } from "react";
import { ImageUp, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { generateTeardown, refineTeardown } from "@/lib/api/teardown.functions";
import { useSession } from "@/hooks/useSession";
import { saveTeardown, saveRefinementHistory, type RefinementEntry } from "@/lib/teardowns";
import { analyzeOmniInput } from "@/lib/omni-input";
import { AnalysisDashboard } from "@/components/AnalysisDashboard";
import { emptyAnalysis, type TeardownAnalysis } from "@/lib/analysis";

function qualityScore(a: TeardownAnalysis, post: string | null): number {
  let score = post ? 40 : 0;
  score += Math.min(24, a.jtbd.length * 8);
  score += Math.min(18, a.darkPatterns.length * 6);
  score += a.metrics ? 10 : 0;
  score += Math.min(8, a.anchors.length * 2);
  return Math.min(100, score);
}


const QUICK_APPS = ["Spotify", "Swiggy", "Instagram", "Notion", "Google Maps", "YouTube"];

const FOCUS_OPTIONS: { value: string; label: string }[] = [
  { value: "overall", label: "Overall product experience" },
  { value: "onboarding", label: "Onboarding flow" },
  { value: "retention", label: "Retention & engagement" },
  { value: "ux", label: "UX & usability" },
  { value: "notifications", label: "Notifications & nudges" },
  { value: "monetization", label: "Monetization" },
];

const STAGES = [
  "Scraping product signals",
  "Analyzing UX patterns",
  "Synthesizing PM frameworks",
  "Finalizing teardown",
];
const STAGE_MS = 4000;

function StagedProgress({ stage }: { stage: number }) {
  return (
    <div className="glass-card mx-auto my-10 max-w-md p-6">
      <div className="loading-label mb-4">Analysing product</div>
      <ol className="space-y-3">
        {STAGES.map((label, i) => {
          const done = i < stage;
          const active = i === stage;
          return (
            <li key={label} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="h-4 w-4" style={{ color: "var(--gold-2)" }} />
                ) : active ? (
                  <span
                    className="h-2.5 w-2.5 animate-ping rounded-full"
                    style={{ background: "var(--gold-2)" }}
                  />
                ) : (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: "rgba(212,207,201,0.25)" }}
                  />
                )}
              </span>
              <span
                className="mono-sub"
                style={{
                  opacity: done ? 0.85 : active ? 1 : 0.4,
                  color: active ? "var(--gold-2)" : undefined,
                }}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}


type Insight = { type: "good" | "improve"; text: string };
type Source = { url: string; title: string };

function useRipple() {
  return (e: MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement("span");
    ripple.className = "splash-ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  };
}

export function TeardownView() {
  const generate = useServerFn(generateTeardown);
  const refine = useServerFn(refineTeardown);
  const ripple = useRipple();
  const { user } = useSession();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [appName, setAppName] = useState("");
  const [focus, setFocus] = useState("overall");
  const [notes, setNotes] = useState("");
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [analysis, setAnalysis] = useState<TeardownAnalysis>(emptyAnalysis());
  const [copied, setCopied] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [refining, setRefining] = useState(false);
  const [scoreBumped, setScoreBumped] = useState(false);
  const [history, setHistory] = useState<RefinementEntry[]>([]);
  const [openEntry, setOpenEntry] = useState<number | null>(0);
  const msgTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  type ScreenshotState = {
    file: File;
    previewUrl: string;
    base64: string;
    mediaType: "image/png" | "image/jpeg" | "image/webp";
  };
  const [screenshot, setScreenshot] = useState<ScreenshotState | null>(null);
  const [screenshotProcessing, setScreenshotProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pickChip(name: string) {
    setAppName(name);
    setActiveChip(name);
  }

  function clearScreenshot() {
    if (screenshot) URL.revokeObjectURL(screenshot.previewUrl);
    setScreenshot(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file: File) {
    const allowed = ["image/png", "image/jpeg", "image/webp"] as const;
    if (!allowed.includes(file.type as (typeof allowed)[number])) {
      toast.error("Unsupported file type. Use PNG, JPG, or WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large. Max 5MB.");
      return;
    }
    if (screenshot) URL.revokeObjectURL(screenshot.previewUrl);
    setScreenshotProcessing(true);
    try {
      const base64 = await fileToBase64(file);
      setScreenshot({
        file,
        previewUrl: URL.createObjectURL(file),
        base64,
        mediaType: file.type as ScreenshotState["mediaType"],
      });
    } catch {
      toast.error("Could not read that image. Try another file.");
    } finally {
      setScreenshotProcessing(false);
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  function reset() {
    setSavedId(null);
    setPost(null);
    setInsights([]);
    setSources([]);
    setAnalysis(emptyAnalysis());
    setAppName("");
    setNotes("");
    setFocus("overall");
    setActiveChip(null);
    setError(null);
    setRefineText("");
    setHistory([]);
    setOpenEntry(0);
    clearScreenshot();
  }

  async function handleGenerate(e: MouseEvent<HTMLButtonElement>) {
    ripple(e);
    if (!appName.trim()) {
      setError("Please enter a product name or URL first.");
      return;
    }
    if (screenshotProcessing) {
      setError("Hold on — the screenshot is still being processed.");
      return;
    }
    setError(null);
    setLoading(true);
    setPost(null);
    setInsights([]);
    setSources([]);
    setAnalysis(emptyAnalysis());

    setStage(0);
    msgTimer.current = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
    }, STAGE_MS);


    try {
      const parsed = analyzeOmniInput(appName);
      const result = await generate({
        data: {
          appName: parsed.cleanedName || appName.trim(),
          productUrl: parsed.originalUrl,
          focus: focus as "overall" | "onboarding" | "retention" | "ux" | "notifications" | "monetization",
          notes: notes.trim(),
          appStoreId: parsed.appStoreId,
          useWebSearch,
          screenshot: screenshot
            ? { data: screenshot.base64, mediaType: screenshot.mediaType }
            : undefined,
        },
      });
      if (result.status === "invalid") {
        toast.warning(
          result.message ||
            "We couldn't recognize that as a real product, app, or website. Please try again with a valid name.",
        );
        setPost(null);
        setInsights([]);
        setSources([]);
        setAnalysis(emptyAnalysis());
      } else {
        setPost(result.post);
        setInsights(result.insights);
        setSources(result.sources ?? []);
        setAnalysis(result.analysis ?? emptyAnalysis());
      }
    } catch {
      setError("Something went wrong. Please try again in a moment.");
    } finally {
      if (msgTimer.current) clearInterval(msgTimer.current);
      setStage(STAGES.length);
      setLoading(false);
    }
  }

  async function handleSave(e: MouseEvent<HTMLButtonElement>) {
    ripple(e);
    if (!post || saving || savedId) return;
    setSaving(true);
    try {
      const parsed = analyzeOmniInput(appName);
      const id = await saveTeardown({
        productName: parsed.cleanedName || appName.trim(),
        productUrl: parsed.originalUrl,
        focus,
        notes: notes.trim(),
        screenshotFile: screenshot?.file,
        post,
        insights,
        sources,
        refinements: history,
      });
      setSavedId(id);
      toast.success("Saved to your history.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this teardown.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefine(e: MouseEvent<HTMLButtonElement>) {
    ripple(e);
    const request = refineText.trim();
    if (!post || refining) return;
    if (request.length < 3) {
      toast.error("Describe what you'd like analysed (a few words minimum).");
      return;
    }
    if (request.length > 200) {
      toast.error("Keep the refinement request under 200 characters.");
      return;
    }
    setRefining(true);
    try {
      const parsedInput = analyzeOmniInput(appName);
      const result = await refine({
        data: {
          appName: parsedInput.cleanedName || appName.trim(),
          productUrl: parsedInput.originalUrl,
          existingPost: post,
          existingAnalysis: analysis as unknown as Record<string, never>,
          refinementRequest: request,
        },
      });
      if (result.status === "invalid") {
        toast.error(result.message || "Could not refine this teardown. Try again.");
        return;
      }
      const before = qualityScore(analysis, post);
      const merged: TeardownAnalysis = {
        anchors: analysis.anchors,
        jtbd: [
          ...analysis.jtbd,
          ...result.analysis.jtbd.filter(
            (n) => !analysis.jtbd.some((o) => o.job.toLowerCase() === n.job.toLowerCase()),
          ),
        ],
        metrics: result.analysis.metrics ?? analysis.metrics,
        darkPatterns: [
          ...analysis.darkPatterns,
          ...result.analysis.darkPatterns.filter(
            (n) => !analysis.darkPatterns.some((o) => o.name.toLowerCase() === n.name.toLowerCase()),
          ),
        ],
      };
      const nextPost = result.addendum ? `${post}\n\n${result.addendum}` : post;
      const addedJtbd = merged.jtbd.slice(analysis.jtbd.length);
      const addedDarkPatterns = merged.darkPatterns.slice(analysis.darkPatterns.length);
      const entry: RefinementEntry = {
        request,
        at: new Date().toISOString(),
        addedJtbd: addedJtbd.map((j) => ({ job: j.job, persona: j.persona, gap: j.gap })),
        addedDarkPatterns: addedDarkPatterns.map((d) => ({
          name: d.name,
          severity: d.severity,
          evidence: d.evidence,
          fix: d.fix,
        })),
        metricsUpdated: Boolean(result.analysis.metrics),
        addendum: result.addendum,
      };
      const nextHistory = [...history, entry];
      setHistory(nextHistory);
      setOpenEntry(nextHistory.length - 1);
      if (savedId) {
        void saveRefinementHistory(savedId, nextHistory).catch(() => {
          toast.error("Refinement saved locally, but history could not be synced.");
        });
      }
      setAnalysis(merged);
      setPost(nextPost);
      setRefineText("");
      if (qualityScore(merged, nextPost) > before) {
        setScoreBumped(true);
        setTimeout(() => setScoreBumped(false), 1400);
      }
      toast.success("Refinement added.");
    } catch {
      toast.error("Refinement failed. Please try again in a moment.");
    } finally {
      setRefining(false);
    }
  }

  async function copyPost(e: MouseEvent<HTMLButtonElement>) {
    ripple(e);
    if (!post) return;
    await navigator.clipboard.writeText(post);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <header className="mb-10">
        <div className="eyebrow">AI-powered · for student PMs</div>
        <h1 className="display-h1 mt-3">
          Product
          <br />
          <span className="text-gradient-gold">Teardown</span>
          <br />
          Generator
        </h1>
        <p className="mono-sub mt-3">
          Enter a product name or link → get a LinkedIn-ready product analysis post.
        </p>
      </header>

      {!post && (
        <section className="glass-card p-6">
          <div className="mb-5">
            <label className="field-label">Product Name, Website, or App Store Link</label>
            <input
              type="text"
              value={appName}
              onChange={(e) => {
                setAppName(e.target.value);
                setActiveChip(null);
              }}
              placeholder="e.g., Spotify, https://linear.app, or an Apple App Store link..."
              className="field-input"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_APPS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={(e) => {
                    ripple(e);
                    pickChip(name);
                  }}
                  className={`chip ${activeChip === name ? "chip-active" : ""}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="field-label">Focus area</label>
            <select
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              className="field-input field-select"
            >
              {FOCUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-5">
            <label className="field-label">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything you personally noticed — a pain point, a clever design, something confusing..."
              className="field-input min-h-[88px] resize-y leading-relaxed"
            />
          </div>

          <div className="mb-2">
            <label className="field-label">Upload Screenshot (Optional)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onFileInputChange}
              className="hidden"
            />
            {!screenshot ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`dropzone ${isDragging ? "dropzone-active" : ""}`}
              >
                <span className="dropzone-icon">
                  <ImageUp size={18} />
                </span>
                <span className="dropzone-title">
                  {screenshotProcessing
                    ? "Processing image…"
                    : "Drag & drop a screenshot here, or click to browse"}
                </span>
                <span className="dropzone-caption">Supports PNG, JPG, WEBP (Max 5MB)</span>
              </div>
            ) : (
              <div className="dropzone-preview">
                <img src={screenshot.previewUrl} alt="Screenshot preview" />
                <div className="dropzone-preview-meta">
                  <div className="dropzone-preview-name">{screenshot.file.name}</div>
                  <div className="dropzone-preview-size">{formatBytes(screenshot.file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={clearScreenshot}
                  aria-label="Remove screenshot"
                  className="dropzone-remove"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 hover:bg-white/10 transition-colors">
            <input
              type="checkbox"
              checked={useWebSearch}
              onChange={(e) => setUseWebSearch(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-white"
            />
            <span className="text-sm">
              <span className="block font-medium">Use web search grounding</span>
              <span className="mono-sub block text-xs opacity-70">
                Look up real, current info about the product (features, pricing, reviews) before writing — reduces hallucinations.
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || screenshotProcessing}
            className="btn-white mt-6 w-full"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            {loading ? "Generating…" : screenshotProcessing ? "Processing image…" : "Generate teardown post"}
          </button>

          {error && <div className="error-box mt-4">{error}</div>}
        </section>
      )}

      {loading && <StagedProgress stage={stage} />}


      {post && !loading && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="loading-label">LinkedIn post — ready to copy</span>
            <div className="flex flex-wrap items-center gap-2">
            {user ? (
              savedId ? (
                <Link to="/teardown/$id" params={{ id: savedId }} className="btn-white-sm">
                  View saved teardown
                </Link>
              ) : (
                <button type="button" onClick={handleSave} disabled={saving} className="btn-white-sm">
                  {saving ? "Saving…" : "Save to my history"}
                </button>
              )
            ) : (
              <Link to="/auth" search={{ next: "/" }} className="btn-white-sm">
                Sign in to save
              </Link>
            )}
            <button
              type="button"
              onClick={copyPost}
              className={`btn-white-sm ${copied ? "is-copied" : ""}`}
            >
              {copied ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  Copy post
                </>
              )}
            </button>
            </div>
          </div>

          <div className="glass-card post-box whitespace-pre-wrap p-6">{post}</div>

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

          <AnalysisDashboard analysis={analysis} screenshotUrl={screenshot?.previewUrl ?? null} />

          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="loading-label">Analysis quality</span>
              <span className={`quality-score ${scoreBumped ? "score-bump" : ""}`}>
                {qualityScore(analysis, post)}
              </span>
            </div>
            <div className="quality-meter mt-2">
              <div
                className="quality-meter-fill"
                style={{ width: `${qualityScore(analysis, post)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <label className="field-label" htmlFor="refine-input">
              Ask for more analysis
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="refine-input"
                type="text"
                value={refineText}
                maxLength={200}
                disabled={refining}
                onChange={(e) => setRefineText(e.target.value)}
                placeholder="e.g. Analyze B2B pricing expansion, or add a competitor comparison"
                className="field-input flex-1 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleRefine}
                disabled={refining || refineText.trim().length < 3}
                className="btn-white-sm shrink-0"
              >
                {refining ? "Refining…" : "Refine"}
              </button>
            </div>
            <div className="mono-sub mt-2 text-xs opacity-60">
              {refineText.length}/200 · adds new sections to the post and analysis
            </div>
          </div>

          {history.length > 0 && (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="section-title">What changed</h3>
                <span className="mono-sub text-xs opacity-60">
                  {history.length} refinement{history.length === 1 ? "" : "s"}
                </span>
              </div>

              <ol className="refine-timeline mt-3">
                {history.map((h, idx) => {
                  const open = openEntry === idx;
                  return (
                    <li key={`${h.at}-${idx}`} className="refine-entry">
                      <button
                        type="button"
                        onClick={() => setOpenEntry(open ? null : idx)}
                        className="refine-entry-head"
                        aria-expanded={open}
                      >
                        <span className="refine-entry-title">{h.request}</span>
                        <span className="mono-sub text-xs opacity-60">
                          {new Date(h.at).toLocaleString()}
                        </span>
                      </button>

                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className="delta-chip">+{h.addedJtbd.length} JTBD</span>
                        <span className="delta-chip">
                          +{h.addedDarkPatterns.length} dark pattern
                          {h.addedDarkPatterns.length === 1 ? "" : "s"}
                        </span>
                        <span className="delta-chip">
                          {h.metricsUpdated ? "Metrics updated" : "Metrics unchanged"}
                        </span>
                      </div>

                      {open && (
                        <div className="mt-3 space-y-3 text-sm">
                          {h.addedJtbd.length > 0 && (
                            <div>
                              <div className="loading-label mb-1">New jobs to be done</div>
                              <ul className="list-disc space-y-1 pl-5 opacity-90">
                                {h.addedJtbd.map((j, i) => (
                                  <li key={i}>
                                    {j.job}
                                    {j.persona ? ` — ${j.persona}` : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {h.addedDarkPatterns.length > 0 && (
                            <div>
                              <div className="loading-label mb-1">New dark patterns</div>
                              <ul className="list-disc space-y-1 pl-5 opacity-90">
                                {h.addedDarkPatterns.map((d, i) => (
                                  <li key={i}>
                                    <strong>{d.name}</strong>
                                    {d.severity ? ` (${d.severity})` : ""}
                                    {d.evidence ? ` — ${d.evidence}` : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {h.addendum && (
                            <div>
                              <div className="loading-label mb-1">Added to the post</div>
                              <p className="whitespace-pre-wrap opacity-90">{h.addendum}</p>
                            </div>
                          )}
                          {h.addedJtbd.length === 0 &&
                            h.addedDarkPatterns.length === 0 &&
                            !h.metricsUpdated &&
                            !h.addendum && (
                              <p className="opacity-70">
                                This refinement did not add any new structured items.
                              </p>
                            )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {sources.length > 0 && (
            <details className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium select-none">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-open:rotate-90">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Sources ({sources.length})
                <span className="mono-sub ml-1 text-xs opacity-60">web pages used for grounding</span>
              </summary>
              <ul className="mt-3 space-y-2">
                {sources.map((s, idx) => (
                  <li key={idx} className="text-sm">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-300 underline decoration-white/20 underline-offset-2 hover:decoration-blue-300 break-words"
                    >
                      {s.title}
                    </a>
                    <div className="mono-sub text-xs opacity-50 break-all">{s.url}</div>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <button
            type="button"
            onClick={(e) => {
              ripple(e);
              reset();
            }}
            className="reset-btn mt-6"
          >
            ← Analyse another app
          </button>
        </section>
      )}
    </>
  );
}
