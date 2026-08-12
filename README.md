# MK Foods POS

Offline-first Tauri POS for MK Pizza & Ice Bar.

## Run

1. Install Node.js LTS.
2. Install Rust with the MSVC toolchain on Windows (and the required Tauri system dependencies for your OS).
3. Run `npm install --include=dev`.
4. Run `npm start` for development.
5. Run `npm run build` to create installers.

Tauri uses the operating system's native web renderer instead of bundling Electron/Chromium. The existing HTML/CSS/JavaScript UI is kept in `src/renderer`, while desktop/backend functionality is implemented in `src-tauri`.

## Offline operation

Transactions, menu data, configuration and audit events are stored locally under Tauri's application data directory. The UI does not require an internet connection to create and complete cash orders.

## Default users

- admin / 0099 — Admin
- owner / 0099 — Owner
- cashier / 0099 — Cashier
- accountant / 0099 — Accountant

Change these credentials before production deployment.

## Business defaults

MK Pizza & Ice Bar · Collage Road Abbas Chowk, Bhakkar, Pakistan · 0316 9700025 · Rs. · 0% tax.

Configure the receipt printer Bluetooth MAC from Settings.

## Implemented foundation

Dashboard, POS/order entry, local order ledger, reports, tables, KDS queue, delivery dispatch, customers/loyalty view, inventory, suppliers/procurement, settings, role authentication, audit logging and printer configuration are represented in the desktop application. Cloud synchronization, payment processor certification, GPS provider credentials and delivery-platform credentials remain adapter/integration work and are intentionally not faked.
