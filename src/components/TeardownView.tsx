import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, type MouseEvent, type ChangeEvent, type DragEvent } from "react";
import { ImageUp, X } from "lucide-react";
import { toast } from "sonner";
import { generateTeardown } from "@/lib/api/teardown.functions";
import { analyzeOmniInput } from "@/lib/omni-input";

const QUICK_APPS = ["Spotify", "Swiggy", "Instagram", "Notion", "Google Maps", "YouTube"];

const FOCUS_OPTIONS: { value: string; label: string }[] = [
  { value: "overall", label: "Overall product experience" },
  { value: "onboarding", label: "Onboarding flow" },
  { value: "retention", label: "Retention & engagement" },
  { value: "ux", label: "UX & usability" },
  { value: "notifications", label: "Notifications & nudges" },
  { value: "monetization", label: "Monetization" },
];

const LOADING_MESSAGES = [
  "Thinking like a PM...",
  "Analysing user flows...",
  "Finding the pain points...",
  "Crafting your post...",
  "Almost there...",
];

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
  const ripple = useRipple();

  const [appName, setAppName] = useState("");
  const [focus, setFocus] = useState("overall");
  const [notes, setNotes] = useState("");
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [copied, setCopied] = useState(false);
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
    setPost(null);
    setInsights([]);
    setSources([]);
    setAppName("");
    setNotes("");
    setFocus("overall");
    setActiveChip(null);
    setError(null);
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

    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    msgTimer.current = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 1800);

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
      } else {
        setPost(result.post);
        setInsights(result.insights);
        setSources(result.sources ?? []);
      }
    } catch {
      setError("Something went wrong. Please try again in a moment.");
    } finally {
      if (msgTimer.current) clearInterval(msgTimer.current);
      setLoading(false);
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

      {loading && (
        <div className="py-12 text-center">
          <div className="spinner mx-auto mb-4" />
          <div className="loading-label">Analysing product</div>
          <div className="mono-sub mt-1">{loadingMsg}</div>
        </div>
      )}

      {post && !loading && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="loading-label">LinkedIn post — ready to copy</span>
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
