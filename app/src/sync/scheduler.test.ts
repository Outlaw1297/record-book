import { describe, expect, it } from 'vitest';
import { isSyncSchedulerPaused, pauseSyncScheduler, resumeSyncScheduler, scheduleSync } from './scheduler';

describe('sync scheduler pause', () => {
  it('does not queue a ranch copy while a Cow Sense import is saving', () => {
    expect(isSyncSchedulerPaused()).toBe(false);
    pauseSyncScheduler();
    pauseSyncScheduler();
    expect(isSyncSchedulerPaused()).toBe(true);
    scheduleSync(0);
    resumeSyncScheduler();
    expect(isSyncSchedulerPaused()).toBe(true);
    resumeSyncScheduler();
    expect(isSyncSchedulerPaused()).toBe(false);
  });
});
