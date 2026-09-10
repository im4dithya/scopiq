import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { emptyAnalysis, normalizeAnalysis, type RawParsed } from "@/lib/analysis";


const focusLabels: Record<string, string> = {
  overall: "overall product experience",
  onboarding: "onboarding flow",
  retention: "retention & engagement",
  ux: "UX & usability",
  notifications: "notifications & nudges",
  monetization: "monetization strategy",
};

// Extract a numeric Apple App Store ID from a raw ID or a URL like
// https://apps.apple.com/us/app/spotify/id324684580
function parseAppStoreId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d{6,12}$/.test(s)) return s;
  const m = s.match(/id(\d{6,12})/i);
  return m ? m[1] : null;
}

type Review = { title: string; body: string; rating?: string };

async function fetchAppStoreReviews(appId: string): Promise<Review[]> {
  try {
    const url = `https://itunes.apple.com/us/rss/customerreviews/id=${appId}/sortby=mostrecent/json`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      feed?: {
        entry?: Array<{
          title?: { label?: string };
          content?: { label?: string };
          "im:rating"?: { label?: string };
        }>;
      };
    };
    const entries = json.feed?.entry ?? [];
    // The first RSS entry is the app metadata, not a review — skip it.
    return entries
      .slice(1)
      .map((e) => ({
        title: e.title?.label?.trim() ?? "",
        body: e.content?.label?.trim() ?? "",
        rating: e["im:rating"]?.label,
      }))
      .filter((r) => r.body.length > 0)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function fallbackReviews(productName: string, focus: string): Review[] {
  const name = productName || "this app";
  const base: Review[] = [
    {
      title: "Love it but…",
      body: `${name} is great for what it does, but the onboarding feels rushed — I was dropped into the main screen with no idea what half the buttons did.`,
      rating: "4",
    },
    {
      title: "Too many notifications",
      body: `Got spammed with push notifications in the first week. Had to dig through three settings screens to turn the noisy ones off. Almost uninstalled.`,
      rating: "2",
    },
    {
      title: "Paywall everywhere",
      body: `Half the features I actually want are behind the paywall, and the upgrade prompts pop up mid-task. Feels disrespectful of my time.`,
      rating: "2",
    },
    {
      title: "Best in class for the core flow",
      body: `When it works, ${name} just works. The core action takes two taps and that's why I keep coming back despite the rough edges.`,
      rating: "5",
    },
    {
      title: "Search is broken",
      body: `Searching for things I've literally used last week returns nothing. The filters reset every time I reopen the app.`,
      rating: "2",
    },
  ];
  if (focus === "onboarding") return [base[0], base[3], base[1]];
  if (focus === "notifications") return [base[1], base[0], base[3]];
  if (focus === "monetization") return [base[2], base[3], base[0]];
  if (focus === "retention") return [base[3], base[2], base[4]];
  if (focus === "ux") return [base[4], base[0], base[3]];
  return base.slice(0, 4);
}

function formatReviewsBlock(reviews: Review[], source: "live" | "sample"): string {
  if (reviews.length === 0) return "";
  const header =
    source === "live"
      ? "CRITICAL USER CONTEXT — recent real App Store reviews (use these as factual evidence):"
      : "CRITICAL USER CONTEXT — representative user reviews for this product type (treat as illustrative, do not claim they are real quotes):";
  const lines = reviews.slice(0, 5).map((r, i) => {
    const rating = r.rating ? ` ★${r.rating}` : "";
    const title = r.title ? ` — "${r.title}"` : "";
    return `${i + 1}.${rating}${title}\n   ${r.body.replace(/\s+/g, " ").trim()}`;
  });
  return `\n\n${header}\n${lines.join("\n")}\n\nWeave 2–3 of these specific user pain points into the teardown as factual evidence (paraphrase, don't quote verbatim). Anchor at least one "what I'd change" observation to a real complaint from this list.`;
}


type WebSource = { url: string; title: string };

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTextPage(url: string, limit = 4000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(ct)) return "";
    const text = htmlToText(await res.text());
    return text.slice(0, limit);
  } catch {
    return "";
  }
}

// Real, reachable public sources — the AI gateway has no live-search model, so
// grounding material is gathered here first and then condensed by the model.
async function gatherResearchMaterial(
  productName: string,
  url: string,
): Promise<{ material: string; sources: WebSource[] }> {
  const blocks: string[] = [];
  const sources: WebSource[] = [];

  const tasks: Promise<void>[] = [];

  // 1. The product's own site (homepage + likely pricing page).
  if (url) {
    let origin = "";
    try {
      origin = new URL(url).origin;
    } catch {
      origin = "";
    }
    const pages = origin ? [url, `${origin}/pricing`] : [url];
    for (const page of pages) {
      tasks.push(
        fetchTextPage(page).then((text) => {
          if (text.length > 300) {
            blocks.push(`SOURCE — official site (${page}):\n${text}`);
            sources.push({ url: page, title: `${productName} — official site` });
          }
        }),
      );
    }
  }

  // 2. Apple App Store listing (description, price, rating, latest release notes).
  tasks.push(
    (async () => {
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(productName)}&entity=software&limit=1`,
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          results?: Array<{
            trackName?: string;
            trackViewUrl?: string;
            description?: string;
            formattedPrice?: string;
            averageUserRating?: number;
            userRatingCount?: number;
            version?: string;
            releaseNotes?: string;
            genres?: string[];
          }>;
        };
        const app = json.results?.[0];
        if (!app?.trackName) return;
        const nameMatch =
          app.trackName.toLowerCase().includes(productName.toLowerCase()) ||
          productName.toLowerCase().includes(app.trackName.toLowerCase().split(/[:\-–]/)[0].trim());
        if (!nameMatch) return;
        blocks.push(
          `SOURCE — Apple App Store listing for "${app.trackName}":\n` +
            [
              app.formattedPrice ? `Price: ${app.formattedPrice}` : "",
              app.averageUserRating
                ? `Rating: ${app.averageUserRating.toFixed(1)}/5 from ${app.userRatingCount ?? 0} ratings`
                : "",
              app.genres?.length ? `Categories: ${app.genres.join(", ")}` : "",
              app.version ? `Latest version: ${app.version}` : "",
              app.releaseNotes ? `Latest release notes: ${app.releaseNotes.slice(0, 600)}` : "",
              app.description ? `Description: ${app.description.slice(0, 1500)}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
        );
        if (app.trackViewUrl) {
          sources.push({ url: app.trackViewUrl, title: `${app.trackName} on the App Store` });
        }
      } catch {
        /* ignore */
      }
    })(),
  );

  // 3. Wikipedia summary (company/product background).
  tasks.push(
    (async () => {
      try {
        const searchRes = await fetch(
          `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(productName)}&limit=1`,
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
        );
        if (!searchRes.ok) return;
        const searchJson = (await searchRes.json()) as {
          pages?: Array<{ key?: string; title?: string }>;
        };
        const page = searchJson.pages?.[0];
        if (!page?.key) return;
        const sumRes = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`,
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
        );
        if (!sumRes.ok) return;
        const sum = (await sumRes.json()) as {
          extract?: string;
          title?: string;
          content_urls?: { desktop?: { page?: string } };
        };
        if (!sum.extract || sum.extract.length < 120) return;
        blocks.push(`SOURCE — Wikipedia (${sum.title}):\n${sum.extract.slice(0, 2000)}`);
        const wikiUrl =
          sum.content_urls?.desktop?.page ??
          `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}`;
        sources.push({ url: wikiUrl, title: `${sum.title} — Wikipedia` });
      } catch {
        /* ignore */
      }
    })(),
  );

  await Promise.allSettled(tasks);

  return { material: blocks.join("\n\n---\n\n").slice(0, 18000), sources };
}

// Dedicated research pass: gather real public pages, then have the model
// condense them into a factual briefing. Never throws — grounding is optional.
async function fetchWebResearch(
  productName: string,
  url: string,
  apiKey: string,
): Promise<{ briefing: string; sources: WebSource[] }> {
  try {
    const { material, sources } = await gatherResearchMaterial(productName, url);
    if (!material || material.length < 200) return { briefing: "", sources: [] };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a research assistant. You are given raw text scraped from real public sources about a product. Report ONLY facts that are actually present in that material: core features, pricing/plans, recent updates, and user reception/ratings. Be concise — 150-250 words, plain prose, no speculation, no marketing fluff. Never add facts that are not in the material. If the material contains nothing useful about the product, reply with exactly: NO_USEFUL_RESULTS",
          },
          {
            role: "user",
            content: `Product: ${productName}${url ? ` (${url})` : ""}\n\nRAW SOURCE MATERIAL:\n${material}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`Web research gateway error ${res.status}`);
      return { briefing: "", sources: [] };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const briefing = (json.choices?.[0]?.message?.content ?? "").trim();
    if (briefing.length < 60 || /NO_USEFUL_RESULTS/i.test(briefing)) {
      return { briefing: "", sources: [] };
    }
    return { briefing, sources };
  } catch {
    return { briefing: "", sources: [] };
  }
}



export const generateTeardown = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      appName: z.string().trim().min(1).max(200),
      productUrl: z
        .string()
        .trim()
        .max(500)
        .refine((v) => v === "" || /^https?:\/\/.+/i.test(v), {
          message: "Must be a valid http(s) URL",
        })
        .optional()
        .default(""),
      focus: z.enum([
        "overall",
        "onboarding",
        "retention",
        "ux",
        "notifications",
        "monetization",
      ]),
      notes: z.string().trim().max(1000).optional().default(""),
      appStoreId: z.string().trim().max(200).optional().default(""),
      useWebSearch: z.boolean().optional().default(false),
      screenshot: z
        .object({
          data: z.string().min(1).max(7_500_000),
          mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        })
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    const focusLabel = focusLabels[data.focus] ?? "overall product experience";

    // Detect if appName is itself a URL and derive a clean display name.
    const rawInput = data.appName.trim();
    const looksLikeUrl =
      /^https?:\/\//i.test(rawInput) || /\.(com|app|io|co|net|org|dev|ai|xyz)(\/|$)/i.test(rawInput);
    let cleanedProductName = rawInput;
    let detectedUrl = data.productUrl?.trim() || "";
    if (looksLikeUrl) {
      try {
        const withProto = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
        const u = new URL(withProto);
        if (!detectedUrl) detectedUrl = withProto;
        const host = u.hostname.replace(/^www\./i, "");
        const core = host.split(".")[0] ?? host;
        cleanedProductName = core.charAt(0).toUpperCase() + core.slice(1);
      } catch {
        // fall back to raw input
      }
    }

    const isWebProduct = Boolean(detectedUrl) || looksLikeUrl;

    // Separate research pass: strict JSON mode on the main call suppresses real
    // search behaviour, so grounding happens here in plain-text mode first.
    let webBriefing = "";
    let webSources: { url: string; title: string }[] = [];
    if (data.useWebSearch) {
      const research = await fetchWebResearch(cleanedProductName, detectedUrl, apiKey);
      webBriefing = research.briefing;
      webSources = research.sources;
    }
    const grounded = data.useWebSearch && webBriefing.length > 0;
    const webSearchStatus: "grounded" | "no_results" | "disabled" = !data.useWebSearch
      ? "disabled"
      : grounded
        ? "grounded"
        : "no_results";



    const systemPrompt = `You are a product management expert helping a CS student build their LinkedIn presence.
${
  data.notes
    ? `USER FOCUS OVERRIDE (read this first — highest priority):
The student specifically asked for: "${data.notes}"
The post's core content, and BOTH "what they did well" / "what I'd change" observations, must center on exactly this request. Do not default to generic PM framework commentary (JTBD, monetization, retention, dark patterns) unless it is directly relevant to what was asked. If the request is narrow (e.g. only visual/color design, only a specific screen, only pricing), stay narrow — depth on the actual ask beats breadth across unrelated categories.`
    : ""
}


STEP 1 — VALIDATE THE INPUT:
Decide whether the product the user provided refers to a real, identifiable product, app, website, tool, or service you have genuine knowledge of (or, if a URL/screenshot is provided, clearly resolves to a real product).
- If the input is gibberish, random characters, an obvious typo you cannot confidently map to a real product, or anything you would have to invent details about, treat it as INVALID.
- Do NOT fuzzy-match nonsense to real products just to be helpful.
- A URL with a recognizable, resolvable domain, or a screenshot of a real product UI, counts as valid even if the name is unfamiliar.

STEP 2 — RESPOND WITH A SINGLE JSON OBJECT, AND NOTHING ELSE (no markdown fences, no prose):
{"status":"valid"|"invalid","post":string|null,"message":string|null,"anchors":[],"jtbd":[],"metrics":null,"darkPatterns":[]}

If INVALID: status="invalid", post=null, message=short one-sentence reason (e.g. "Input does not appear to be a real product."), and empty/null analysis fields.

If VALID: status="valid", message=null, and "post" contains the full LinkedIn teardown post text followed by a "---INSIGHTS---" separator and exactly 4 insight lines:
GOOD: [something done well]
GOOD: [something done well]
IMPROVE: [something to improve]
IMPROVE: [something to improve]

ALSO FOR VALID RESPONSES, fill these analysis fields.
If the user's focus override (notes) is unrelated to a given field below, return an empty/minimal result for that field rather than inventing generic content to fill it — accuracy to the actual request matters more than filling every field.



1. "anchors" — Visual Anchoring. 3-5 objects: {"label":string,"note":string,"kind":"good"|"improve","x":number,"y":number,"w":number,"h":number}
   x/y/w/h are PERCENTAGES (0-100) of the image, marking the exact region the observation refers to.
   ${data.screenshot ? "A screenshot IS attached — anchor every item to a real region you can actually see in it (be accurate about position)." : "NO screenshot was attached — return an EMPTY array [] for anchors. Never invent coordinates."}

2. "jtbd" — Jobs-To-Be-Done + strategy. 2-3 objects: {"job":"When [situation], I want to [motivation], so I can [outcome]","persona":string,"gap":string}

3. "metrics" — measurement strategy: {"northStar":{"name":string,"why":string},"supporting":[{"name":string,"definition":string,"target":string}]} with 3 supporting metrics tied to the focus area.

4. "darkPatterns" — Dark Pattern Detection. 0-4 objects: {"name":string,"severity":"low"|"medium"|"high","evidence":string,"fix":string}
   Only report patterns you have real grounds for (roach motel, forced continuity, confirmshaming, disguised ads, hidden costs, nagging, privacy zuckering, trick questions, false urgency). Return [] when there is no genuine evidence — do NOT invent them.

POST REQUIREMENTS (valid only):
- Sound like a sharp, curious CS student learning PM/PD, not a senior executive
- Casual, conversational, insightful
- Strong opening hook (do NOT start with "I")
- Short paragraphs, arrows (→) or numbered lists
- 2-3 specific "what they did well" observations
- 2-3 specific "what I'd change" observations with reasoning
- End with an engaging question for comments
- 4-5 relevant hashtags (#ProductManagement #ProductDesign #StudentPM etc.)
- 200-280 words total
- Genuine and personal, not generic


ANTI-HALLUCINATION RULES (STRICT):
- Base every claim in the post on (a) verifiable facts about the real product, (b) the attached screenshot if any, or (c) the provided user reviews. Do not invent features, pricing, funding, headcount, launch dates, integrations, or partnerships.
- ${grounded ? "A verified web research briefing is included in the user message — treat it as ground truth and prefer its specifics over general knowledge or generic PM tropes." : "You do NOT have web search results — stay strictly within what you genuinely know about this product from training data plus the provided reviews/screenshot. If you are not sure about a specific fact (e.g. exact pricing tier, a specific feature name, a recent update), do NOT state it. Speak in terms of the general product experience instead."}
- If you cannot form 2-3 concrete, product-specific observations without inventing details, return status="invalid" with message="Not enough verifiable information about this product to write a grounded teardown."
- Never fabricate quotes, statistics, review counts, star ratings, or user numbers.
- Prefer concrete UI/UX observations ("the onboarding asks for 4 permissions upfront") over vague marketing claims ("industry-leading experience").

Detect website/web app vs mobile app. For websites, analyze layout grids, visual hierarchy, CTA placement, landing-page conversion, web responsiveness — not push notifications or app store onboarding.

If a screenshot is provided, actively inspect its visual execution (layout, typography, padding, color usage, friction points) and weave specific observations into the post.`;

    const productContext = isWebProduct
      ? `the web product ${cleanedProductName}${detectedUrl ? ` (${detectedUrl})` : ""}`
      : cleanedProductName;

    // Fetch live App Store reviews when an ID/URL is provided; otherwise
    // fall back to a realistic illustrative set so the AI still has user
    // pain points to anchor on.
    const parsedAppId = parseAppStoreId(data.appStoreId ?? "");
    let reviews: Review[] = [];
    let reviewSource: "live" | "sample" = "sample";
    if (parsedAppId) {
      reviews = await fetchAppStoreReviews(parsedAppId);
      if (reviews.length > 0) reviewSource = "live";
    }
    if (reviews.length === 0) {
      reviews = fallbackReviews(cleanedProductName, data.focus);
      reviewSource = "sample";
    }
    const reviewsBlock = formatReviewsBlock(reviews, reviewSource);

    const researchBlock = grounded
      ? `\n\nVERIFIED WEB RESEARCH (treat as ground truth, prefer these specifics over general knowledge):\n${webBriefing}`
      : "";

    const userPrompt = `Generate a LinkedIn product teardown post about ${productContext}, focusing on the ${focusLabel}.${data.notes ? ` IMPORTANT — the post must specifically address: "${data.notes}"` : ""}${data.screenshot ? " A screenshot of the product UI is attached — analyse its visual design directly." : ""} Make it feel authentic and student-perspective.${researchBlock}${reviewsBlock}`;

    const userContent: unknown = data.screenshot
      ? [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${data.screenshot.mediaType};base64,${data.screenshot.data}`,
            },
          },
        ]
      : userPrompt;


    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // Web search runs as a separate research pass (fetchWebResearch) — this
        // call is always the plain model so strict JSON mode stays reliable.
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });


    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${txt}`);
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const message = json.choices?.[0]?.message;
    const fullText = message?.content ?? "";

    // Citations come from the separate research pass.
    const sources = webSources;


    // Parse the structured JSON response. Strip markdown fences if the model
    // adds them despite instructions.
    let parsed: RawParsed = {};
    try {
      const cleaned = fullText
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned) as RawParsed;
    } catch {
      return {
        status: "invalid" as const,
        post: null,
        insights: [] as { type: "good" | "improve"; text: string }[],
        sources: [] as { url: string; title: string }[],
        analysis: emptyAnalysis(),
        message: "Could not parse model response. Please try again.",
        webSearchStatus,
      };
    }

    if (parsed.status === "invalid") {
      return {
        status: "invalid" as const,
        post: null,
        insights: [] as { type: "good" | "improve"; text: string }[],
        sources: [] as { url: string; title: string }[],
        analysis: emptyAnalysis(),
        message: parsed.message || "We couldn't recognize that as a real product.",
        webSearchStatus,
      };
    }

    const fullPost = (parsed.post ?? "").toString();
    const [postRaw, insightsRaw = ""] = fullPost.split("---INSIGHTS---");
    const post = postRaw.trim();
    const insights = insightsRaw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("GOOD:") || l.startsWith("IMPROVE:"))
      .map((l) => ({
        type: l.startsWith("GOOD:") ? ("good" as const) : ("improve" as const),
        text: l.replace(/^(GOOD|IMPROVE):/, "").trim(),
      }));

    const analysis = normalizeAnalysis(parsed, Boolean(data.screenshot));

    return { status: "valid" as const, post, insights, sources, analysis, message: null, webSearchStatus };
  });


export const refineTeardown = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      appName: z.string().trim().min(1).max(200),
      productUrl: z
        .string()
        .trim()
        .max(500)
        .refine((v) => v === "" || /^https?:\/\/.+/i.test(v), {
          message: "Must be a valid http(s) URL",
        })
        .optional()
        .default(""),
      existingPost: z.string().trim().min(1).max(20000),
      existingAnalysis: z
        .object({
          anchors: z.array(z.record(z.string(), z.unknown())).max(10).optional().default([]),
          jtbd: z.array(z.record(z.string(), z.unknown())).max(10).optional().default([]),
          metrics: z.record(z.string(), z.unknown()).nullable().optional().default(null),
          darkPatterns: z.array(z.record(z.string(), z.unknown())).max(10).optional().default([]),
        })
        .optional()
        .default({ anchors: [], jtbd: [], metrics: null, darkPatterns: [] }),
      refinementRequest: z.string().trim().min(3).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    const systemPrompt = `You are a product management expert extending an existing LinkedIn product teardown.

You will be given: the product, the already-generated post, the already-generated analysis JSON, and a specific refinement request from the user.

YOUR TASK: produce ONLY NEW content that satisfies the refinement request. Do not repeat, restate, or rewrite what already exists.

RESPOND WITH VALID JSON ONLY — no markdown fences, no prose outside the JSON. Shape:
{"jtbd":[{"job":"When [situation], I want to [motivation], so I can [outcome]","persona":string,"gap":string}],"metrics":{"northStar":{"name":string,"why":string},"supporting":[{"name":string,"definition":string,"target":string}]},"darkPatterns":[{"name":string,"severity":"low"|"medium"|"high","evidence":string,"fix":string}],"addendum":string}

RULES:
- "jtbd" and "darkPatterns" contain ONLY NEW items to append (0-3 each). Return [] when the refinement request gives no genuine grounds for new items.
- "metrics" is the updated measurement strategy if the refinement changes it; otherwise return null.
- "anchors" must be [] — no new visual anchors here.
- "addendum" is a short, post-worthy paragraph (60-120 words) in the SAME voice as the existing post (sharp, curious CS student learning PM), directly answering the refinement request. No hashtags, no sign-off.

ANTI-HALLUCINATION RULES (STRICT):
- Base every claim on verifiable facts about the real product or on the existing post/analysis. Do not invent features, pricing, funding, headcount, launch dates, integrations, or partnerships.
- Never fabricate quotes, statistics, review counts, star ratings, or user numbers.
- Only report dark patterns you have real grounds for; return [] otherwise.
- If you are not sure about a specific fact, speak in terms of the general product experience instead of stating it.
- Prefer concrete UI/UX and strategy observations over vague marketing claims.`;

    const userPrompt = `PRODUCT: ${data.appName}${data.productUrl ? ` (${data.productUrl})` : ""}

EXISTING POST:
${data.existingPost}

EXISTING ANALYSIS JSON:
${JSON.stringify(data.existingAnalysis)}

REFINEMENT REQUEST: ${data.refinementRequest}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      console.error(`AI gateway error ${res.status}`, await res.text());
      throw new Error("The AI service is unavailable right now. Please try again.");
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const fullText = json.choices?.[0]?.message?.content ?? "";

    let parsed: RawParsed & { addendum?: unknown } = {};
    try {
      const cleaned = fullText
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned) as RawParsed & { addendum?: unknown };
    } catch {
      return {
        status: "invalid" as const,
        addendum: "",
        analysis: emptyAnalysis(),
        message: "Could not parse model response. Please try again.",
      };
    }

    const normalized = normalizeAnalysis(parsed, false);
    const addendum = typeof parsed.addendum === "string" ? parsed.addendum.trim() : "";

    return {
      status: "valid" as const,
      addendum,
      analysis: normalized,
      message: null,
    };
  });
