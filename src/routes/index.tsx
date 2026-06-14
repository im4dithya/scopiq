import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, type MouseEvent, type ChangeEvent, type DragEvent } from "react";
import { ImageUp, X } from "lucide-react";
import { toast } from "sonner";
import { generateTeardown } from "@/lib/api/teardown.functions";
import { analyzeOmniInput } from "@/lib/omni-input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Product Teardown Generator" },
      {
        name: "description",
        content:
          "Pick an app and get a LinkedIn-ready product teardown post written from a student PM perspective.",
      },
      { property: "og:title", content: "Product Teardown Generator" },
      {
        property: "og:description",
        content:
          "Pick an app and get a LinkedIn-ready product teardown post written from a student PM perspective.",
      },
    ],
  }),
  component: Index,
});

const QUICK_APPS = [
  "Spotify",
  "Swiggy",
  "Instagram",
  "Notion",
  "Google Maps",
  "YouTube",
];

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

// Ripple "splash" effect on buttons
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

function Index() {
  const generate = useServerFn(generateTeardown);
  const ripple = useRipple();

  const [appName, setAppName] = useState("");
  const [focus, setFocus] = useState("overall");
  const [notes, setNotes] = useState("");
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
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

    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    msgTimer.current = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 1800);

    try {
      const result = await generate({
        data: {
          appName: appName.trim(),
          productUrl: productUrl.trim(),
          focus: focus as "overall" | "onboarding" | "retention" | "ux" | "notifications" | "monetization",
          notes: notes.trim(),
          appStoreId: appStoreId.trim(),
          screenshot: screenshot
            ? { data: screenshot.base64, mediaType: screenshot.mediaType }
            : undefined,
        },
      });
      setPost(result.post);
      setInsights(result.insights);
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
    <div className="teardown-bg min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-[720px]">
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
              <label className="field-label">Product Name or Website URL</label>
              <input
                type="text"
                value={appName}
                onChange={(e) => {
                  setAppName(e.target.value);
                  setActiveChip(null);
                }}
                placeholder="e.g., Spotify, https://linear.app, Notion..."
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
              <label className="field-label">App Store ID or URL (optional)</label>
              <input
                type="text"
                value={appStoreId}
                onChange={(e) => setAppStoreId(e.target.value)}
                placeholder="e.g., 324684580 or https://apps.apple.com/.../id324684580"
                className="field-input"
              />
              <p className="mono-sub mt-2" style={{ fontSize: 11.5 }}>
                If provided, recent App Store reviews are pulled in as real user evidence.
              </p>
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
              <label className="field-label">Product URL (optional)</label>
              <input
                type="url"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://..."
                className="field-input"
              />
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
                    <div className="dropzone-preview-size">
                      {formatBytes(screenshot.file.size)}
                    </div>
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

            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || screenshotProcessing}
              className="btn-white mt-6 w-full"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              {loading
                ? "Generating…"
                : screenshotProcessing
                  ? "Processing image…"
                  : "Generate teardown post"}
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
              <span className="loading-label">
                LinkedIn post — ready to copy
              </span>
              <button
                type="button"
                onClick={copyPost}
                className={`btn-white-sm ${copied ? "is-copied" : ""}`}
              >
                {copied ? (
                  <>
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Copy post
                  </>
                )}
              </button>
            </div>

            <div className="glass-card post-box whitespace-pre-wrap p-6">
              {post}
            </div>

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
      </div>
    </div>
  );
}
