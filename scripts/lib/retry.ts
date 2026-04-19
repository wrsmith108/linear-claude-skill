/**
 * Retry helper for transient Linear API failures.
 *
 * Wraps an async function with exponential backoff + jitter for 429 and 5xx
 * responses. Everything else re-throws immediately so real bugs aren't masked.
 *
 * Kill switch: LINEAR_DISABLE_RETRY=1 disables all retrying.
 */

export interface RetryOptions {
  /** Max attempts including the first call. Default 4. */
  maxAttempts?: number
  /** Initial backoff in ms. Default 500. */
  baseDelayMs?: number
  /** Cap on a single backoff delay in ms. Default 8000. */
  maxDelayMs?: number
  /** Label used in log output. Default 'linear'. */
  label?: string
  /** Injectable sleep for tests. Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>
  /** Injectable logger. Defaults to console.warn. */
  log?: (msg: string) => void
}

const DEFAULTS = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  label: 'linear'
}

const defaultSleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Extract an HTTP-like status code from an SDK or fetch error. Returns
 * undefined if none can be found — callers treat that as non-retryable.
 */
export function extractStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as Record<string, unknown>

  for (const key of ['status', 'statusCode']) {
    const v = e[key]
    if (typeof v === 'number') return v
  }

  const resp = e.response
  if (resp && typeof resp === 'object') {
    const v = (resp as Record<string, unknown>).status
    if (typeof v === 'number') return v
  }

  const msg = typeof e.message === 'string' ? e.message : ''
  const m = msg.match(/\b(429|500|502|503|504)\b/)
  if (m) return Number(m[1])

  return undefined
}

/**
 * Extract a Retry-After delay (ms) from an error, if the server sent one.
 * Supports both numeric seconds and HTTP-date values.
 */
export function extractRetryAfterMs(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as Record<string, unknown>

  const headers =
    (e.headers as Record<string, unknown> | undefined) ??
    ((e.response as Record<string, unknown> | undefined)?.headers as
      | Record<string, unknown>
      | undefined)

  const raw =
    (headers && (headers['retry-after'] ?? headers['Retry-After'])) ??
    e.retryAfter ??
    e['retry-after']

  if (raw == null) return undefined

  if (typeof raw === 'number') return Math.max(0, raw * 1000)

  if (typeof raw === 'string') {
    const asNum = Number(raw)
    if (!Number.isNaN(asNum)) return Math.max(0, asNum * 1000)
    const asDate = Date.parse(raw)
    if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now())
  }

  return undefined
}

export function isRetryableStatus(code: number | undefined): boolean {
  if (code === undefined) return false
  return code === 429 || code === 502 || code === 503 || code === 504
}

export function isRetryDisabled(): boolean {
  return process.env.LINEAR_DISABLE_RETRY === '1'
}

/**
 * Compute backoff with full jitter: random in [0, min(maxDelay, base * 2^n)].
 */
export function computeBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  rng: () => number = Math.random
): number {
  const exp = baseDelayMs * Math.pow(2, attempt)
  const capped = Math.min(maxDelayMs, exp)
  return Math.floor(rng() * capped)
}

/**
 * Run `fn`, retrying on 429 / 5xx. Non-retryable errors bubble up immediately.
 *
 * @example
 *   const labels = await withRetry(() => client.issueLabels(), { label: 'labels' })
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  if (isRetryDisabled()) {
    return fn()
  }

  const maxAttempts = opts.maxAttempts ?? DEFAULTS.maxAttempts
  const baseDelayMs = opts.baseDelayMs ?? DEFAULTS.baseDelayMs
  const maxDelayMs = opts.maxDelayMs ?? DEFAULTS.maxDelayMs
  const label = opts.label ?? DEFAULTS.label
  const sleep = opts.sleep ?? defaultSleep
  const log = opts.log ?? ((msg: string) => console.warn(msg))

  let lastErr: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const status = extractStatusCode(err)
      const isLast = attempt === maxAttempts - 1

      if (!isRetryableStatus(status) || isLast) {
        throw err
      }

      const retryAfter = extractRetryAfterMs(err)
      const backoff =
        retryAfter !== undefined
          ? Math.min(retryAfter, maxDelayMs)
          : computeBackoffMs(attempt, baseDelayMs, maxDelayMs)

      log(
        `[retry:${label}] attempt ${attempt + 1}/${maxAttempts} after ${backoff}ms — ${status}${
          retryAfter !== undefined ? ' (Retry-After honored)' : ''
        }`
      )

      await sleep(backoff)
    }
  }

  throw lastErr
}
