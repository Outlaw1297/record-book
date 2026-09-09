/** Background copies. A calf save still syncs immediately via scheduleSync. */
export const AUTO_SYNC_MS = 120_000;

/** Skip another ranch round-trip when a copy just finished and the outbox is empty. */
export const IDLE_RANCH_SKIP_MS = 120_000;

export function shouldSkipIdleRanchSync(input: {
  force: boolean;
  pendingCount: number;
  ranchSyncedAt?: string;
  nowMs: number;
  idleMs?: number;
}): boolean {
  if (input.force) return false;
  if (input.pendingCount > 0) return false;
  if (!input.ranchSyncedAt) return false;
  const at = Date.parse(input.ranchSyncedAt);
  if (Number.isNaN(at)) return false;
  return input.nowMs - at < (input.idleMs ?? IDLE_RANCH_SKIP_MS);
}

/** Ranch Postgres already has the herd. Only POST when this phone has unsynced rows. */
export function shouldPushRanchSnapshot(pendingCount: number): boolean {
  return pendingCount > 0;
}
