import { describe, expect, it } from 'vitest';
import {
  AUTO_SYNC_MS,
  shouldPushRanchSnapshot,
  shouldSkipIdleRanchSync,
} from './ranchIdle';

describe('idle ranch sync', () => {
  const ranchSyncedAt = '2026-09-09T17:00:00.000Z';
  const nowMs = Date.parse(ranchSyncedAt) + 8_000;

  it('does not auto-copy every few seconds', () => {
    expect(AUTO_SYNC_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('skips a background copy when the herd just synced and nothing is pending', () => {
    expect(
      shouldSkipIdleRanchSync({
        force: false,
        pendingCount: 0,
        ranchSyncedAt,
        nowMs,
      }),
    ).toBe(true);
  });

  it('still copies when you tap Sync, when rows are pending, or after a long idle', () => {
    expect(
      shouldSkipIdleRanchSync({
        force: true,
        pendingCount: 0,
        ranchSyncedAt,
        nowMs,
      }),
    ).toBe(false);
    expect(
      shouldSkipIdleRanchSync({
        force: false,
        pendingCount: 3,
        ranchSyncedAt,
        nowMs,
      }),
    ).toBe(false);
    expect(
      shouldSkipIdleRanchSync({
        force: false,
        pendingCount: 0,
        ranchSyncedAt,
        nowMs: Date.parse(ranchSyncedAt) + 180_000,
      }),
    ).toBe(false);
  });

  it('does not POST the whole ranch when this phone has no new rows', () => {
    expect(shouldPushRanchSnapshot(0)).toBe(false);
    expect(shouldPushRanchSnapshot(1)).toBe(true);
  });
});
