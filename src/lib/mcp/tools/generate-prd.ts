import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { generatePRD } from "@/lib/api/copm.functions";

export default defineTool({
  name: "generate_prd",
  title: "Generate PRD & product strategy",
  description:
    "Pitch an app or software idea and get a brutally honest PRD in markdown: verdict, personas, keep/add/kill feature breakdown, core user flow, and monetization strategy.",
  inputSchema: {
    idea: z
      .string()
      .trim()
      .min(10)
      .max(8000)
      .describe("The product or app idea to analyze, in a sentence or a few paragraphs."),
    model: z
      .enum(["claude-3-5-sonnet", "gemini-1-5-pro", "llama-3-1-70b"])
      .default("gemini-1-5-pro")
      .describe("Which AI brain to route the analysis through."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async ({ idea, model }) => {
    const result = await generatePRD({ data: { idea, model } });
    return {
      content: [{ type: "text" as const, text: result.markdown }],
      structuredContent: { markdown: result.markdown, modelUsed: result.modelUsed },
    };
  },
});
