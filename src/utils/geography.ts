/** Special catalogue rows keep their server IDs, but never represent proximity. */
export const isUnspecified = (name?: string) =>
  !name?.trim() || name.trim().toLocaleLowerCase("es") === "sin especificar";

type Located = { districtId?: number; district?: string };
export function sameDistrict(a: Located, b: Located): boolean {
  return Number.isInteger(a.districtId) && a.districtId === b.districtId &&
    !isUnspecified(a.district) && !isUnspecified(b.district);
}

export function prioritizeDistrict<T extends Located & { id: string | number; createdAt: number }>(
  items: T[], user: Located,
): T[] {
  return [...items].sort((a, b) => Number(sameDistrict(b, user)) - Number(sameDistrict(a, user)) ||
    b.createdAt - a.createdAt || String(a.id).localeCompare(String(b.id)));
}
