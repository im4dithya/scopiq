import { auth, defineMcp } from "@lovable.dev/mcp-js";
import generatePrdTool from "./tools/generate-prd";
import generateTeardownTool from "./tools/generate-teardown";

// The OAuth issuer must be the direct auth host — the published runtime URL is a
// proxy that mcp-js rejects (RFC 8414 issuer mismatch). The project ref is
// inlined at build time by Vite.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "teardown-canvas",
  title: "Teardown Canvas",
  version: "0.2.0",
  instructions:
    "Product strategy tools for the signed-in Teardown Canvas user. Use `generate_teardown` to produce a LinkedIn-style product teardown of a real app or website, and `generate_prd` to turn a raw product idea into a structured PRD with competitor analysis and feature critique.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [generateTeardownTool, generatePrdTool],
});
