#!/usr/bin/env node

/**
 * Production Verification Script for Observability Endpoint Fix
 * Tests deterministic <12s response times for both 24h and 7d windows
 */

const http = require("http");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const TIMEOUT_MS = 12000; // Hard timeout: 12s
const ATTEMPTS = 5;

async function testEndpoint(url, timeoutMs) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = setTimeout(() => {
      resolve({
        status: null,
        timeMs: Date.now() - startTime,
        error: "TIMEOUT",
      });
    }, timeoutMs);

    const req = http.get(url, (res) => {
      const status = res.statusCode;
      let body = "";
      
      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        clearTimeout(timeout);
        const timeMs = Date.now() - startTime;
        try {
          const json = JSON.parse(body);
          resolve({
            status,
            timeMs,
            payload: json,
          });
        } catch {
          resolve({
            status,
            timeMs,
            error: "Invalid JSON",
          });
        }
      });
    });

    req.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        status: null,
        timeMs: Date.now() - startTime,
        error: error.message,
      });
    });
  });
}

async function runTests() {
  console.log(`Testing observability endpoint at ${BASE_URL}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms, Attempts: ${ATTEMPTS}\n`);

  const windows = ["24h", "7d"];
  const allResults = {};

  for (const window of windows) {
    console.log(`\n=== Testing window=${window} ===`);
    const results = [];

    for (let i = 1; i <= ATTEMPTS; i++) {
      const url = `${BASE_URL}/api/hermes/observability?window=${window}`;
      console.log(`[Attempt ${i}/${ATTEMPTS}] GET ${url}`);

      const result = await testEndpoint(url, TIMEOUT_MS);
      results.push(result);

      const status = result.status ? `${result.status}` : "TIMEOUT";
      const timeStr = `${result.timeMs.toFixed(0)}ms`;
      const success = result.status === 200 && result.timeMs < TIMEOUT_MS;
      const mark = success ? "✓" : "✗";

      console.log(
        `  ${mark} Status: ${status}, Time: ${timeStr}, Error: ${result.error || "none"}`
      );

      // Show payload structure if successful
      if (success && result.payload) {
        const keys = Object.keys(result.payload);
        console.log(`    Payload keys: ${keys.slice(0, 5).join(", ")}${keys.length > 5 ? "..." : ""}`);
      }

      // Small delay between attempts
      if (i < ATTEMPTS) await new Promise((r) => setTimeout(r, 500));
    }

    allResults[window] = results;

    // Summary for this window
    const successCount = results.filter(
      (r) => r.status === 200 && r.timeMs < TIMEOUT_MS
    ).length;
    const avgTime =
      results.reduce((sum, r) => sum + r.timeMs, 0) / results.length;

    console.log(`\n  Summary: ${successCount}/${ATTEMPTS} success`);
    console.log(`  Average response time: ${avgTime.toFixed(0)}ms`);
    console.log(`  Max response time: ${Math.max(...results.map((r) => r.timeMs)).toFixed(0)}ms`);
  }

  // Overall verification
  console.log(`\n\n=== OVERALL VERIFICATION ===`);

  const windows24h = allResults["24h"];
  const windows7d = allResults["7d"];

  const success24h = windows24h.filter((r) => r.status === 200 && r.timeMs < TIMEOUT_MS).length;
  const success7d = windows7d.filter((r) => r.status === 200 && r.timeMs < TIMEOUT_MS).length;

  console.log(`\nwindow=24h: ${success24h}/${ATTEMPTS} requests ✓`);
  console.log(`window=7d:  ${success7d}/${ATTEMPTS} requests ✓`);

  // Verify /api/runs endpoint
  console.log(`\n\nVerifying /api/runs endpoint...`);
  const runsResult = await testEndpoint(`${BASE_URL}/api/runs`, TIMEOUT_MS);
  
  if (runsResult.status === 200 && runsResult.payload && Array.isArray(runsResult.payload)) {
    console.log(`✓ /api/runs returned 200 with array payload (${runsResult.payload.length} items)`);
    
    // Check for required fields in runs
    if (runsResult.payload.length > 0) {
      const firstRun = runsResult.payload[0];
      const hasLiveController = "liveController" in firstRun;
      const hasTraceRunning = "traceRunning" in firstRun;
      const hasIsStale = "isStale" in firstRun;
      
      console.log(`  - Sample run has liveController: ${hasLiveController}`);
      console.log(`  - Sample run has traceRunning: ${hasTraceRunning}`);
      console.log(`  - Sample run has isStale: ${hasIsStale}`);
    }
  } else {
    console.log(`✗ /api/runs failed: Status ${runsResult.status}, Error: ${runsResult.error}`);
  }

  // Final verdict
  console.log(`\n\n=== FINAL VERDICT ===`);
  const allPass = success24h === ATTEMPTS && success7d === ATTEMPTS;
  
  if (allPass) {
    console.log(`✓ ALL TESTS PASSED`);
    console.log(`  - 24h endpoint: 5/5 ✓`);
    console.log(`  - 7d endpoint: 5/5 ✓`);
    console.log(`  - Both endpoints respond deterministically within 12s`);
    process.exit(0);
  } else {
    console.log(`✗ TESTS FAILED`);
    console.log(`  - 24h: ${success24h}/5`);
    console.log(`  - 7d: ${success7d}/5`);
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
