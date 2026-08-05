import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { generateTeardown } from "@/lib/api/teardown.functions";

export default defineTool({
  name: "generate_teardown",
  title: "Generate product teardown",
  description:
    "Generate a LinkedIn-style product teardown post about a real product, app, or website, including good/improve insights and (optionally) web-search sources.",
  inputSchema: {
    product: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .describe("Product name or website URL, e.g. 'Spotify' or 'https://linear.app'."),
    focus: z
      .enum(["overall", "onboarding", "retention", "ux", "notifications", "monetization"])
      .default("overall")
      .describe("Which aspect of the product experience to focus the teardown on."),
    notes: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .describe("Optional personal observations to weave into the post."),
    appStoreId: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Optional Apple App Store numeric ID or apps.apple.com URL to pull real reviews."),
    useWebSearch: z
      .boolean()
      .default(true)
      .describe("Ground the teardown with live web search results."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async ({ product, focus, notes, appStoreId, useWebSearch }) => {
    const result = await generateTeardown({
      data: {
        appName: product,
        focus,
        notes: notes ?? "",
        appStoreId: appStoreId ?? "",
        useWebSearch,
      },
    });

    if (result.status === "invalid") {
      return {
        content: [
          {
            type: "text" as const,
            text: result.message ?? "That does not appear to be a real product.",
          },
        ],
        isError: true,
      };
    }

    const insightText = result.insights
      .map((i) => `${i.type.toUpperCase()}: ${i.text}`)
      .join("\n");
    const sourceText = result.sources.length
      ? `\n\nSources:\n${result.sources.map((s) => `- ${s.title} — ${s.url}`).join("\n")}`
      : "";

    return {
      content: [
        {
          type: "text" as const,
          text: `${result.post ?? ""}\n\n---INSIGHTS---\n${insightText}${sourceText}`,
        },
      ],
      structuredContent: {
        post: result.post,
        insights: result.insights,
        sources: result.sources,
      },
    };
  },
});
