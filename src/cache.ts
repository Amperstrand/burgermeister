import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Menu, MenuItem, Venue, VenueQuery } from "./types.js";

/**
 * Serves a previously saved menu snapshot with no network calls.
 * Snapshot shape: `{mid}.json` with venue identity plus categories and items
 * (`nameEn`, `descriptionEn`, `allergens`, `displayPrice`, `image`).
 * Ordering stays disabled.
 */

interface CacheItem {
  id: string;
  name: string;
  nameEn: string;
  description?: string | null;
  descriptionEn?: string | null;
  allergens?: string[];
  price: number;
  displayPrice: number;
  image?: { webp600?: string | null; original?: string | null } | null;
}

interface CacheFile {
  mid: string;
  cachedAt: string;
  venue: {
    salesareaId?: number | null;
    venueId?: number | null;
    name?: string;
    brand?: string | null;
    currency?: string | null;
    payProvider?: string | null;
    minOrderValue?: string | null;
    maxOrderValue?: string | null;
  };
  categories: Array<{ id: string; name: string; nameEn: string; items: CacheItem[] }>;
}

export class BurgermeisterCache {
  readonly provider = "burgermeister-cache";
  readonly displayName = "Burgermeister (saved menu, no network)";
  readonly capabilities = {
    discoverVenues: true,
    getMenu: true,
    ordering: false,
    delivery: false,
  } as const;

  constructor(private readonly cacheDir: string) {}

  private readCache(mid: string): CacheFile | null {
    try {
      return JSON.parse(readFileSync(join(this.cacheDir, `${mid}.json`), "utf8")) as CacheFile;
    } catch {
      return null;
    }
  }

  private cachedMids(): string[] {
    try {
      return readdirSync(this.cacheDir)
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length));
    } catch {
      return [];
    }
  }

  async discoverVenues(query: VenueQuery = {}): Promise<Venue[]> {
    const venues: Venue[] = [];
    for (const mid of this.cachedMids()) {
      const cache = this.readCache(mid);
      if (cache === null) continue;
      const name = cache.venue.name?.trim() || mid;
      if (query.search !== undefined && !name.toLowerCase().includes(query.search.toLowerCase())) continue;
      venues.push({
        id: mid,
        provider: this.provider,
        name,
        cuisines: ["burgers"],
        orderingEnabled: false,
        website: `https://jamezz.app/dl/${mid}`,
      });
    }
    return venues;
  }

  async getMenu(venueId: string): Promise<Menu | null> {
    const cache = this.readCache(venueId);
    if (cache === null || cache.categories.length === 0) return null;
    const currency = cache.venue.currency ?? "EUR";
    const categories = cache.categories.map((category) => {
      const items: MenuItem[] = category.items.map((item) => ({
        id: item.id,
        name: item.nameEn || item.name,
        description: item.descriptionEn ?? item.description ?? null,
        price: item.displayPrice,
        currency,
        category: category.nameEn || category.name,
        available: true,
        tags: item.allergens && item.allergens.length > 0 ? item.allergens.map((allergen) => `allergen:${allergen}`) : undefined,
        imageUrl: item.image?.webp600 ?? null,
      }));
      return { name: category.nameEn || category.name, items };
    });
    return {
      venueId,
      provider: this.provider,
      venueName: cache.venue.name?.trim() ?? venueId,
      currency,
      categories,
      updatedAt: cache.cachedAt,
    };
  }
}
