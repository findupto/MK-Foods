# Enterprise Point of Sale (POS) System — Product Requirements Document

**Product:** MK Foods Enterprise POS  
**Business:** MK Pizza & Ice Bar  
**Document status:** Initial enterprise PRD  
**Target:** Offline-first, cloud-connected, multi-location restaurant platform

## 1. Product Vision

Build a resilient restaurant operating system that keeps selling, printing, kitchen production, and cashier workflows operational during internet outages, then synchronizes safely with the cloud when connectivity returns. The platform must support one store today and scale to many stores without redesigning the data model.

## 2. Business Defaults

| Setting | Default |
|---|---|
| Business | MK Pizza & Ice Bar |
| Address | Collage Road Abbas Chowk, Bhakkar, Pakistan |
| Phone | 0316 9700025 |
| Currency | Rs. |
| Tax | 0% |
| Printer | Bluetooth MAC configured in Settings |

### Default users

| Username | Role | Initial password |
|---|---|---|
| admin | Admin | `0099` |
| owner | Owner | `0099` |
| cashier | Cashier | `0099` |
| accountant | Accountant | `0099` |

Initial passwords are bootstrap credentials only. Production onboarding must require a password change and must store only salted password hashes; credentials must never be committed to source control.

## 3. Goals and Non-Goals

### Goals
- Complete core POS transactions without internet access.
- Synchronize orders, payments, inventory, configuration, and audit events when online.
- Provide sub-second common order-entry interactions on supported edge hardware.
- Support dine-in, takeaway, delivery, drive-thru, kiosk, and future ordering channels.
- Centralize enterprise configuration while allowing location-specific availability and pricing.
- Provide operational visibility into sales, prep times, inventory, waste, cashier activity, and reconciliation.

### Non-goals for the first release
- Full payroll/HR suite.
- General ledger replacement for a dedicated ERP/accounting platform.
- Owning third-party delivery fleets.

## 4. System Architecture

### 4.1 High-level topology

```text
                    ┌─────────────────────────────┐
                    │        Cloud Platform        │
                    │ API Gateway / Auth / Sync    │
                    │ Menu / Inventory / Reports   │
                    │ Loyalty / Delivery / Admin   │
                    └──────────────┬──────────────┘
                                   │ HTTPS + events
                         ┌─────────┴─────────┐
                         │   Sync Service    │
                         └─────────┬─────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │          Restaurant Edge Node           │
              │ Local API + SQLite/PostgreSQL + Queue   │
              │ Cache + Device Registry + Printer Hub   │
              └──────┬─────────┬──────────┬─────────────┘
                     │         │          │
                 POS/FOH      KDS      Kiosk/Drive-thru
                     │         │          │
                Cash/EMV/NFC  Kitchen   Customer display
```

### 4.2 Edge/offline redundancy mode
- Every location has a local transactional datastore containing the active menu, prices, taxes, tenders, employees, open orders, KDS tickets, and required inventory state.
- POS clients communicate with the local edge API over LAN so cashier-to-server traffic does not depend on WAN connectivity.
- Writes are committed locally first and assigned immutable event IDs.
- A durable outbound sync queue records unsynchronized events.
- On reconnect, synchronization is idempotent and uses event IDs/version vectors or equivalent conflict detection.
- Cloud configuration is versioned. Edge devices keep the last known good configuration and only activate a newer configuration after validation.
- If the edge node fails, a designated standby edge node can restore from the latest replicated local snapshot and unsynced event log.
- Devices show explicit Online, Syncing, and Offline states; offline operation must not silently appear online.
- Payment behavior during outage is determined by processor/device capabilities. The POS must never invent approval responses; offline card acceptance is permitted only when the payment provider and terminal support it.

### 4.3 Recommended deployment layers
- **Edge:** local API, transactional database, sync worker, printer/device adapter, health monitor.
- **Cloud:** API gateway, identity, configuration service, order service, inventory service, reporting/analytics, integration workers, notification service.
- **Storage:** relational transactional store, object storage for exports/receipts, append-only audit/event storage, analytics warehouse.
- **Transport:** HTTPS REST for commands/queries, WebSocket/SSE for operational updates, durable event queue for asynchronous integration.

## 5. Functional Requirements

## 5.1 Authentication & Access Control
- Login by username/password; optional PIN or device-bound quick login for cashier workflows.
- RBAC roles: Admin, Owner, Cashier, Accountant, Kitchen, Manager, and custom roles.
- Permissions at module/action level: view, create, edit, void, refund, discount, reopen, export, configure, and administer.
- Session timeout, device registration, forced password change for bootstrap accounts, lockout/rate limiting, and audit logging.

## 5.2 Front-of-House (FOH)

### Order entry
- Touch-first UI optimized for rapid item selection.
- Category tabs, favorites, search, modifiers, notes, quantity controls, and keyboard shortcuts where applicable.
- Order types: dine-in, takeaway, delivery, drive-thru, kiosk, and custom channels.
- Table/floor assignment and customer association.
- Item availability must reflect local inventory/menu state without requiring a cloud round trip.
- Hold/retrieve orders and reopen suspended carts according to permission.

### Billing
- Cash, card, split tender, partial payments, discounts, service charges, tax, rounding, refunds, and voids.
- Split bill by item, quantity, seat, or custom amount.
- Reprint receipt and email/SMS receipt when an online channel is available.
- Receipt numbering must remain collision-free during offline periods.

### Performance targets
- Local menu navigation: p95 <= 100 ms.
- Add-to-cart interaction: p95 <= 150 ms.
- Local payment/order commit: p95 <= 500 ms excluding external terminal authorization.
- POS must remain usable during WAN outage.

## 5.3 Drive-Thru Timing
- Lane/vehicle/order identifier.
- Timestamp milestones: arrival, order started, order confirmed, payment, kitchen ready, handoff, departure.
- Live timer and threshold alerts.
- Per-location configurable service-time targets.
- Analytics by hour, lane, order type, and daypart.

## 5.4 Self-Service Kiosk
- Customer-facing catalog with modifiers and availability.
- Dine-in/takeaway selection, cart, customer details, payment handoff, receipt/order number.
- Accessibility support, idle timeout, session reset, and privacy clearing.
- Kiosk orders enter the same order pipeline as POS orders and use the same menu/pricing rules.

## 6. Kitchen Display System (KDS)

- Route items to stations by category, prep area, modifier, or production rule.
- Ticket statuses: New, Accepted, Preparing, Ready, Served/Handed Off, Cancelled.
- Color-coded urgency based on configurable prep thresholds.
- Bump, recall, priority, item-level completion, and ticket-level completion.
- Expo view consolidates multi-station tickets.
- KDS must continue working on the local LAN while cloud connectivity is unavailable.
- Capture promised time, start time, ready time, and handoff time.
- Prep analytics: average/median/p90 prep time, SLA breaches, station throughput, bottlenecks, item-level prep performance.
- Optional audible/visual alerts with configurable frequency.

## 7. Back-of-Office (BOO) & Enterprise Management

### Menu management
- Central menu catalog with categories, items, modifiers, recipes, allergens, images, pricing, tax rules, and channel availability.
- Effective-dated menu versions with publish/rollback.
- Location overrides for price, availability, inventory thresholds, and operating hours.
- Publishing must produce a versioned configuration package consumed by edge nodes.

### Inventory
- Multi-location stock ledger with transfers, receipts, adjustments, counts, par levels, reorder points, and supplier references.
- Real-time inventory state when online and best-known local state when offline.
- Ingredient-level depletion through recipe/portion mappings.
- Negative-stock policies configurable per item/location.
- Conflict-safe synchronization for stock movements.

### Waste management
- Waste reasons: spoilage, overproduction, damaged, expired, incorrect preparation, and other configurable reasons.
- Capture quantity, unit, estimated cost, employee, location, timestamp, and notes.
- Waste reports by item, category, location, reason, shift, and cost.
- Optional approval workflow for high-value waste.

### Enterprise reporting
- Sales by location, channel, product, hour, cashier, and payment type.
- Gross sales, discounts, refunds, net sales, tax, tender totals, and variance.
- Inventory valuation and movement reports.
- KDS performance and drive-thru SLA dashboards.
- CSV/PDF export and scheduled reports in the cloud phase.

## 8. Integrations & APIs

### Payment integrations
- EMV chip and NFC/contactless through supported certified payment terminals/processors.
- Abstract payment adapter so processor changes do not alter POS business logic.
- Payment intents, authorization, capture, void, refund, settlement reference, terminal status, and reconciliation.
- Never store full PAN, CVV, PIN blocks, or sensitive authentication data in POS application databases.

### Delivery platforms
- Adapter-based integration for Uber Eats, DoorDash, and future providers.
- Ingest orders, modifiers, customer/channel metadata, cancellations, status changes, and provider order IDs.
- Map provider menu items/modifiers to canonical POS items.
- Provider webhooks must be authenticated, deduplicated, and replay-safe.
- If an external provider is unavailable, locally queued outbound updates must retry with exponential backoff.

### Loyalty
- Customer profile, points/visits, rewards, promotions, redemption, and earn rules.
- Offline-safe local balance policy with reconciliation rules to prevent double redemption.
- Loyalty provider adapter API for future external programs.

### Public/internal API
- REST/JSON API with versioning (`/api/v1/...`).
- Webhooks for order, payment, inventory, KDS, and configuration events.
- Idempotency keys for commands.
- Pagination, filtering, correlation IDs, standardized errors, and rate limits.
- OpenAPI specification is a release artifact.

## 9. Data Model — Core Entities

Business, Location, User, Role, Permission, Device, Terminal, Menu, Category, Item, ModifierGroup, Modifier, Recipe, InventoryItem, StockLedgerEntry, Supplier, PurchaseReceipt, WasteRecord, Customer, LoyaltyAccount, Order, OrderItem, Payment, Refund, Discount, TaxRule, Table, DriveThruEvent, KdsTicket, KdsStation, DeliveryOrder, SyncEvent, ConfigurationVersion, AuditEvent, Shift, CashDrawer, CashSession, and ReportSnapshot.

Every mutable enterprise entity should include IDs, location scope where applicable, created/updated timestamps, version, and audit metadata. Financial and stock movements must be append-only ledger events rather than destructive updates.

## 10. Offline Synchronization Requirements

1. Local transaction commits before cloud acknowledgement.
2. Every syncable mutation has a globally unique event ID and origin device ID.
3. Sync worker uses at-least-once delivery with idempotent server handling.
4. Ordering-sensitive domains use sequence numbers or causal/version metadata.
5. Conflict rules are domain-specific: configuration is versioned, financial transactions are immutable, and inventory uses ledger reconciliation rather than last-write-wins.
6. Failed events remain durable and visible to operators.
7. Sync retry uses exponential backoff with jitter.
8. A reconciliation screen shows pending, succeeded, conflicted, and failed events.
9. Cloud replays must not duplicate orders, payments, loyalty awards, or stock movements.
10. Backup/restore must include the local database and durable event queue.

## 11. Security & Compliance

- Enforce TLS for network traffic and encryption at rest for cloud and edge databases.
- Use secure password hashing such as Argon2id or an equivalent approved password KDF.
- RBAC and least privilege for users, services, and integration credentials.
- Secrets stored in a secrets manager; never hard-coded in source.
- Device authentication with rotating credentials/certificates where supported.
- Immutable audit logs for logins, role changes, price changes, refunds, voids, discounts, cash drawer actions, inventory adjustments, configuration publication, and administrative changes.
- PCI DSS scope must be minimized through certified payment terminals and processor-hosted/tokenized flows. The implementation and operational environment must undergo the appropriate PCI DSS assessment before production payment processing.
- Mask payment references in UI and logs.
- Secure backups, retention policies, disaster recovery, and restore testing.
- OWASP-aligned application security, dependency scanning, secret scanning, SAST, and DAST in CI/CD.

## 12. Reliability & Observability

- Edge health dashboard: database, disk, CPU/memory, printer, terminal, network, queue depth, and sync age.
- Cloud metrics: request latency, error rates, queue lag, sync failures, integration failures, and database health.
- Structured logs with correlation IDs and no sensitive payment data.
- Alerts for prolonged offline state, failed payments, printer failure, KDS backlog, inventory sync conflicts, and abnormal void/refund activity.
- Target service availability: cloud control plane >= 99.9%; local POS availability is designed to remain operational during WAN outages subject to local hardware power/network health.

## 13. Roles & Key Permissions

| Capability | Admin | Owner | Accountant | Cashier |
|---|---:|---:|---:|---:|
| POS selling | Yes | Yes | Optional | Yes |
| Refund/void | Yes | Yes | Optional | Limited |
| Discounts | Yes | Yes | Optional | Configurable |
| Menu configuration | Yes | Yes | No | No |
| Inventory adjustments | Yes | Yes | Yes | No |
| Waste entry | Yes | Yes | Yes | Optional |
| Financial reports | Yes | Yes | Yes | Limited |
| User/role administration | Yes | Limited | No | No |
| System settings | Yes | Yes | No | No |

## 14. Non-Functional Requirements

- Responsive on supported POS touchscreens, tablets, kiosk displays, and KDS screens.
- Localization-ready for currency, language, tax, time zone, date formats, and number formats.
- Database migrations must be backward-aware for rolling edge updates.
- API and event contracts must be versioned.
- Feature flags for staged rollout.
- Automated tests for domain logic, sync idempotency, payment adapters, inventory ledger behavior, and permissions.

## 15. Acceptance Criteria

- A cashier can create and complete an order with the WAN disconnected.
- The receipt/order remains available locally and synchronizes exactly once after reconnection.
- A KDS receives local orders immediately while offline and records prep timestamps.
- Split billing produces correct tender totals and a balanced order.
- Inventory depletion and waste records remain consistent after reconnect.
- Duplicate delivery webhooks do not create duplicate orders.
- Unauthorized roles cannot refund, change prices, or access restricted reports.
- Payment data handled by the POS never includes prohibited sensitive cardholder authentication data.
- Bluetooth printer configuration can be saved and tested from Settings.
- Cloud-published menu versions can be rolled back and safely applied to selected locations.

## 16. Suggested Repository Structure

Each business module is isolated in its own folder. Shared infrastructure must not absorb business-domain logic.

```text
MK-Foods/
├── docs/PRD.md
├── modules/
│   ├── auth/
│   ├── pos/
│   ├── payments/
│   ├── kds/
│   ├── drive-thru/
│   ├── kiosk/
│   ├── menu/
│   ├── inventory/
│   ├── waste/
│   ├── delivery/
│   ├── loyalty/
│   ├── reporting/
│   ├── sync/
│   ├── settings/
│   ├── api/
│   └── security/
├── apps/
│   ├── edge-pos/
│   ├── cloud-admin/
│   ├── kds/
│   └── kiosk/
├── packages/
│   ├── domain/
│   ├── ui/
│   └── shared/
└── tests/
```

## 17. Delivery Phases

### Phase 1 — Offline Core
Auth/RBAC, POS order entry, billing, local database, receipt printing, settings, sync queue, and basic KDS.

### Phase 2 — Restaurant Operations
Inventory, menu management, waste, cash sessions, reports, drive-thru timing, kiosk, and device management.

### Phase 3 — Cloud & Enterprise
Multi-location administration, centralized configuration, cloud analytics, backups, advanced audit, and enterprise reporting.

### Phase 4 — Integrations
Payment adapters, delivery platforms, loyalty, webhooks, external APIs, and automated reconciliation.

### Phase 5 — Optimization
Advanced forecasting, prep-time optimization, anomaly detection, observability improvements, and multi-region cloud resilience as scale requires.

## 18. Definition of Done

A module is production-ready only when its business rules, authorization checks, offline behavior, sync semantics, persistence, error handling, audit requirements, API contracts, automated tests, and operator-facing failure states are documented and tested. No module may require the cloud for its fundamental local transaction path unless explicitly marked as an external dependency such as card authorization or a third-party delivery service.
