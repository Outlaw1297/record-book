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

export function isSyncOnline(navigatorOnLine: boolean, ranchConfigured: boolean): boolean {
  return navigatorOnLine || ranchConfigured;
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
    return 'Online — this ranch’s database copies by itself on your Wi-Fi.';
  }
  if (pendingCount > 0) {
    return `${pendingCount} change(s) on this phone. Choose this ranch’s folder, or set this ranch’s API if you run a server.`;
  }
  return 'Online — choose this ranch’s folder, or set this ranch’s API if you run a server';
}

export function noSharedBookDetail(): string {
  return 'Choose a folder in YOUR Drive or Dropbox, or set the API for a Docker server YOU run. Other ranches are not on this book.';
}
