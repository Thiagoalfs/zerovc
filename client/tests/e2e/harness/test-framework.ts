/**
 * ZeroVC Opt-in E2EE — Dual-Track E2E Test Framework
 *
 * Provides structured test execution, assertions, timing, and leak auditing.
 * Zero external assertion dependencies; 100% genuine assertions.
 */

export interface TestResult {
  suiteName: string;
  testName: string;
  tier: 1 | 2 | 3 | 4;
  featureId?: number;
  featureName?: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  assertionsCount: number;
}

export interface SuiteResult {
  name: string;
  tier: 1 | 2 | 3 | 4;
  tests: TestResult[];
}

export class TestHarness {
  private suites: SuiteResult[] = [];
  private currentSuite: SuiteResult | null = null;
  private currentTestAssertions = 0;
  private totalAssertions = 0;
  private leakedStrings: string[] = [];

  // ANSI Colors
  static readonly GREEN = '\x1b[32m';
  static readonly RED = '\x1b[31m';
  static readonly CYAN = '\x1b[36m';
  static readonly YELLOW = '\x1b[33m';
  static readonly MAGENTA = '\x1b[35m';
  static readonly BOLD = '\x1b[1m';
  static readonly RESET = '\x1b[0m';

  startSuite(name: string, tier: 1 | 2 | 3 | 4) {
    this.currentSuite = { name, tier, tests: [] };
    this.suites.push(this.currentSuite);
    console.log(`\n${TestHarness.BOLD}${TestHarness.CYAN}--- [Tier ${tier}] ${name} ---${TestHarness.RESET}`);
  }

  async runTest(
    name: string,
    tierOrFn: (1 | 2 | 3 | 4) | (() => Promise<void> | void),
    maybeFn?: (() => Promise<void> | void) | { featureId?: number; featureName?: string },
    maybeMeta?: { featureId?: number; featureName?: string }
  ): Promise<boolean> {
    let tier: 1 | 2 | 3 | 4;
    let fn: () => Promise<void> | void;
    let meta: { featureId?: number; featureName?: string } | undefined;

    if (typeof tierOrFn === 'function') {
      tier = this.currentSuite?.tier || 1;
      fn = tierOrFn;
      meta = maybeFn as any;
    } else {
      tier = tierOrFn;
      fn = maybeFn as any;
      meta = maybeMeta;
    }

    if (!this.currentSuite) {
      this.startSuite('Default Suite', tier);
    }

    this.currentTestAssertions = 0;
    const start = performance.now();
    let passed = false;
    let errorMsg: string | undefined;

    try {
      await fn();
      passed = true;
      const duration = performance.now() - start;
      this.currentSuite!.tests.push({
        suiteName: this.currentSuite!.name,
        testName: name,
        tier,
        featureId: meta?.featureId,
        featureName: meta?.featureName,
        passed: true,
        durationMs: duration,
        assertionsCount: this.currentTestAssertions,
      });
      console.log(`  ${TestHarness.GREEN}✓${TestHarness.RESET} ${name} ${TestHarness.CYAN}(${duration.toFixed(1)}ms, ${this.currentTestAssertions} asserts)${TestHarness.RESET}`);
    } catch (err: any) {
      const duration = performance.now() - start;
      errorMsg = err?.stack || err?.message || String(err);
      this.currentSuite!.tests.push({
        suiteName: this.currentSuite!.name,
        testName: name,
        tier,
        featureId: meta?.featureId,
        featureName: meta?.featureName,
        passed: false,
        durationMs: duration,
        error: errorMsg,
        assertionsCount: this.currentTestAssertions,
      });
      console.log(`  ${TestHarness.RED}✗${TestHarness.RESET} ${name} ${TestHarness.CYAN}(${duration.toFixed(1)}ms)${TestHarness.RESET}`);
      console.log(`    ${TestHarness.RED}Error: ${errorMsg}${TestHarness.RESET}`);
    }

    return passed;
  }

  // --- Assertions ---
  assert(condition: boolean, message: string): void {
    this.currentTestAssertions++;
    this.totalAssertions++;
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  assertEqual<T>(actual: T, expected: T, message: string): void {
    this.currentTestAssertions++;
    this.totalAssertions++;
    if (actual !== expected) {
      throw new Error(
        `Assertion failed: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
      );
    }
  }

  assertNotEqual<T>(actual: T, expected: T, message: string): void {
    this.currentTestAssertions++;
    this.totalAssertions++;
    if (actual === expected) {
      throw new Error(`Assertion failed: ${message}\n  Expected values to differ, both are: ${JSON.stringify(actual)}`);
    }
  }

  assertDeepEqual<T>(actual: T, expected: T, message: string): void {
    this.currentTestAssertions++;
    this.totalAssertions++;
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(
        `Assertion failed: ${message}\n  Expected deep equality:\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}`
      );
    }
  }

  assertThrows(fn: () => void, expectedSubstr?: string, message?: string): void {
    this.currentTestAssertions++;
    this.totalAssertions++;
    let threw = false;
    let caughtErr: any = null;
    try {
      fn();
    } catch (err) {
      threw = true;
      caughtErr = err;
    }

    if (!threw) {
      throw new Error(`Assertion failed: Expected function to throw error, but it succeeded. ${message || ''}`);
    }

    if (expectedSubstr && caughtErr) {
      const errText = String(caughtErr.message || caughtErr);
      if (!errText.includes(expectedSubstr)) {
        throw new Error(
          `Assertion failed: Expected error to include "${expectedSubstr}", got "${errText}". ${message || ''}`
        );
      }
    }
  }

  async assertRejects(fn: () => Promise<any>, expectedSubstr?: string, message?: string): Promise<void> {
    this.currentTestAssertions++;
    this.totalAssertions++;
    let threw = false;
    let caughtErr: any = null;
    try {
      await fn();
    } catch (err) {
      threw = true;
      caughtErr = err;
    }

    if (!threw) {
      throw new Error(`Assertion failed: Expected async operation to reject, but it succeeded. ${message || ''}`);
    }

    if (expectedSubstr && caughtErr) {
      const errText = String(caughtErr.message || caughtErr);
      if (!errText.includes(expectedSubstr)) {
        throw new Error(
          `Assertion failed: Expected rejection to include "${expectedSubstr}", got "${errText}". ${message || ''}`
        );
      }
    }
  }

  assertIncludes(actual: string, expectedSubstr: string, message: string): void {
    this.currentTestAssertions++;
    this.totalAssertions++;
    if (!actual.includes(expectedSubstr)) {
      throw new Error(`Assertion failed: ${message}\n  Expected "${actual}" to include "${expectedSubstr}"`);
    }
  }

  assertMatches(actual: string, regex: RegExp, message: string): void {
    this.currentTestAssertions++;
    this.totalAssertions++;
    if (!regex.test(actual)) {
      throw new Error(`Assertion failed: ${message}\n  Expected "${actual}" to match regex ${regex}`);
    }
  }

  registerSecretForLeakAudit(secret: string): void {
    if (secret && secret.length > 8) {
      this.leakedStrings.push(secret);
    }
  }

  verifyZeroLeaks(loggedOutput: string): boolean {
    for (const secret of this.leakedStrings) {
      if (loggedOutput.includes(secret)) {
        throw new Error(`CRITICAL SECURITY AUDIT FAILED: Secret leaked in output: ${secret.slice(0, 4)}...`);
      }
    }
    return true;
  }

  getResults(): {
    suites: SuiteResult[];
    totalTests: number;
    totalPassed: number;
    totalFailed: number;
    totalAssertions: number;
    tierCounts: Record<1 | 2 | 3 | 4, { total: number; passed: number; failed: number }>;
    featureCoverage: Record<number, number>;
  } {
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    const tierCounts: Record<1 | 2 | 3 | 4, { total: number; passed: number; failed: number }> = {
      1: { total: 0, passed: 0, failed: 0 },
      2: { total: 0, passed: 0, failed: 0 },
      3: { total: 0, passed: 0, failed: 0 },
      4: { total: 0, passed: 0, failed: 0 },
    };
    const featureCoverage: Record<number, number> = {};

    for (const s of this.suites) {
      for (const t of s.tests) {
        totalTests++;
        tierCounts[t.tier].total++;
        if (t.passed) {
          totalPassed++;
          tierCounts[t.tier].passed++;
        } else {
          totalFailed++;
          tierCounts[t.tier].failed++;
        }

        if (t.featureId) {
          featureCoverage[t.featureId] = (featureCoverage[t.featureId] || 0) + 1;
        }
      }
    }

    return {
      suites: this.suites,
      totalTests,
      totalPassed,
      totalFailed,
      totalAssertions: this.totalAssertions,
      tierCounts,
      featureCoverage,
    };
  }
}

export const harness = new TestHarness();
