import type { Menu, MenuItem, Venue, VenueQuery } from "./types.js";

/**
 * Burgermeister table ordering runs on the public Jamezz QR app.
 * A venue is addressed by the QR mid printed on the table
 * (Mehringdamm table 1 is `8613S3X`, verified 2026-09-30).
 *
 * The read path is unauthenticated HTTP: one GET on the QR page seeds a
 * session cookie, then `data-fetch-v2` with the `session-mid` header
 * returns the menu. This module stops there. It does not create carts,
 * place orders, or talk to the payment or loyalty backends.
 */

const BASE = "https://qrv5.jamezz.app";
const UA = "burgermeister/0.1";

/** Known table QR mids. Add a mid only after it has been read off a table. */
export const KNOWN_TABLES: Record<string, { name: string; note: string }> = {
  "8613S3X": { name: "Burgermeister Mehringdamm (Tafel 1)", note: "table 1 QR, Berlin" },
};

interface SalesareaResponse {
  status?: string;
  data?: {
    salesarea?: {
      id?: number;
      venue_id?: number;
      menukaartVestigingId?: number;
      systeemNaam?: string;
      brand_label?: string;
      valuta?: string;
      payProvider?: string;
      applicationLanguage?: string;
      maxOrderValue?: string;
      systemOnline?: number;
    };
  };
}

interface MenuProduct {
  id?: string;
  naam?: string;
  omschrijving?: string | null;
  price?: number;
  not_available?: boolean;
  sortkey?: number;
  translations?: string;
}

interface Menukaart {
  id?: string;
  naam?: string;
  blocked?: number;
  disableOrdering?: number;
  showInCategoryMenu?: number;
  sortkey?: number;
  translations?: string;
}

interface MenukaartProduct {
  /** numbers in the API payload, unlike the string ids on the entities */
  menukaart_id?: number | string;
  product_id?: number | string;
}

interface DataResponse {
  status?: string;
  data?: {
    menukaarts?: Menukaart[];
    menukaart_products?: MenukaartProduct[];
    products?: MenuProduct[];
  };
}

export function translated(raw: string | undefined, field: string, fallback: string): string {
  if (raw === undefined || raw === "") return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && "en" in parsed) {
      const en = (parsed as Record<string, Record<string, unknown>>)["en"];
      if (en !== undefined && typeof en[field] === "string" && en[field] !== "") {
        return en[field] as string;
      }
    }
  } catch {
    // keep fallback
  }
  return fallback;
}

/** One QR page GET seeds the session cookie; reuse it for data calls. */
export async function bootstrapSession(mid: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`${BASE}/v5/qr/${mid}`, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]).filter(Boolean);
    return cookies.length > 0 ? cookies.join("; ") : null;
  } catch {
    return null;
  }
}

export async function getJson<T>(
  url: string,
  cookie: string | null,
  mid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T | null> {
  try {
    const res = await fetchImpl(url, {
      headers: {
        "user-agent": UA,
        accept: "application/json",
        "session-mid": mid,
        "session-return-path": `${BASE}/v5/qr/${mid}/return`,
        "session-locale": "en",
        ...(cookie !== null ? { cookie } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function salesareaUrl(mid: string): string {
  return `${BASE}/v5_2/qr/salesarea-fetch?session_mid=${mid}&session_return_path=${encodeURIComponent(`${BASE}/v5/qr/${mid}/return`)}`;
}

export const DATA_FETCH_URL = `${BASE}/v5_2/qr/data-fetch-v2`;

/**
 * Size-choice products carry price 0. Their sized children are separate
 * rows named `${parent} 0,2l` and so on — resolve a display price from them.
 */
export function displayPrice(product: MenuProduct, products: readonly MenuProduct[]): number {
  if ((product.price ?? 0) > 0) return product.price ?? 0;
  const sibling = products.find(
    (candidate) =>
      candidate !== product &&
      (candidate.naam ?? "").startsWith(product.naam ?? "\u0000") &&
      (candidate.price ?? 0) > 0,
  );
  return sibling?.price ?? product.price ?? 0;
}

export function menuFromPayload(
  mid: string,
  sales: SalesareaResponse | null,
  data: DataResponse | null,
): Menu | null {
  const salesarea = sales?.data?.salesarea;
  const currency = salesarea?.valuta ?? "EUR";
  const products = data?.data?.products ?? [];
  const byId = new Map<string, MenuProduct>();
  for (const product of products) {
    if (product.id !== undefined) byId.set(product.id, product);
  }

  const categories: Array<{ name: string; items: MenuItem[] }> = [];
  const menukaarts = [...(data?.data?.menukaarts ?? [])].sort(
    (a, b) => (a.sortkey ?? 0) - (b.sortkey ?? 0),
  );
  for (const menukaart of menukaarts) {
    if (menukaart.id === undefined || (menukaart.blocked ?? 0) === 1 || (menukaart.showInCategoryMenu ?? 1) === 0) {
      continue;
    }
    const items: MenuItem[] = [];
    for (const link of data?.data?.menukaart_products ?? []) {
      if (String(link.menukaart_id) !== menukaart.id) continue;
      const product = byId.get(String(link.product_id));
      if (product === undefined || product.not_available === true) continue;
      const category = translated(menukaart.translations, "naam", menukaart.naam ?? menukaart.id);
      items.push({
        id: String(product.id ?? link.product_id ?? ""),
        name: translated(product.translations, "naam", product.naam ?? product.id ?? ""),
        description: product.omschrijving
          ? translated(product.translations, "omschrijving", product.omschrijving)
          : null,
        price: displayPrice(product, products),
        currency,
        category,
        available: !product.not_available,
      });
    }
    if (items.length > 0) {
      categories.push({
        name: translated(menukaart.translations, "naam", menukaart.naam ?? menukaart.id),
        items,
      });
    }
  }
  if (categories.length === 0) return null;
  return {
    venueId: mid,
    provider: "burgermeister",
    venueName: salesarea?.systeemNaam?.trim() ?? KNOWN_TABLES[mid]?.name ?? mid,
    currency,
    categories,
    updatedAt: new Date().toISOString(),
  };
}

export interface BurgermeisterClientOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** Read-only client. Ordering and payment are intentionally absent. */
export class BurgermeisterClient {
  readonly provider = "burgermeister";
  readonly displayName = "Burgermeister";
  readonly capabilities = {
    discoverVenues: true,
    getMenu: true,
    ordering: false,
    delivery: false,
  } as const;

  constructor(private readonly options: BurgermeisterClientOptions = {}) {}

  async discoverVenues(query: VenueQuery = {}): Promise<Venue[]> {
    const venues: Venue[] = [];
    for (const [mid, meta] of Object.entries(KNOWN_TABLES)) {
      const sales = await getJson<SalesareaResponse>(
        salesareaUrl(mid),
        null,
        mid,
        this.options.fetchImpl,
      );
      const salesarea = sales?.data?.salesarea;
      const name = salesarea?.systeemNaam?.trim() || meta.name;
      if (query.search !== undefined && !name.toLowerCase().includes(query.search.toLowerCase())) continue;
      venues.push({
        id: mid,
        provider: this.provider,
        name,
        address: "Berlin, DE",
        cuisines: ["burgers"],
        orderingEnabled: false,
        website: `https://jamezz.app/dl/${mid}`,
        imageUrl: undefined,
      });
    }
    return venues;
  }

  async getMenu(venueId: string): Promise<Menu | null> {
    const sales = await getJson<SalesareaResponse>(
      salesareaUrl(venueId),
      null,
      venueId,
      this.options.fetchImpl,
    );
    // data-fetch-v2 returns the full menu only for a session the server has
    // not already snapshotted, so seed a fresh cookie first.
    const cookie = await bootstrapSession(venueId, this.options.fetchImpl);
    const data = await getJson<DataResponse>(DATA_FETCH_URL, cookie, venueId, this.options.fetchImpl);
    const menu = menuFromPayload(venueId, sales, data);
    if (menu === null) return null;
    return { ...menu, updatedAt: (this.options.now ?? (() => new Date()))().toISOString() };
  }
}
