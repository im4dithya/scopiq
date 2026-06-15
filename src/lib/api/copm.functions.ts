import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Map the user-facing model labels to models supported by the Lovable AI Gateway.
// We keep the original IDs in the UI for clarity but route through the gateway
// so API keys stay server-side.
const MODEL_MAP: Record<string, string> = {
  "claude-3-5-sonnet": "openai/gpt-5",
  "gemini-1-5-pro": "google/gemini-2.5-pro",
  "llama-3-1-70b": "google/gemini-2.5-flash-lite",
};

const SYSTEM_PROMPT = `You are an elite, brutally honest Senior Product Manager at a top-tier tech company. The user will pitch you a software or app idea. Your job is to analyze it, refine it, and generate a structured PRD.

Format your response strictly using markdown headers:

### 1. The Executive Verdict
Rate the idea out of 10. Be honest. Tell them if it exists (name competitors) and what their unique differentiator MUST be to survive.

### 2. Target Audience & Personas
Define exactly who will use this and why they care.

### 3. Feature Breakdown (Keep, Add, Kill)
- KEEP: The best features they mentioned.
- ADD: 2 brilliant feature ideas they didn't think of that will make the app stand out.
- KILL: Tell them what to avoid building in V1 (prevent scope creep).

### 4. Core User Flow
A step-by-step bulleted list of the primary happy path.

### 5. Monetization Strategy
Realistic ways to make money from this product.`;

export const generatePRD = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        idea: z.string().trim().min(10).max(8000),
        model: z.string().trim().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const gatewayModel = MODEL_MAP[data.model] ?? "google/gemini-2.5-pro";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: gatewayModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: data.idea },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Rate limited — please retry shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
      console.error(`AI gateway error ${res.status}: ${txt}`);
      throw new Error("AI generation failed. Please try again.");
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const markdown = json.choices?.[0]?.message?.content ?? "";
    return { markdown, modelUsed: data.model };
  });
