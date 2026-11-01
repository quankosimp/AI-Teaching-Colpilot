/** Storage keys are server-side capabilities; clients receive scoped signed URLs. */
export function publicSubmission<T extends { storageKey: string | null }>(
  row: T,
): Omit<T, "storageKey"> {
  const { storageKey: _storageKey, ...safe } = row;
  return safe;
}
