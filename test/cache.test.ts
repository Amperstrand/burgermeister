import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BurgermeisterCache } from "../src/cache.js";

const fixture = {
  mid: "TEST01",
  cachedAt: "2026-10-01T12:00:00.000Z",
  venue: {
    salesareaId: 1234,
    venueId: 99,
    name: "Test Venue Mehringdamm - QR",
    brand: "testbrand",
    currency: "EUR",
    payProvider: "MOLLIE",
    minOrderValue: "0.00",
    maxOrderValue: "500.00",
  },
  categories: [
    {
      id: "1",
      name: "Burger",
      nameEn: "Burger",
      items: [
        {
          id: "100",
          name: "Cheeseburger",
          nameEn: "Cheeseburger",
          description: "Patty aus frischem Rindfleisch",
          descriptionEn: "Fresh beef patty, buttered and toasted brioche",
          allergens: ["ei", "melk", "gluten"],
          price: 6.4,
          displayPrice: 6.4,
          image: { webp600: "https://example.test/cb-600.webp", original: null },
        },
        {
          id: "101",
          name: "Milkshake Vanilla",
          nameEn: "Milkshake Vanilla",
          description: null,
          descriptionEn: null,
          allergens: [],
          price: 0,
          displayPrice: 3.4,
          image: null,
        },
      ],
    },
    {
      id: "2",
      name: "Drinks",
      nameEn: "Drinks",
      items: [
        {
          id: "102",
          name: "Wasser",
          nameEn: "Viva Con Agua still",
          description: null,
          descriptionEn: "Natural mineral water",
          allergens: [],
          price: 3.1,
          displayPrice: 3.1,
          image: null,
        },
      ],
    },
  ],
};

const dir = join(tmpdir(), `jamezz-cache-test-${Date.now()}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "TEST01.json"), JSON.stringify(fixture));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("BurgermeisterCache", () => {
  it("discovers cached venues and reports ordering disabled", async () => {
    const p = new BurgermeisterCache(dir);
    const venues = await p.discoverVenues({});
    expect(venues).toHaveLength(1);
    expect(venues[0]).toMatchObject({ id: "TEST01", provider: "burgermeister-cache", name: "Test Venue Mehringdamm - QR", orderingEnabled: false });
  });

  it("filters discovery by search substring", async () => {
    const p = new BurgermeisterCache(dir);
    expect(await p.discoverVenues({ search: "mehringdamm" })).toHaveLength(1);
    expect(await p.discoverVenues({ search: "oslo" })).toHaveLength(0);
  });

  it("maps menu with EN names, size-resolved prices, allergen tags, images", async () => {
    const p = new BurgermeisterCache(dir);
    const menu = await p.getMenu("TEST01");
    expect(menu).not.toBeNull();
    expect(menu?.venueName).toBe("Test Venue Mehringdamm - QR");
    expect(menu?.currency).toBe("EUR");
    expect(menu?.updatedAt).toBe(fixture.cachedAt);
    const cats = menu?.categories ?? [];
    expect(cats.map((c) => c.name)).toEqual(["Burger", "Drinks"]);
    const cb = cats[0]?.items.find((i) => i.id === "100");
    expect(cb).toMatchObject({
      name: "Cheeseburger",
      description: "Fresh beef patty, buttered and toasted brioche",
      price: 6.4,
      currency: "EUR",
      imageUrl: "https://example.test/cb-600.webp",
    });
    expect(cb?.tags).toEqual(["allergen:ei", "allergen:melk", "allergen:gluten"]);
    const shake = cats[0]?.items.find((i) => i.id === "101");
    expect(shake?.price).toBe(3.4);
    const water = cats[1]?.items[0];
    expect(water?.name).toBe("Viva Con Agua still");
  });

  it("returns null for unknown venue and empty menus for a missing cache dir", async () => {
    const p = new BurgermeisterCache(dir);
    expect(await p.getMenu("NOPE")).toBeNull();
    const missing = new BurgermeisterCache(join(dir, "does-not-exist"));
    expect(await missing.discoverVenues({})).toEqual([]);
    expect(await missing.getMenu("TEST01")).toBeNull();
  });
});
