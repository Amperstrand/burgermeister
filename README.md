> [!WARNING]
> **Superseded by [Amperstrand/jamezz](https://github.com/Amperstrand/jamezz)** — the same client, evolved: typed errors, client-owned sessions, the v2.0 order-shape fixes, CLI, venue catalog, offline fakes, and prompts. This repo stays read-only for history; all new work happens in jamezz.

# burgermeister

Read-only client for Burgermeister table ordering.

A table QR code addresses one venue. This module fetches that venue's menu.
It does not create a cart, place an order, or take payment.

```ts
import { BurgermeisterClient, KNOWN_TABLES } from "burgermeister";

const client = new BurgermeisterClient();
const [table] = Object.keys(KNOWN_TABLES);
const menu = await client.getMenu(table);
```

`BurgermeisterCache` serves a previously saved menu snapshot and makes no
network calls. Pass it the directory of `{table-id}.json` files.

Known table: Mehringdamm table 1, QR mid `8613S3X` (read 2026-09-30).
Other locations need their own QR code. Do not guess one.

Requires Node.js 22 or newer.
