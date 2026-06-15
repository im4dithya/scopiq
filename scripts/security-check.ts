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

const BLOCKING_SCANNERS = ["connector_security_scan", "agent_security"];
const BLOCKING_LEVELS = new Set(["high", "critical", "error"]);
const RESULTS_FILE = "security-scan-results.json";

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

    hasBlocking = true;
    console.error(`\n✖ ${scannerName}: ${findings.length} finding(s)`);
    for (const f of findings) {
      console.error(
        `   [${f.level ?? "unknown"}] ${f.internal_id}: ${f.title ?? "Untitled"}`
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
    const strict = process.env.SECURITY_STRICT !== "false";
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
