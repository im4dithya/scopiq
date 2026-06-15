#!/usr/bin/env bun
/**
 * Security gate for CI.
 *
 * Fails the build if any `connector_security_scan` or `agent_security`
 * findings are present.  It tries three strategies in order:
 *
 * 1. Call a Lovable security API endpoint (configure via env vars).
 * 2. Read a committed `security-scan-results.json` file.
 * 3. Print a configuration warning and exit with code 1 (configurable).
 */

import { existsSync, readFileSync } from "fs";

const RESULTS_FILE = "security-scan-results.json";
const POLICY_FILE = process.env.SECURITY_POLICY_FILE ?? "security-policy.json";

interface SecurityPolicy {
  blockingLevels: string[];
  blockingScanners: string[];
  dependencyAuditLevel: string;
  strict: boolean;
}

const DEFAULT_POLICY: SecurityPolicy = {
  blockingLevels: ["high", "critical", "error"],
  blockingScanners: ["connector_security_scan", "agent_security"],
  dependencyAuditLevel: "high",
  strict: true,
};

function parseList(v: string | undefined): string[] | null {
  if (!v) return null;
  return v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function loadPolicy(): SecurityPolicy {
  let p: SecurityPolicy = { ...DEFAULT_POLICY };
  if (existsSync(POLICY_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(POLICY_FILE, "utf-8")) as Partial<SecurityPolicy>;
      p = { ...p, ...raw };
      console.log(`→ Loaded policy from ${POLICY_FILE}`);
    } catch (err) {
      console.warn(`⚠️  Could not parse ${POLICY_FILE}: ${(err as Error).message}`);
    }
  }
  // Env var overrides (workspace/environment-level)
  const lvl = parseList(process.env.SECURITY_BLOCKING_LEVELS);
  if (lvl) p.blockingLevels = lvl;
  const sc = parseList(process.env.SECURITY_BLOCKING_SCANNERS);
  if (sc) p.blockingScanners = sc;
  if (process.env.SECURITY_DEPENDENCY_AUDIT_LEVEL)
    p.dependencyAuditLevel = process.env.SECURITY_DEPENDENCY_AUDIT_LEVEL;
  if (process.env.SECURITY_STRICT != null)
    p.strict = process.env.SECURITY_STRICT !== "false";
  p.blockingLevels = p.blockingLevels.map((s) => s.toLowerCase());
  return p;
}

const POLICY = loadPolicy();
const BLOCKING_SCANNERS = POLICY.blockingScanners;
const BLOCKING_LEVELS = new Set(POLICY.blockingLevels);

interface SecurityFinding {
  internal_id: string;
  scanner_name: string;
  level?: string;
  title?: string;
  description?: string;
}

interface ScanResult {
  findings: SecurityFinding[];
  scanner_name: string;
  timestamp: string;
  up_to_date: boolean;
  version: string;
}

interface ScanResults {
  [key: string]: ScanResult;
}

async function fetchFromApi(): Promise<ScanResults | null> {
  const projectId = process.env.LOVABLE_PROJECT_ID;
  const apiKey = process.env.LOVABLE_API_KEY;
  const customUrl = process.env.LOVABLE_SECURITY_API_URL;

  if (!projectId) {
    console.log("ℹ️  LOVABLE_PROJECT_ID not set — skipping API call.");
    return null;
  }

  // Try a custom endpoint first if the user has configured one.
  if (customUrl) {
    try {
      const url = customUrl.replace("{PROJECT_ID}", projectId);
      console.log(`→ Calling custom security API: ${url}`);
      const res = await fetch(url, {
        headers: {
          ...(apiKey ? { "Lovable-API-Key": apiKey } : {}),
        },
      });
      if (res.ok) {
        return (await res.json()) as ScanResults;
      }
      console.warn(
        `⚠️  Custom API returned ${res.status}: ${await res.text()}`
      );
    } catch (err) {
      console.warn(`⚠️  Custom API call failed: ${(err as Error).message}`);
    }
  }

  // Try the documented public Lovable API shape (may not be available yet).
  try {
    const url = `https://api.lovable.dev/v1/projects/${projectId}/security/scans`;
    console.log(`→ Calling Lovable API: ${url}`);
    const res = await fetch(url, {
      headers: {
        ...(apiKey ? { "Lovable-API-Key": apiKey } : {}),
      },
    });
    if (res.ok) {
      return (await res.json()) as ScanResults;
    }
    if (res.status === 404) {
      console.log(
        "ℹ️  Public Lovable security API not available (404) — expected until officially released."
      );
    } else {
      console.warn(`⚠️  Lovable API returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`⚠️  Lovable API call failed: ${(err as Error).message}`);
  }

  return null;
}

function readFromFile(): ScanResults | null {
  if (!existsSync(RESULTS_FILE)) {
    console.log(`ℹ️  ${RESULTS_FILE} not found — skipping file check.`);
    return null;
  }
  console.log(`→ Reading ${RESULTS_FILE}`);
  try {
    const raw = readFileSync(RESULTS_FILE, "utf-8");
    return JSON.parse(raw) as ScanResults;
  } catch (err) {
    console.error(`✖ Failed to parse ${RESULTS_FILE}: ${(err as Error).message}`);
    process.exit(1);
  }
}

function checkFindings(results: ScanResults): boolean {
  let hasBlocking = false;

  for (const scannerName of BLOCKING_SCANNERS) {
    const result = results[scannerName];
    if (!result) {
      console.log(`ℹ️  No scan result for "${scannerName}"`);
      continue;
    }

    const findings = result.findings ?? [];
    if (findings.length === 0) {
      console.log(`✅ ${scannerName}: clean`);
      continue;
    }

    const blocking = findings.filter((f) =>
      BLOCKING_LEVELS.has((f.level ?? "").toLowerCase()),
    );
    const informational = findings.length - blocking.length;

    if (blocking.length === 0) {
      console.log(
        `✅ ${scannerName}: ${informational} informational finding(s), none high/critical`,
      );
      continue;
    }

    hasBlocking = true;
    console.error(
      `\n✖ ${scannerName}: ${blocking.length} high/critical finding(s)` +
        (informational ? ` (+ ${informational} informational)` : ""),
    );
    for (const f of blocking) {
      console.error(
        `   [${f.level ?? "unknown"}] ${f.internal_id}: ${f.title ?? "Untitled"}`,
      );
      if (f.description) {
        console.error(`   → ${f.description}`);
      }
    }
  }

  return hasBlocking;
}

async function main() {
  console.log("🔒 Security gate check\n");

  let results: ScanResults | null = null;

  // 1. Try API
  results = await fetchFromApi();

  // 2. Fall back to committed results file
  if (!results) {
    results = readFromFile();
  }

  // 3. Nothing available — fail closed unless overridden
  if (!results) {
    const strict = POLICY.strict;
    if (strict) {
      console.error("\n✖ No security scan data available.");
      console.error(
        "   To fix this, either:\n" +
          "   • Set LOVABLE_SECURITY_API_URL (and LOVABLE_API_KEY)\n" +
          `   • Commit a ${RESULTS_FILE} file with latest scan results\n` +
          "   • Set SECURITY_STRICT=false to disable this gate (not recommended)"
      );
      process.exit(1);
    } else {
      console.warn("\n⚠️  SECURITY_STRICT=false — skipping security gate.");
      process.exit(0);
    }
  }

  const hasBlocking = checkFindings(results);

  if (hasBlocking) {
    console.error(
      "\n✖ BLOCKED: security findings from connector_security_scan or agent_security detected.\n" +
        "   Resolve the findings above before merging.\n"
    );
    process.exit(1);
  }

  console.log("\n✅ Security gate passed — no blocking findings.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
