import { describe, expect, it } from "vitest";
import { mergeFeed } from "./pagination";

type FeedItem = { id: string; createdAt: number; district: string };

describe("mergeFeed", () => {
  it("preserves the query ordering across pages and replaces duplicate IDs", () => {
    const firstPage: FeedItem[] = [
      { id: "near", createdAt: 10, district: "Bellavista" },
      { id: "other", createdAt: 30, district: "Callao" },
    ];
    const secondPage: FeedItem[] = [
      { id: "other", createdAt: 31, district: "Callao" },
      { id: "near-2", createdAt: 5, district: "Bellavista" },
    ];

    expect(mergeFeed(firstPage, secondPage)).toEqual([
      firstPage[0],
      secondPage[0],
      secondPage[1],
    ]);
  });
});
