export function mergeFeed<T extends { id: string | number; createdAt: number }>(current: T[], next: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of [...current, ...next]) merged.set(String(item.id), item);
  return [...merged.values()];
}
