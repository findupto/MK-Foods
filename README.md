# MK Foods POS

Offline-first enterprise-oriented Tauri POS for MK Pizza & Ice Bar.

## Run

1. Install Node.js LTS.
2. Install Rust with the MSVC toolchain on Windows (and the required Tauri system dependencies for your OS).
3. Run `npm install --include=dev`.
4. Run `npm start` for development.
5. Run `npm run build` to create installers.

Tauri uses the operating system's native web renderer instead of bundling Electron/Chromium. The existing HTML/CSS/JavaScript UI is kept in `src/renderer`, while desktop/backend functionality is implemented in `src-tauri`.

## Enterprise capabilities

- Offline-first POS with local persistence.
- Role-based authentication, PBKDF2 password hashing, session expiry and account lockout.
- Audit logging and controlled privileged operations.
- Orders, tables, KDS, delivery, riders, customers/loyalty, inventory, procurement, suppliers, expenses, shifts and reporting.
- Receipt/KOT printer routing with Windows RAW spooler support.
- Multi-path Bluetooth thermal printing: Windows PnP/BTHENUM discovery, Bluetooth SPP virtual COM discovery, direct Bluetooth Classic SPP by MAC, Windows spooler fallback, and manual MAC/COM connection.
- Real ESC/POS test-print validation before a Bluetooth route is saved.
- Digital-payment verification state that does not fake bank settlement.
- Enterprise cloud sync API with idempotency, rate limiting, request IDs, bounded payloads and location-scoped event streams.
- Persistent cloud event storage with atomic writes and recovery backup.
- Production authentication and CORS controls through environment configuration.
- Automated Node, renderer contract, Linux Rust-check and Windows installer CI paths.

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

Printer setup and multi-path Bluetooth discovery are available from **Printers** in the POS Settings area. See `docs/BLUETOOTH-PRINTERS.md` for transport details and production validation guidance.

## Cloud deployment

The optional cloud service is in `cloud/server.js`. Production mode requires authentication, uses persistent storage, supports idempotent sync operations and should be deployed behind HTTPS/TLS. For high-volume or highly available multi-instance deployments, use a transactional database such as PostgreSQL instead of the file-backed store.

See `docs/PRODUCTION_READINESS.md` for the production and compliance boundary, including payment-provider certification and hardware validation requirements.
