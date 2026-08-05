import { defineMcp } from "@lovable.dev/mcp-js";
import generatePrdTool from "./tools/generate-prd";
import generateTeardownTool from "./tools/generate-teardown";

export default defineMcp({
  name: "teardown-canvas",
  title: "Teardown Canvas",
  version: "0.1.0",
  instructions:
    "Product strategy tools. Use `generate_teardown` to produce a LinkedIn-style product teardown of a real app or website, and `generate_prd` to turn a raw product idea into a structured PRD with competitor analysis and feature critique.",
  tools: [generateTeardownTool, generatePrdTool],
});
