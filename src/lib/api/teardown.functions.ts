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
      appName: z.string().min(1),
      productUrl: z.string().optional().default(""),
      focus: z.string().min(1),
      notes: z.string().optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    const focusLabel = focusLabels[data.focus] ?? "overall product experience";

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

Keep the insights crisp and specific to the app.`;

    const userPrompt = `Generate a LinkedIn product teardown post about ${data.appName}, focusing on the ${focusLabel}.${data.observation ? ` The student personally noticed: "${data.observation}"` : ""} Make it feel authentic and student-perspective.`;

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
          { role: "user", content: userPrompt },
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
