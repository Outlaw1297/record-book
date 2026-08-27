export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function noneProviderBanner(opts: {
  pendingCount: number;
  ranchConfigured: boolean;
  ranchSyncedAt?: string;
}): string {
  const { pendingCount, ranchConfigured, ranchSyncedAt } = opts;
  if (ranchConfigured && pendingCount > 0 && !ranchSyncedAt) {
    return `${pendingCount} change(s) copying to the ranch database…`;
  }
  if (ranchConfigured && ranchSyncedAt) {
    const when = formatWhen(ranchSyncedAt);
    return pendingCount > 0
      ? `${pendingCount} change(s) copying to the ranch database…`
      : `Online — ranch database last synced ${when}`;
  }
  if (ranchConfigured) {
    return 'Online — ranch database is the shared book. Copies on Wi-Fi.';
  }
  if (pendingCount > 0) {
    return `${pendingCount} change(s) on this phone. Open Settings on ranch Wi-Fi.`;
  }
  return 'Online — set the ranch API in Settings';
}
