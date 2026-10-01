import { describe, expect, it } from "vitest";
import {
  DATA_FETCH_URL,
  displayPrice,
  menuFromPayload,
  salesareaUrl,
  translated,
} from "../src/client.js";

const sales = {
  status: "ok",
  data: {
    salesarea: {
      systeemNaam: "Demo Table - QR",
      valuta: "EUR",
      systemOnline: 1,
    },
  },
};

const data = {
  status: "ok",
  data: {
    menukaarts: [
      { id: "10", naam: "Burger", sortkey: 2, showInCategoryMenu: 1, translations: JSON.stringify({ en: { naam: "Burgers" } }) },
      { id: "9", naam: "Hidden", sortkey: 1, showInCategoryMenu: 0 },
      { id: "11", naam: "Drinks", sortkey: 3, blocked: 0, translations: JSON.stringify({ en: { naam: "Drinks" } }) },
    ],
    menukaart_products: [
      { menukaart_id: 10, product_id: 100 },
      { menukaart_id: 10, product_id: 101 },
      { menukaart_id: 9, product_id: 199 },
      { menukaart_id: 11, product_id: 102 },
    ],
    products: [
      {
        id: "100",
        naam: "Cheeseburger",
        omschrijving: "Hausbeschreibung",
        price: 6.4,
        translations: JSON.stringify({
          en: { naam: "Cheeseburger", omschrijving: "Fresh beef patty" },
        }),
      },
      {
        id: "101",
        naam: "Milkshake Vanilla",
        price: 0,
      },
      {
        id: "101-size",
        naam: "Milkshake Vanilla 0,2l",
        price: 3.4,
      },
      {
        id: "199",
        naam: "Secret item",
        price: 1,
      },
      {
        id: "102",
        naam: "Wasser",
        price: 3.1,
        not_available: false,
        translations: JSON.stringify({ en: { naam: "Still water" } }),
      },
    ],
  },
};

describe("menuFromPayload", () => {
  it("keeps visible categories, prefers English names, and resolves a zero parent price", () => {
    const menu = menuFromPayload("TABLE1", sales, data);
    expect(menu).not.toBeNull();
    expect(menu?.provider).toBe("burgermeister");
    expect(menu?.venueName).toBe("Demo Table - QR");
    expect(menu?.currency).toBe("EUR");
    expect(menu?.categories.map((category) => category.name)).toEqual(["Burgers", "Drinks"]);
    const burger = menu?.categories[0]?.items.find((item) => item.id === "100");
    expect(burger).toMatchObject({
      name: "Cheeseburger",
      description: "Fresh beef patty",
      price: 6.4,
      currency: "EUR",
    });
    const shake = menu?.categories[0]?.items.find((item) => item.id === "101");
    expect(shake?.price).toBe(3.4);
    expect(menu?.categories.flatMap((category) => category.items).some((item) => item.id === "199")).toBe(false);
  });

  it("returns null when every category is hidden or empty", () => {
    expect(menuFromPayload("TABLE1", sales, { data: { menukaarts: [], products: [] } })).toBeNull();
  });
});

describe("helpers", () => {
  it("falls back when translations are missing or invalid", () => {
    expect(translated(undefined, "naam", "fallback")).toBe("fallback");
    expect(translated("{not json", "naam", "fallback")).toBe("fallback");
    expect(translated(JSON.stringify({ de: { naam: "Käse" } }), "naam", "fallback")).toBe("fallback");
  });

  it("keeps a positive price and does not borrow an unrelated sibling", () => {
    expect(displayPrice({ naam: "Fries", price: 2.5 }, [{ naam: "Fries large", price: 4 }])).toBe(2.5);
    expect(displayPrice({ naam: "Shake", price: 0 }, [{ naam: "Cola", price: 3 }])).toBe(0);
  });

  it("builds the public read URLs from the table mid only", () => {
    expect(salesareaUrl("TABLE1")).toContain("session_mid=TABLE1");
    expect(salesareaUrl("TABLE1")).toContain("/v5_2/qr/salesarea-fetch");
    expect(DATA_FETCH_URL).toBe("https://qrv5.jamezz.app/v5_2/qr/data-fetch-v2");
  });
});
