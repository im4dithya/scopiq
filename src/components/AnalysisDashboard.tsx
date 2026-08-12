import { useState } from "react";
import { Crosshair, Target, ShieldAlert } from "lucide-react";
import type { TeardownAnalysis } from "@/lib/analysis";

type Tab = "visual" | "strategy" | "patterns";

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function AnalysisDashboard({
  analysis,
  screenshotUrl,
}: {
  analysis: TeardownAnalysis;
  screenshotUrl?: string | null;
}) {
  const hasVisual = analysis.anchors.length > 0 && Boolean(screenshotUrl);
  const hasStrategy = analysis.jtbd.length > 0 || Boolean(analysis.metrics);
  const hasPatterns = analysis.darkPatterns.length > 0;

  const initial: Tab = hasVisual ? "visual" : hasStrategy ? "strategy" : "patterns";
  const [tab, setTab] = useState<Tab>(initial);
  const [activeAnchor, setActiveAnchor] = useState<number | null>(null);

  if (!hasVisual && !hasStrategy && !hasPatterns) return null;

  const tabs: { id: Tab; label: string; icon: typeof Crosshair; count?: number }[] = [
    { id: "visual", label: "Visual anchoring", icon: Crosshair, count: analysis.anchors.length },
    { id: "strategy", label: "JTBD & metrics", icon: Target },
    { id: "patterns", label: "Dark patterns", icon: ShieldAlert, count: analysis.darkPatterns.length },
  ];

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="loading-label">Analysis results dashboard</span>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-white/10 p-3">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`chip ${tab === t.id ? "chip-active" : ""}`}
              >
                <Icon size={13} className="mr-1 inline" />
                {t.label}
                {typeof t.count === "number" && t.count > 0 ? ` (${t.count})` : ""}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {tab === "visual" &&
            (hasVisual ? (
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  <img
                    src={screenshotUrl ?? ""}
                    alt="Analysed product screenshot with highlighted regions"
                    className="block w-full"
                  />
                  {analysis.anchors.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseEnter={() => setActiveAnchor(i)}
                      onMouseLeave={() => setActiveAnchor(null)}
                      onFocus={() => setActiveAnchor(i)}
                      onBlur={() => setActiveAnchor(null)}
                      onClick={() => setActiveAnchor(i)}
                      aria-label={a.label}
                      className={`anchor-box ${a.kind === "good" ? "anchor-good" : "anchor-improve"} ${
                        activeAnchor === i ? "anchor-active" : ""
                      }`}
                      style={{
                        left: `${a.x}%`,
                        top: `${a.y}%`,
                        width: `${a.w}%`,
                        height: `${a.h}%`,
                      }}
                    >
                      <span className="anchor-pin">{i + 1}</span>
                    </button>
                  ))}
                </div>

                <ul className="space-y-3">
                  {analysis.anchors.map((a, i) => (
                    <li
                      key={i}
                      onMouseEnter={() => setActiveAnchor(i)}
                      onMouseLeave={() => setActiveAnchor(null)}
                      className={`insight-card ${a.kind === "good" ? "insight-good" : "insight-improve"} ${
                        activeAnchor === i ? "ring-1 ring-white/40" : ""
                      }`}
                    >
                      <div className="insight-label">
                        {i + 1} · {a.kind === "good" ? "Works well" : "Friction"}
                      </div>
                      <div className="insight-content font-medium">{a.label}</div>
                      {a.note && (
                        <div className="mono-sub mt-1 text-xs opacity-80">{a.note}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mono-sub text-sm">
                Upload a screenshot before generating to get region-anchored visual observations.
              </p>
            ))}

          {tab === "strategy" &&
            (hasStrategy ? (
              <div className="space-y-6">
                {analysis.jtbd.length > 0 && (
                  <div>
                    <div className="insight-label mb-3">Jobs to be done</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {analysis.jtbd.map((j, i) => (
                        <div key={i} className="insight-card">
                          <div className="insight-content font-medium">{j.job}</div>
                          {j.persona && (
                            <div className="mono-sub mt-2 text-xs opacity-80">Persona: {j.persona}</div>
                          )}
                          {j.gap && (
                            <div className="mono-sub mt-1 text-xs opacity-80">Gap: {j.gap}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.metrics && (
                  <div>
                    <div className="insight-label mb-3">Metrics strategy</div>
                    {analysis.metrics.northStar.name && (
                      <div className="insight-card insight-good">
                        <div className="insight-label">North star metric</div>
                        <div className="insight-content font-medium">
                          {analysis.metrics.northStar.name}
                        </div>
                        {analysis.metrics.northStar.why && (
                          <div className="mono-sub mt-1 text-xs opacity-80">
                            {analysis.metrics.northStar.why}
                          </div>
                        )}
                      </div>
                    )}
                    {analysis.metrics.supporting.length > 0 && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        {analysis.metrics.supporting.map((m, i) => (
                          <div key={i} className="insight-card">
                            <div className="insight-content font-medium">{m.name}</div>
                            {m.definition && (
                              <div className="mono-sub mt-1 text-xs opacity-80">{m.definition}</div>
                            )}
                            {m.target && (
                              <div className="mono-sub mt-1 text-xs opacity-60">Target: {m.target}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="mono-sub text-sm">No strategy signals were returned for this product.</p>
            ))}

          {tab === "patterns" &&
            (hasPatterns ? (
              <ul className="space-y-3">
                {analysis.darkPatterns.map((d, i) => (
                  <li key={i} className="insight-card insight-improve">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="insight-content font-medium">{d.name}</span>
                      <span className={`badge severity-${d.severity}`}>
                        {SEVERITY_LABEL[d.severity]} risk
                      </span>
                    </div>
                    {d.evidence && (
                      <div className="mono-sub mt-2 text-xs opacity-80">Evidence: {d.evidence}</div>
                    )}
                    {d.fix && (
                      <div className="mono-sub mt-1 text-xs opacity-80">Fix: {d.fix}</div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mono-sub text-sm">
                No manipulative patterns were detected with enough evidence — that's a good sign.
              </p>
            ))}
        </div>
      </div>
    </section>
  );
}
