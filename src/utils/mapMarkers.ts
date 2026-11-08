export type PointMarker = { id: string | number; lat: number; lng: number; kind: string };
/** One visual point, all original records; coordinates are never altered. */
export function groupMarkers<T extends PointMarker>(markers: T[]): T[][] {
  const groups = new Map<string, T[]>(), seen = new Set<string>();
  for (const marker of markers) {
    const identity = `${marker.kind}:${marker.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const key = `${marker.lat}:${marker.lng}`;
    const group = groups.get(key) ?? [];
    group.push(marker); groups.set(key, group);
  }
  return [...groups.values()];
}
