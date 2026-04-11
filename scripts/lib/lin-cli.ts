/**
 * Optional integration with the `lin` Rust CLI binary (aaronkwhite/linear-cli).
 *
 * Provides a fast-path for common Linear operations when `lin` is installed.
 * All functions fall back silently to SDK when `lin` is unavailable or fails.
 *
 * Key design decisions:
 * - Uses async execFile (not execFileSync) to avoid blocking the event loop
 * - Detection cached per process via module-scoped variable
 * - Circuit-breaker skips lin after repeated failures
 * - LINEAR_USE_LIN=0 kill switch disables lin entirely
 * - Never passes API key as CLI argument (env var only)
 *
 * Sunset policy: Remove this integration if aaronkwhite/linear-cli has
 * no release for 90 days from integration date (2026-04-11).
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

// ============================================================================
// Types
// ============================================================================

export interface LinCliInfo {
  available: boolean;
  path?: string;
  version?: string;
  meetsMinVersion: boolean;
}

export interface LinCliResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  exitCode: number;
}

export interface LinUser {
  id: string;
  name: string;
  email: string;
}

export interface LinIssue {
  id: string;
  identifier: string;
  title: string;
  state?: string;
  priority?: number;
}

export interface LinInitiative {
  id: string;
  name: string;
  status?: string;
  url?: string;
}

export interface IssueFilters {
  team?: string;
  state?: string;
  label?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum lin version required. CalVer: YYYY.M.PATCH */
const MIN_LIN_VERSION = '2026.4.0';

/** Max consecutive failures before circuit-breaker trips */
const MAX_FAILURES = 3;

/** Default timeout for lin commands (ms) */
const DEFAULT_TIMEOUT_MS = 10_000;

// ============================================================================
// Module state (cached per process)
// ============================================================================

let _cachedDetection: LinCliInfo | null = null;
let _failureCount = 0;

// ============================================================================
// Detection
// ============================================================================

/**
 * Detect whether the `lin` CLI is installed and meets version requirements.
 * Result is cached for the process lifetime.
 */
export async function detectLinCli(): Promise<LinCliInfo> {
  if (_cachedDetection) return _cachedDetection;

  // Kill switch
  if (process.env.LINEAR_USE_LIN === '0') {
    _cachedDetection = { available: false, meetsMinVersion: false };
    return _cachedDetection;
  }

  try {
    const { stdout } = await execFile('lin', ['--version'], { timeout: 5000 });
    const version = parseLinVersion(stdout);

    const meetsMin = compareVersions(version, MIN_LIN_VERSION) >= 0;
    _cachedDetection = {
      available: meetsMin,
      version,
      meetsMinVersion: meetsMin,
    };
  } catch {
    _cachedDetection = { available: false, meetsMinVersion: false };
  }

  return _cachedDetection;
}

/**
 * Quick check: is lin available and meets minimum version?
 * Cached after first call.
 */
export async function isLinCliAvailable(): Promise<boolean> {
  if (_failureCount >= MAX_FAILURES) return false;
  const info = await detectLinCli();
  return info.available;
}

/** Reset detection cache (for testing) */
export function _resetDetectionCache(): void {
  _cachedDetection = null;
  _failureCount = 0;
}

// ============================================================================
// Execution
// ============================================================================

/**
 * Execute a `lin` command with --json output.
 * Increments failure counter on error; circuit-breaker trips after MAX_FAILURES.
 */
export async function execLin<T = unknown>(
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<LinCliResult<T>> {
  // Circuit-breaker
  if (_failureCount >= MAX_FAILURES) {
    return { success: false, error: 'circuit-breaker: too many failures', exitCode: -1 };
  }

  try {
    const { stdout } = await execFile('lin', [...args, '--json'], {
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
    });

    try {
      const data = JSON.parse(stdout) as T;
      _failureCount = 0;
      return { success: true, data, exitCode: 0 };
    } catch {
      _failureCount++;
      return { success: false, error: 'invalid JSON response', exitCode: 0 };
    }
  } catch (err) {
    _failureCount++;
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg, exitCode: 1 };
  }
}

// ============================================================================
// tryLin — the key abstraction
// ============================================================================

/**
 * Try a lin command, fall back silently to the provided function.
 *
 * This is the single entry point used by all command handlers.
 * Fallback is invisible to the user — no output about which backend was used.
 */
// Overload: transform returns void (side-effect only, e.g. console output)
export async function tryLin(
  args: string[],
  fallback: () => Promise<void>,
  transform: (data: unknown) => void
): Promise<void>;
// Overload: transform returns T (data transformation)
export async function tryLin<T>(
  args: string[],
  fallback: () => Promise<T>,
  transform?: (data: unknown) => T
): Promise<T>;
export async function tryLin<T>(
  args: string[],
  fallback: () => Promise<T>,
  transform?: (data: unknown) => T | void
): Promise<T> {
  if (!(await isLinCliAvailable())) {
    return fallback();
  }

  const result = await execLin(args);
  if (result.success && result.data !== undefined) {
    if (transform) {
      transform(result.data);
      return undefined as T;
    }
    return result.data as T;
  }

  // Silent fallback
  return fallback();
}

// ============================================================================
// Typed convenience wrappers
// ============================================================================

export async function linUpdateIssueState(
  identifier: string,
  state: string
): Promise<LinCliResult<LinIssue>> {
  return execLin<LinIssue>(['issues', 'update', identifier, '--state', state]);
}

// ============================================================================
// Helpers
// ============================================================================

/** Parse version string from `lin --version` output */
export function parseLinVersion(raw: string): string {
  return raw.trim().replace(/^lin\s+/i, '').replace(/^v/i, '');
}

/**
 * Compare two version strings (semver or calver).
 * Returns: negative if a < b, 0 if equal, positive if a > b.
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const av = aParts[i] || 0;
    const bv = bParts[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
