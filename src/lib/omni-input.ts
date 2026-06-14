// Smart parser for the single "omni" product input. Detects whether the
// user pasted an Apple App Store link, a generic website URL, or a plain
// product name, and returns a normalized shape the rest of the app can use.

export type OmniInputType = "appstore" | "website" | "text";

export type OmniInputResult = {
  type: OmniInputType;
  cleanedName: string;
  appStoreId: string;
  originalUrl: string;
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function nameFromHost(host: string): string {
  const core = host.replace(/^www\./i, "").split(".")[0] ?? host;
  return capitalize(core);
}

export function analyzeOmniInput(rawInput: string): OmniInputResult {
  const raw = (rawInput ?? "").trim();
  if (!raw) {
    return { type: "text", cleanedName: "", appStoreId: "", originalUrl: "" };
  }

  // Condition A — Apple App Store link
  if (/apps\.apple\.com/i.test(raw)) {
    const idMatch = raw.match(/\/id(\d{6,12})/i);
    if (idMatch) {
      // Try to recover the app slug from the URL path, e.g.
      // https://apps.apple.com/us/app/spotify-music-and-podcasts/id324684580
      let cleanedName = "App";
      try {
        const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        const u = new URL(withProto);
        const parts = u.pathname.split("/").filter(Boolean);
        const appIdx = parts.indexOf("app");
        const slug = appIdx >= 0 ? parts[appIdx + 1] : undefined;
        if (slug) {
          const words = slug
            .split("-")
            .filter((w) => w && !/^id\d+$/i.test(w))
            .map(capitalize);
          if (words.length) cleanedName = words.slice(0, 4).join(" ");
        }
      } catch {
        // ignore — keep fallback name
      }
      return {
        type: "appstore",
        cleanedName,
        appStoreId: idMatch[1],
        originalUrl: raw,
      };
    }
    // App Store link but no recoverable ID → gracefully fall through to
    // treating it as a website link.
  }

  // Condition B — Website URL
  const looksLikeUrl =
    /^https?:\/\//i.test(raw) ||
    /^www\./i.test(raw) ||
    /\.(com|app|io|co|net|org|dev|ai|xyz)(\/|$)/i.test(raw);
  if (looksLikeUrl) {
    try {
      const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const u = new URL(withProto);
      return {
        type: "website",
        cleanedName: nameFromHost(u.hostname),
        appStoreId: "",
        originalUrl: withProto,
      };
    } catch {
      // fall through to text
    }
  }

  // Condition C — plain text product name
  return { type: "text", cleanedName: raw, appStoreId: "", originalUrl: "" };
}
