/** Stage 1: Venue/location discovery — "find me a coffee shop nearby" */

export interface VenueQuery {
  lat?: number;
  lng?: number;
  city?: string;
  countryCode?: string;
  radiusKm?: number;
  cuisine?: string;
  search?: string;
}

export interface Venue {
  /** provider-scoped id, stable across calls */
  id: string;
  provider: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  cuisines?: string[];
  rating?: number;
  venueType?: string;
  priceLevel?: string;
  orderingEnabled: boolean;
  phone?: string;
  website?: string;
  imageUrl?: string;
}

/** Stage 2: Menu/inventory — "what do they have and what does it cost?" */

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  category?: string;
  available: boolean;
  imageUrl?: string | null;
  tags?: string[];
  gtin?: string | null;
}

export interface Menu {
  venueId: string;
  provider: string;
  venueName: string;
  currency: string;
  categories: Array<{ name: string; items: MenuItem[] }>;
  updatedAt: string;
}

/** Stage 3: Order building — "I want a flat white and a croissant" */

export interface CartItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

export interface OrderSession {
  id: string;
  provider: string;
  venueId: string;
  venueName: string;
  items: CartItem[];
  total: number;
  currency: string;
  state: OrderSessionState;
}

export type OrderSessionState =
  | "created"
  | "policy_ok"
  | "staged"
  | "awaiting_human"
  | "submitted"
  | "confirmed"
  | "failed"
  | "cancelled"
  | "expired";

/** Stage 4: Checkout — "take my money" (human gate ALWAYS) */

export interface CheckoutHandoff {
  orderSessionId: string;
  /** URL a human can open to complete payment (browser, app, or terminal) */
  checkoutUrl?: string;
  /** programmatic handoff (API-driven checkout, still human-gated at 3DS/OTP) */
  apiHandoff?: {
    endpoint: string;
    method: string;
    /** what the caller needs to provide (card details come from the human, never stored) */
    requiresHumanInput: string[];
  };
  humanGateRequired: true;
  note: string;
}

/** The universal contract every integration implements. */

export interface CommerceProvider {
  readonly provider: string;
  readonly displayName: string;
  /** what this provider can do (chatbot uses this to route requests) */
  readonly capabilities: {
    discoverVenues: boolean;
    getMenu: boolean;
    ordering: boolean;
    delivery: boolean;
  };

  discoverVenues(query: VenueQuery): Promise<Venue[]>;
  getMenu(venueId: string): Promise<Menu | null>;

  /** Stage 3+4: optional — providers that support programmatic ordering */
  ordering?: {
    createSession(venueId: string): Promise<OrderSession>;
    addItem(session: OrderSession, menuItemId: string, quantity: number): Promise<OrderSession>;
    removeItem(session: OrderSession, menuItemId: string): Promise<OrderSession>;
    startCheckout(session: OrderSession): Promise<CheckoutHandoff>;
  };
}

/** Registry — the chatbot's entry point. */
export interface ProviderRegistry {
  readonly providers: readonly CommerceProvider[];
  get(name: string): CommerceProvider | undefined;
  discoverAll(query: VenueQuery): Promise<Array<{ provider: string; venues: Venue[] }>>;
}
