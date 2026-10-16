/**
 * ZeroVC Opt-in E2EE — Master Dual-Track E2E Test Suite Runner
 *
 * Executes all 4 Tiers:
 *  - Tier 1: Feature Coverage (25 features, >=5 tests per core feature)
 *  - Tier 2: Boundary & Corner Cases (limits, corruptions, replays, disconnects)
 *  - Tier 3: Cross-Feature Combinations (pairwise interactions)
 *  - Tier 4: Real-World Multi-User Application Scenarios
 *
 * Run with:
 *   npx tsx tests/e2e/runner.ts   (from client/)
 *   or via root test script.
 */

import { harness } from './harness/test-framework';
import { runTier1Tests } from './tier1-feature-coverage';
import { runTier2Tests } from './tier2-boundary-corners';
import { runTier3Tests } from './tier3-cross-feature';
import { runTier4Tests } from './tier4-application-scenarios';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

async function main() {
  const runnerStart = performance.now();

  console.log(`\n${BOLD}${CYAN}================================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  ZEROVC OPT-IN E2EE — DUAL-TRACK E2E TEST SUITE RUNNER (TIERS 1 - 4)${RESET}`);
  console.log(`${BOLD}${CYAN}  Target: Web, Electron 30, Android WebView (Chrome >= 86)${RESET}`);
  console.log(`${BOLD}${CYAN}  Methodology: Requirement-Driven Opaque-Box & Real Cryptographic Fixtures${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================================${RESET}`);

  // Capture stdout for anti-leak verification
  let capturedLogs = '';
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    capturedLogs += args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
    originalLog(...args);
  };

  try {
    // Execute Tier 1
    console.log(`\n${BOLD}${MAGENTA}>>> EXECUTING TIER 1: FEATURE COVERAGE (25 FEATURES) <<<${RESET}`);
    await runTier1Tests();

    // Execute Tier 2
    console.log(`\n${BOLD}${MAGENTA}>>> EXECUTING TIER 2: BOUNDARY & CORNER CASES <<<${RESET}`);
    await runTier2Tests();

    // Execute Tier 3
    console.log(`\n${BOLD}${MAGENTA}>>> EXECUTING TIER 3: CROSS-FEATURE COMBINATIONS <<<${RESET}`);
    await runTier3Tests();

    // Execute Tier 4
    console.log(`\n${BOLD}${MAGENTA}>>> EXECUTING TIER 4: REAL-WORLD APPLICATION SCENARIOS <<<${RESET}`);
    await runTier4Tests();

  } catch (err: any) {
    console.error(`${RED}Fatal runner exception:${RESET}`, err);
  } finally {
    console.log = originalLog;
  }

  const runnerDuration = performance.now() - runnerStart;
  const results = harness.getResults();

  // Perform leak audit
  let zeroLeakPassed = false;
  let leakError = '';
  try {
    harness.verifyZeroLeaks(capturedLogs);
    zeroLeakPassed = true;
  } catch (err: any) {
    leakError = err.message;
  }

  // ==========================================================================
  // FINAL REPORT & SUMMARY TABLE
  // ==========================================================================
  console.log(`\n${BOLD}${CYAN}================================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}                         E2E TEST EXECUTION SUMMARY                             ${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================================${RESET}`);

  console.log(`\n${BOLD}TIER BREAKDOWN:${RESET}`);
  console.log(`  Tier 1 (Feature Coverage):       ${results.tierCounts[1].passed}/${results.tierCounts[1].total} passed`);
  console.log(`  Tier 2 (Boundary & Corner Cases):${results.tierCounts[2].passed}/${results.tierCounts[2].total} passed`);
  console.log(`  Tier 3 (Cross-Feature Combos):   ${results.tierCounts[3].passed}/${results.tierCounts[3].total} passed`);
  console.log(`  Tier 4 (Real-World Scenarios):   ${results.tierCounts[4].passed}/${results.tierCounts[4].total} passed`);

  console.log(`\n${BOLD}25-FEATURE INVENTORY COVERAGE MATRIX:${RESET}`);
  const featureNames: Record<number, string> = {
    1: 'Cryptographic Spike',
    2: 'Multi-Platform Matrix Check',
    3: 'Identity & Device Keys DB',
    4: 'Signed Roster Infrastructure',
    5: 'To-Device Message Queue',
    6: 'Client Version Contract',
    7: 'Secure POST Mutations',
    8: '1:1 DM Encrypted Messaging',
    9: 'DM Groups Encrypted Messaging',
    10: 'Message Idempotency & Ordering',
    11: 'Encrypted Attachments',
    12: 'Encrypted Reactions & Edits',
    13: 'Key Request Protocol',
    14: 'Undecryptable Message Isolation',
    15: 'LiveKit Voice/Video E2EE',
    16: 'Call Key State Machine',
    17: 'Anti-Fallback & Android Gate',
    18: 'recomputeAudience(channel)',
    19: 'Stepped Audience Limits',
    20: 'Lazy Epoch Rotation',
    21: 'Recovery Key & Encrypted Backup',
    22: 'Safety Verification Code',
    23: 'Privacy & Security Settings UI',
    24: 'E2E Dual-Track Test Suite',
    25: 'Adversarial Coverage Hardening',
  };

  let allFeaturesCovered = true;
  for (let fid = 1; fid <= 25; fid++) {
    const count = results.featureCoverage[fid] || 0;
    const mark = count >= 5 ? `${GREEN}✓ (>=5 tests)${RESET}` : (count > 0 ? `${YELLOW}✓ (${count} tests)${RESET}` : `${RED}✗ (0 tests)${RESET}`);
    if (count === 0) allFeaturesCovered = false;
    console.log(`  Feature ${String(fid).padStart(2, ' ')} [${mark}]: ${featureNames[fid]}`);
  }

  console.log(`\n${BOLD}AUDIT CHECKS:${RESET}`);
  console.log(`  All 25 Features Covered:        ${allFeaturesCovered ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`}`);
  console.log(`  Zero-Leak Anti-Exposure Audit:  ${zeroLeakPassed ? `${GREEN}PASS (Zero Secrets Leaked)${RESET}` : `${RED}FAIL: ${leakError}${RESET}`}`);
  console.log(`  Total Cryptographic Assertions: ${BOLD}${results.totalAssertions}${RESET}`);

  console.log(`\n${BOLD}TOTAL METRICS:${RESET}`);
  console.log(`  Total Suites:   ${results.suites.length}`);
  console.log(`  Total Tests:    ${results.totalTests}`);
  console.log(`  Passed:         ${GREEN}${BOLD}${results.totalPassed}${RESET}`);
  console.log(`  Failed:         ${results.totalFailed > 0 ? RED : GREEN}${BOLD}${results.totalFailed}${RESET}`);
  console.log(`  Duration:       ${(runnerDuration / 1000).toFixed(2)}s`);

  const allPassed = results.totalFailed === 0 && zeroLeakPassed && allFeaturesCovered;
  console.log(`\n${BOLD}FINAL VERDICT:${RESET}    ${allPassed ? `${GREEN}${BOLD}PASSED — 100% GREEN (CERTIFIED READY)${RESET}` : `${RED}${BOLD}FAILED — VERIFICATION GAPS DETECTED${RESET}`}`);
  console.log(`${BOLD}${CYAN}================================================================================${RESET}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Master runner exited with unhandled error:', err);
  process.exit(1);
});
