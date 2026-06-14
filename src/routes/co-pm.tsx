import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Mic, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { AppNav } from "@/components/AppNav";
import { generatePRD } from "@/lib/api/copm.functions";

export const Route = createFileRoute("/co-pm")({
  head: () => ({
    meta: [
      { title: "AI Co-PM — Pitch, Critique, PRD" },
      {
        name: "description",
        content:
          "Pitch an app idea and get a structured PRD, competitor analysis, and brutally honest feature critique from an AI Senior PM.",
      },
      { property: "og:title", content: "AI Co-PM" },
      {
        property: "og:description",
        content: "Generate full PRDs, competitor analysis, and feature critiques from a single pitch.",
      },
    ],
  }),
  component: CoPmPage,
});

const MODELS = [
  {
    value: "claude-3-5-sonnet",
    label: "Claude 3.5 Sonnet — Best for PM Logic",
    placeholder: "Pitch your idea... Claude will pressure-test scope and prioritisation.",
  },
  {
    value: "gemini-1-5-pro",
    label: "Gemini 1.5 Pro — Best for Deep Strategy",
    placeholder: "Pitch your idea... Gemini will map competitive moats and long-horizon strategy.",
  },
  {
    value: "llama-3-1-70b",
    label: "Llama 3.1 70B — Fast Brainstorming",
    placeholder: "Pitch your idea... Llama will rapid-fire feature ideas and tradeoffs.",
  },
] as const;

const DEFAULT_PLACEHOLDER =
  "Pitch your idea... e.g., A pet management system that combines e-commerce with medical record tracking and vet booking.";

// Minimal browser SpeechRecognition typings (vendor-prefixed)
type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

function CoPmPage() {
  const runPRD = useServerFn(generatePRD);

  const [model, setModel] = useState<(typeof MODELS)[number]["value"]>("gemini-1-5-pro");
  const [idea, setIdea] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const recogRef = useRef<SR | null>(null);

  const placeholder =
    MODELS.find((m) => m.value === model)?.placeholder ?? DEFAULT_PLACEHOLDER;

  useEffect(() => {
    return () => {
      try {
        recogRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  function toggleVoice() {
    if (listening) {
      try {
        recogRef.current?.stop();
      } catch {
        /* noop */
      }
      setListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SR;
      webkitSpeechRecognition?: new () => SR;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("Voice input isn't supported in this browser. Try Chrome.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setIdea((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast.error("Microphone permission denied. Enable it in your browser settings.");
      } else if (e.error !== "aborted") {
        toast.error("Voice input error. Please try again.");
      }
      setListening(false);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      recogRef.current = rec;
      setListening(true);
    } catch {
      toast.error("Couldn't start voice input.");
    }
  }

  async function onGenerate(_e: MouseEvent<HTMLButtonElement>) {
    if (idea.trim().length < 10) {
      setError("Give me a bit more to work with — at least a sentence.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const out = await runPRD({ data: { idea: idea.trim(), model } });
      setResult(out.markdown);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="teardown-bg min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-[760px]">
        <AppNav />

        <header className="mb-10">
          <div className="eyebrow">AI Co-PM · brutally honest PRDs</div>
          <h1 className="display-h1 mt-3">
            Your <span className="text-gradient-gold">Co-Pilot</span>
            <br />
            for Product Strategy
          </h1>
          <p className="mono-sub mt-3">
            Pitch an idea → get a full PRD, competitor scan, and feature critique.
          </p>
        </header>

        {!result && (
          <section className="glass-card p-6">
            <div className="mb-5">
              <label className="field-label">Select AI Brain</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as typeof model)}
                className="field-input field-select"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="field-label">Describe your vision</label>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder={placeholder}
                className="field-input min-h-[180px] resize-y leading-relaxed"
              />
            </div>

            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={toggleVoice}
                className={`voice-btn ${listening ? "voice-btn-active" : ""}`}
                aria-pressed={listening}
              >
                <Mic size={16} />
                {listening ? "Listening…" : "Voice Input"}
              </button>
              <span className="mono-sub text-xs">{idea.trim().length} chars</span>
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={loading}
              className="btn-white mt-6 w-full"
            >
              <Sparkles size={16} />
              {loading ? "Consulting the Product Board…" : "Generate Full PRD & Strategy"}
            </button>

            {error && <div className="error-box mt-4">{error}</div>}
          </section>
        )}

        {loading && (
          <div className="py-12 text-center">
            <div className="spinner mx-auto mb-4" />
            <div className="loading-label">Consulting the Product Board…</div>
            <div className="mono-sub mt-1">Drafting your PRD with {model}</div>
          </div>
        )}

        {result && !loading && (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="loading-label">PRD & Strategy — ready</span>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(result);
                  toast.success("PRD copied to clipboard");
                }}
                className="btn-white-sm"
              >
                Copy markdown
              </button>
            </div>
            <article className="glass-card prd-output p-7">
              <ReactMarkdown>{result}</ReactMarkdown>
            </article>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setIdea("");
                setError(null);
              }}
              className="reset-btn mt-6"
            >
              ← Pitch another idea
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
