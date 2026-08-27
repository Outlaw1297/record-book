export type CloudSyncRole = 'off' | 'backup' | 'book';

/** Ranch Postgres is the book. Drive/Dropbox is a spare copy unless the ranch is down. */
export function cloudSyncRole(ranchOk: boolean, hasCloud: boolean): CloudSyncRole {
  if (!hasCloud) return 'off';
  return ranchOk ? 'backup' : 'book';
}
