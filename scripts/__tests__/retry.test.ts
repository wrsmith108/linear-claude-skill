/**
 * Tests for withRetry helper in scripts/lib/retry.ts
 *
 * Run: node --test scripts/__tests__/retry.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  withRetry,
  extractStatusCode,
  extractRetryAfterMs,
  isRetryableStatus,
  computeBackoffMs
} from '../lib/retry.ts';

// Silent sleep — tests never actually wait.
const noSleep = async () => {};
const noLog = () => {};

function makeHttpError(status: number, extra: Record<string, unknown> = {}) {
  const err = new Error(`HTTP ${status}`) as Error & Record<string, unknown>;
  err.status = status;
  Object.assign(err, extra);
  return err;
}

describe('extractStatusCode', () => {
  it('reads status from err.status', () => {
    assert.strictEqual(extractStatusCode({ status: 429 }), 429);
  });

  it('reads status from err.statusCode', () => {
    assert.strictEqual(extractStatusCode({ statusCode: 503 }), 503);
  });

  it('reads status from err.response.status', () => {
    assert.strictEqual(extractStatusCode({ response: { status: 502 } }), 502);
  });

  it('parses status out of message when no field present', () => {
    assert.strictEqual(
      extractStatusCode(new Error('Request failed with 429 Too Many Requests')),
      429
    );
  });

  it('returns undefined for unknown shapes', () => {
    assert.strictEqual(extractStatusCode(new Error('boom')), undefined);
    assert.strictEqual(extractStatusCode(null), undefined);
  });
});

describe('extractRetryAfterMs', () => {
  it('reads numeric seconds from headers', () => {
    assert.strictEqual(
      extractRetryAfterMs({ headers: { 'retry-after': 2 } }),
      2000
    );
  });

  it('reads string seconds from headers', () => {
    assert.strictEqual(
      extractRetryAfterMs({ headers: { 'Retry-After': '3' } }),
      3000
    );
  });

  it('reads retryAfter from response.headers', () => {
    assert.strictEqual(
      extractRetryAfterMs({ response: { headers: { 'retry-after': '1' } } }),
      1000
    );
  });

  it('returns undefined when absent', () => {
    assert.strictEqual(extractRetryAfterMs(new Error('no header')), undefined);
  });
});

describe('isRetryableStatus', () => {
  it('retries on 429 / 502 / 503 / 504', () => {
    for (const c of [429, 502, 503, 504]) {
      assert.strictEqual(isRetryableStatus(c), true, `expected ${c} retryable`);
    }
  });

  it('does not retry on 4xx (non-429) or 5xx non-listed', () => {
    for (const c of [400, 401, 403, 404, 409, 422, 500, 501]) {
      assert.strictEqual(isRetryableStatus(c), false, `expected ${c} non-retryable`);
    }
  });

  it('does not retry when status is undefined', () => {
    assert.strictEqual(isRetryableStatus(undefined), false);
  });
});

describe('computeBackoffMs', () => {
  it('caps at maxDelayMs', () => {
    // rng=1 → full-cap
    const result = computeBackoffMs(10, 500, 2000, () => 0.9999);
    assert.ok(result < 2000, `got ${result}`);
    assert.ok(result >= 1000, `got ${result}`);
  });

  it('uses exponential growth before cap', () => {
    // rng=1 → ceiling, deterministic
    const a0 = computeBackoffMs(0, 500, 10_000, () => 0.9999);
    const a2 = computeBackoffMs(2, 500, 10_000, () => 0.9999);
    assert.ok(a2 > a0, `expected ${a2} > ${a0}`);
  });

  it('returns 0 when rng returns 0', () => {
    assert.strictEqual(computeBackoffMs(3, 500, 10_000, () => 0), 0);
  });
});

describe('withRetry', () => {
  // Preserve and clean up env
  let origDisable: string | undefined;
  beforeEach(() => {
    origDisable = process.env.LINEAR_DISABLE_RETRY;
    delete process.env.LINEAR_DISABLE_RETRY;
  });
  afterEach(() => {
    if (origDisable === undefined) delete process.env.LINEAR_DISABLE_RETRY;
    else process.env.LINEAR_DISABLE_RETRY = origDisable;
  });

  it('returns result on first-try success without retrying', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return 'ok';
      },
      { sleep: noSleep, log: noLog }
    );
    assert.strictEqual(result, 'ok');
    assert.strictEqual(calls, 1);
  });

  it('retries on 429 then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw makeHttpError(429);
        return 'recovered';
      },
      { sleep: noSleep, log: noLog }
    );
    assert.strictEqual(result, 'recovered');
    assert.strictEqual(calls, 2);
  });

  it('retries on 503 then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw makeHttpError(503);
        return 'recovered-after-two';
      },
      { sleep: noSleep, log: noLog }
    );
    assert.strictEqual(calls, 3);
    assert.strictEqual(result, 'recovered-after-two');
  });

  it('throws after maxAttempts of retryable errors', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls++;
          throw makeHttpError(429);
        },
        { maxAttempts: 3, sleep: noSleep, log: noLog }
      ),
      /HTTP 429/
    );
    assert.strictEqual(calls, 3);
  });

  it('does not retry on non-retryable errors', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls++;
          throw makeHttpError(404);
        },
        { sleep: noSleep, log: noLog }
      ),
      /HTTP 404/
    );
    assert.strictEqual(calls, 1);
  });

  it('does not retry when error has no status', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls++;
          throw new Error('plain failure');
        },
        { sleep: noSleep, log: noLog }
      ),
      /plain failure/
    );
    assert.strictEqual(calls, 1);
  });

  it('honors Retry-After header when present', async () => {
    let calls = 0;
    const sleepCalls: number[] = [];
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) {
          throw makeHttpError(429, { headers: { 'retry-after': 2 } });
        }
        return 'ok';
      },
      {
        sleep: async (ms: number) => {
          sleepCalls.push(ms);
        },
        log: noLog
      }
    );
    assert.strictEqual(result, 'ok');
    assert.strictEqual(sleepCalls.length, 1);
    assert.strictEqual(sleepCalls[0], 2000, `expected 2000ms sleep, got ${sleepCalls[0]}`);
  });

  it('Retry-After is capped at maxDelayMs', async () => {
    let calls = 0;
    const sleepCalls: number[] = [];
    await withRetry(
      async () => {
        calls++;
        if (calls === 1) {
          throw makeHttpError(429, { headers: { 'retry-after': 3600 } }); // 1h
        }
        return 'ok';
      },
      {
        maxDelayMs: 5000,
        sleep: async (ms: number) => {
          sleepCalls.push(ms);
        },
        log: noLog
      }
    );
    assert.strictEqual(sleepCalls[0], 5000);
  });

  it('LINEAR_DISABLE_RETRY=1 bypasses retry logic', async () => {
    process.env.LINEAR_DISABLE_RETRY = '1';
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls++;
          throw makeHttpError(429);
        },
        { sleep: noSleep, log: noLog }
      ),
      /HTTP 429/
    );
    assert.strictEqual(calls, 1, 'should not retry when kill switch is set');
  });

  it('emits a log line for each retry attempt', async () => {
    const logs: string[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw makeHttpError(429);
        return 'done';
      },
      {
        sleep: noSleep,
        log: (msg: string) => logs.push(msg)
      }
    );
    assert.strictEqual(logs.length, 2);
    for (const l of logs) {
      assert.match(l, /\[retry:linear\] attempt \d+\/\d+ after \d+ms — 429/);
    }
  });

  it('log message includes custom label', async () => {
    const logs: string[] = [];
    await withRetry(
      async () => {
        throw makeHttpError(503);
      },
      {
        maxAttempts: 2,
        label: 'custom-op',
        sleep: noSleep,
        log: (msg: string) => logs.push(msg)
      }
    ).catch(() => {});
    assert.ok(
      logs[0]?.includes('[retry:custom-op]'),
      `expected custom label in log, got: ${logs[0]}`
    );
  });
});
