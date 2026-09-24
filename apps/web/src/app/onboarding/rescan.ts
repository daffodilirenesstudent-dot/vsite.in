// Whether "Continue" on the setup step must scan the photos again.
//
// Going Back from Bestsellers lands on setup, and "Continue" there used to
// re-scan every photo. With AI page limits that charges the store's 15 pages a
// second time for dishes already read. Same photos + dishes in hand = no scan.

/** Identifies the exact set and order of photos picked. */
export function photoKey(photos: ReadonlyArray<{ id: string }>): string {
  return photos.map(p => p.id).join('|');
}

export function needsRescan(s: { photoKey: string; lastScannedKey: string | null; itemCount: number }): boolean {
  return s.itemCount === 0 || s.lastScannedKey === null || s.photoKey !== s.lastScannedKey;
}
