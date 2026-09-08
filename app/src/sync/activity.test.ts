import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSyncProgress,
  formatSyncLog,
  getSyncLogs,
  getSyncProgress,
  logSyncError,
  logSyncInfo,
  logSyncWarn,
  resetSyncActivity,
  setSyncProgress,
  startProgressClock,
} from './activity';

afterEach(() => {
  resetSyncActivity();
});

describe('sync activity log', () => {
  it('keeps progress and a timestamped log for the status bar', () => {
    setSyncProgress({
      phase: 'ranch',
      current: 12,
      total: 40,
      label: 'Ranch database 12/40 · animals',
    });
    logSyncInfo('POST /v1/sync/snapshot?backup=0 · chunk 12/40 · animals · 250 rows');
    logSyncWarn('HTTP 504 on chunk 12, retrying…');
    logSyncError(
      'HTTP 504 · chunk 12/40 · POST /v1/sync/snapshot?backup=0',
      'Ranch API 504: the NAS timed out writing the herd.',
    );

    expect(getSyncProgress()).toMatchObject({ current: 12, total: 40 });
    const lines = getSyncLogs();
    expect(lines).toHaveLength(3);
    expect(lines[2]?.level).toBe('error');
    expect(formatSyncLog(lines)).toMatch(/504/);
    expect(formatSyncLog(lines)).toMatch(/timed out/i);

    clearSyncProgress();
    expect(getSyncProgress()).toBeNull();
    expect(getSyncLogs()).toHaveLength(3);
  });

  it('ticks the reading label so the bar does not look frozen at 0%', () => {
    vi.useFakeTimers();
    setSyncProgress({
      phase: 'ranch-pull',
      current: 0,
      total: 1,
      label: 'Reading ranch database',
    });
    const stop = startProgressClock('Reading ranch database');
    vi.advanceTimersByTime(1000);
    expect(getSyncProgress()?.label).toBe('Reading ranch database · 1s');
    stop();
    vi.useRealTimers();
  });

  it('caps the ring buffer so a 10k-animal import cannot grow forever', () => {
    for (let i = 0; i < 300; i += 1) {
      logSyncInfo(`row ${i}`);
    }
    const lines = getSyncLogs();
    expect(lines.length).toBe(250);
    expect(lines[0]?.message).toBe('row 50');
    expect(lines[lines.length - 1]?.message).toBe('row 299');
  });
});
