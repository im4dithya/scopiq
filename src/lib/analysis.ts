export type VisualAnchor = {
  label: string;
  note: string;
  kind: "good" | "improve";
  x: number;
  y: number;
  w: number;
  h: number;
};

export type JtbdItem = { job: string; persona: string; gap: string };

export type MetricsStrategy = {
  northStar: { name: string; why: string };
  supporting: { name: string; definition: string; target: string }[];
};

export type DarkPattern = {
  name: string;
  severity: "low" | "medium" | "high";
  evidence: string;
  fix: string;
};

export type TeardownAnalysis = {
  anchors: VisualAnchor[];
  jtbd: JtbdItem[];
  metrics: MetricsStrategy | null;
  darkPatterns: DarkPattern[];
};

export type RawParsed = {
  status?: string;
  post?: string | null;
  message?: string | null;
  anchors?: unknown;
  jtbd?: unknown;
  metrics?: unknown;
  darkPatterns?: unknown;
};

export function emptyAnalysis(): TeardownAnalysis {
  return { anchors: [], jtbd: [], metrics: null, darkPatterns: [] };
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function clampPct(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
}

export function normalizeAnalysis(parsed: RawParsed, hasScreenshot: boolean): TeardownAnalysis {
  const anchors: VisualAnchor[] = hasScreenshot
    ? arr(parsed.anchors)
        .map((a) => ({
          label: str(a.label),
          note: str(a.note),
          kind: a.kind === "good" ? ("good" as const) : ("improve" as const),
          x: clampPct(a.x, 10),
          y: clampPct(a.y, 10),
          w: Math.max(4, clampPct(a.w, 20)),
          h: Math.max(4, clampPct(a.h, 12)),
        }))
        .filter((a) => a.label.length > 0)
        .slice(0, 6)
    : [];

  const jtbd: JtbdItem[] = arr(parsed.jtbd)
    .map((j) => ({ job: str(j.job), persona: str(j.persona), gap: str(j.gap) }))
    .filter((j) => j.job.length > 0)
    .slice(0, 4);

  const rawMetrics = (parsed.metrics && typeof parsed.metrics === "object"
    ? (parsed.metrics as Record<string, unknown>)
    : null);
  let metrics: MetricsStrategy | null = null;
  if (rawMetrics) {
    const ns = (rawMetrics.northStar && typeof rawMetrics.northStar === "object"
      ? (rawMetrics.northStar as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const supporting = arr(rawMetrics.supporting)
      .map((m) => ({ name: str(m.name), definition: str(m.definition), target: str(m.target) }))
      .filter((m) => m.name.length > 0)
      .slice(0, 5);
    const nsName = str(ns.name);
    if (nsName || supporting.length > 0) {
      metrics = { northStar: { name: nsName, why: str(ns.why) }, supporting };
    }
  }

  const darkPatterns: DarkPattern[] = arr(parsed.darkPatterns)
    .map((d) => {
      const sev = str(d.severity).toLowerCase();
      return {
        name: str(d.name),
        severity: sev === "high" ? ("high" as const) : sev === "low" ? ("low" as const) : ("medium" as const),
        evidence: str(d.evidence),
        fix: str(d.fix),
      };
    })
    .filter((d) => d.name.length > 0)
    .slice(0, 5);

  return { anchors, jtbd, metrics, darkPatterns };
}
