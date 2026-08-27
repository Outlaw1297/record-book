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
  if (ranchConfigured && ranchSyncedAt) {
    const when = formatWhen(ranchSyncedAt);
    return pendingCount > 0
      ? `Ranch database copied ${when}. Connect Drive or Dropbox to share phones.`
      : `Online — ranch database last copied ${when}`;
  }
  if (ranchConfigured && pendingCount > 0) {
    return `${pendingCount} change(s) copying to the ranch database…`;
  }
  if (ranchConfigured) {
    return 'Online — copies to the ranch database on Wi-Fi. Connect Drive or Dropbox to share phones.';
  }
  if (pendingCount > 0) {
    return `${pendingCount} change(s) on this phone. Connect Drive or Dropbox in Settings to share them.`;
  }
  return 'Online — connect Drive or Dropbox in Settings';
}
