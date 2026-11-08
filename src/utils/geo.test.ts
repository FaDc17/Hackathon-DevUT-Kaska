import { describe, expect, it } from "vitest";
import { districtCenter, PERU_OVERVIEW_CENTER } from "./geo";

describe("districtCenter", () => {
  it("does not map an unspecified or unknown district to Lima", () => {
    expect(districtCenter("Sin especificar")).toEqual(PERU_OVERVIEW_CENTER);
    expect(districtCenter("Distrito no catalogado")).toEqual(PERU_OVERVIEW_CENTER);
  });

  it("preserves known district map centers", () => {
    expect(districtCenter("Miraflores")).toEqual({ lat: -12.1211, lng: -77.0297 });
  });
});
