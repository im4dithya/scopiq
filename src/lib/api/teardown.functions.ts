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

    const systemPrompt = `You are a product management expert helping a CS student build their LinkedIn presence. Generate a LinkedIn post that performs a product teardown analysis. The post should:
- Sound like a sharp, curious CS student who is learning PM/PD, not a senior executive
- Be casual and conversational but insightful
- Have a strong opening hook (no "I" as first word)
- Use short paragraphs and arrow (→) or numbered lists for readability
- Include 2-3 specific "what they did well" observations
- Include 2-3 specific "what I'd change" observations with reasoning
- End with an engaging question for comments
- Include 4-5 relevant hashtags like #ProductManagement #ProductDesign #StudentPM etc.
- Be between 200-280 words total
- Feel genuine and personal, not generic

After the post, on a new line write: ---INSIGHTS---
Then provide exactly 4 short insights (one sentence each) in this format:
GOOD: [something done well]
GOOD: [something done well]
IMPROVE: [something to improve]
IMPROVE: [something to improve]

Keep the insights crisp and specific to the product.

Detect if the target product is a website/web application (based on a provided URL link or desktop website screenshot) vs a traditional mobile application.

If it is a website/web application, pivot your product vocabulary away from mobile-only metrics (like app store onboarding, push notifications, app downloads) and instead analyze web design paradigms: layout grids, desktop visual hierarchy, call-to-action (CTA) positioning, landing page conversions, or web app responsiveness.

If an image/screenshot is provided in the input payload, you must actively inspect its visual design execution (including layout hierarchy, typography, padding, color usage, and interface friction points). Seamlessly weave these specific visual teardown observations into your final LinkedIn post analysis.`;

    const productContext = isWebProduct
      ? `the web product ${cleanedProductName}${detectedUrl ? ` (${detectedUrl})` : ""}`
      : cleanedProductName;

    const userPrompt = `Generate a LinkedIn product teardown post about ${productContext}, focusing on the ${focusLabel}.${data.notes ? ` The student noted: "${data.notes}"` : ""}${data.screenshot ? " A screenshot of the product UI is attached — analyse its visual design directly." : ""} Make it feel authentic and student-perspective.`;

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
        model: "google/gemini-2.5-flash",
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

    const [postRaw, insightsRaw = ""] = fullText.split("---INSIGHTS---");
    const post = postRaw.trim();
    const insights = insightsRaw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("GOOD:") || l.startsWith("IMPROVE:"))
      .map((l) => ({
        type: l.startsWith("GOOD:") ? ("good" as const) : ("improve" as const),
        text: l.replace(/^(GOOD|IMPROVE):/, "").trim(),
      }));

    return { post, insights };
  });
