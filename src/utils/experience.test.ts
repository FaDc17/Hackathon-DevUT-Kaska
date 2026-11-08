import { describe, expect, it } from "vitest";
import { categoryIcon } from "./categoryIcons";
import { groupMarkers } from "./mapMarkers";
import { pullDistance, PULL_THRESHOLD } from "./pullRefresh";
import { validOfflineSession } from "../services/offlineSession";

describe("category catalog presentation", () => {
  it.each([["Electricidad", "bolt"], ["Gasfitería", "drop"], ["Carpintería", "hammer"], ["Transporte", "car"], ["Tecnología", "computer"], ["Hogar", "home"], ["Jardinería", "leaf"], ["Belleza", "scissors"], ["Eventos", "calendar"], ["Otros", "grid"], ["Nueva categoría", "grid"]])("maps %s without relying on catalog IDs", (name, icon) => {
    expect(categoryIcon(name)).toBe(icon);
    expect(categoryIcon(name.toUpperCase())).toBe(icon);
  });
});
describe("coincident map records", () => {
  const marker = (id: string, kind = "service", lat = -12) => ({ id, kind, lat, lng: -77 });
  it("preserves three services, mixed categories, IDs and real coordinates", () => {
    const records = [marker("1"), marker("2"), marker("3"), marker("1", "community"), marker("1", "emergency")];
    const groups = groupMarkers([...records, records[0], marker("far", "service", -11)]);
    expect(groups.map(group => group.length)).toEqual([5, 1]);
    expect(groups[0]).toEqual(records);
    expect(groupMarkers(records.filter(item => item.kind === "service"))[0]).toHaveLength(3);
    expect(groupMarkers(records.filter(item => item.kind === "community"))[0][0].id).toBe("1");
  });
});
it("requires an intentional downward pull and rejects normal upward and horizontal scrolling", () => {
  expect(pullDistance(1, 30)).toBeLessThan(PULL_THRESHOLD);
  expect(pullDistance(3, 160)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
  expect(pullDistance(60, 160)).toBe(0);
  expect(pullDistance(1, -160)).toBe(0);
});
it("permits only previously authenticated, unexpired offline sessions with matching identities", () => {
  const token = (sub: string, exp: number) => `header.${btoa(JSON.stringify({ sub, exp }))}.signature`;
  expect(validOfflineSession({ userId: "u", accessToken: token("u", 200) }, 100_000)).toBe(true);
  expect(validOfflineSession({ userId: "u", accessToken: token("u", 100) }, 100_000)).toBe(false);
  expect(validOfflineSession({ userId: "u", accessToken: token("other", 200) }, 100_000)).toBe(false);
});
