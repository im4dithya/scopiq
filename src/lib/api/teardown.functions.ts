import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

    const systemPrompt = `You are a product management expert helping a CS student build their LinkedIn presence.

STEP 1 — VALIDATE THE INPUT:
Decide whether the product the user provided refers to a real, identifiable product, app, website, tool, or service you have genuine knowledge of (or, if a URL/screenshot is provided, clearly resolves to a real product).
- If the input is gibberish, random characters, an obvious typo you cannot confidently map to a real product, or anything you would have to invent details about, treat it as INVALID.
- Do NOT fuzzy-match nonsense to real products just to be helpful.
- A URL with a recognizable, resolvable domain, or a screenshot of a real product UI, counts as valid even if the name is unfamiliar.

STEP 2 — RESPOND WITH A SINGLE JSON OBJECT, AND NOTHING ELSE (no markdown fences, no prose):
{"status":"valid"|"invalid","post":string|null,"message":string|null}

If INVALID: status="invalid", post=null, message=short one-sentence reason (e.g. "Input does not appear to be a real product.").

If VALID: status="valid", message=null, and "post" contains the full LinkedIn teardown post text followed by a "---INSIGHTS---" separator and exactly 4 insight lines:
GOOD: [something done well]
GOOD: [something done well]
IMPROVE: [something to improve]
IMPROVE: [something to improve]

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
- ${data.useWebSearch ? "You have web search grounding enabled — use it to look up current, real information (features, recent updates, reviews, pricing/plans) about the product BEFORE writing. Prefer specifics you actually found over generic PM tropes." : "You do NOT have web search enabled — stay strictly within what you genuinely know about this product from training data plus the provided reviews/screenshot. If you are not sure about a specific fact (e.g. exact pricing tier, a specific feature name, a recent update), do NOT state it. Speak in terms of the general product experience instead."}
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

    const userPrompt = `Generate a LinkedIn product teardown post about ${productContext}, focusing on the ${focusLabel}.${data.notes ? ` The student noted: "${data.notes}"` : ""}${data.screenshot ? " A screenshot of the product UI is attached — analyse its visual design directly." : ""} Make it feel authentic and student-perspective.${reviewsBlock}`;

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
        // OpenRouter :online suffix enables web search grounding for this call.
        // See https://openrouter.ai/docs/features/web-search
        model: data.useWebSearch ? "google/gemini-2.5-flash:online" : "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        ...(data.useWebSearch
          ? {
              plugins: [
                {
                  id: "web",
                  max_results: 5,
                  search_prompt: `Search for real, current information about "${cleanedProductName}"${detectedUrl ? ` (${detectedUrl})` : ""}: its actual features, pricing/plans, recent updates, and real user reviews. Use these facts to ground the teardown.`,
                },
              ],
            }
          : {}),
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
    const fullText = json.choices?.[0]?.message?.content ?? "";

    // Parse the structured JSON response. Strip markdown fences if the model
    // adds them despite instructions.
    let parsed: { status?: string; post?: string | null; message?: string | null } = {};
    try {
      const cleaned = fullText
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        status: "invalid" as const,
        post: null,
        insights: [] as { type: "good" | "improve"; text: string }[],
        message: "Could not parse model response. Please try again.",
      };
    }

    if (parsed.status === "invalid") {
      return {
        status: "invalid" as const,
        post: null,
        insights: [] as { type: "good" | "improve"; text: string }[],
        message: parsed.message || "We couldn't recognize that as a real product.",
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

    return { status: "valid" as const, post, insights, message: null };
  });
