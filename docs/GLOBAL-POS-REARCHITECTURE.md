# MK Foods — Global POS Re-Architecture

## Direction
MK Foods is being repositioned from a collection of renderer modules into an integrated restaurant commerce platform. The target is not a visual copy of another vendor; it is a compatible feature model inspired by mature POS/ERP products while keeping MK Foods' own code, UX and offline-first architecture.

## Product domains

1. **Front Office / POS**
   - Fast item search, categories, favorites, barcode scanner, variants, modifiers, bundles, notes
   - Hold/resume orders, open tickets, duplicate, merge, split, transfer, void, refund, exchange
   - Dine-in, takeaway, delivery, pickup, counter, drive-through
   - Multiple payment methods, split/partial payments, tips, change, customer credit
   - Keyboard/touch shortcuts and configurable quick actions

2. **Order Orchestration**
   - One order ID from creation through kitchen, counter, delivery and settlement
   - Immutable event timeline
   - State machine with guarded transitions
   - Assignment to station, employee, terminal and location
   - SLA timers, overdue alerts and recovery actions

3. **Restaurant / Tables**
   - Floor plans, rooms, sections, tables, seats
   - Table status, server assignment, merge/split/transfer
   - Open checks and course/fire timing
   - Reservation and waitlist foundation

4. **Kitchen / KDS**
   - Station routing by item/category/modifier
   - KOT printing and KDS tickets
   - New / acknowledged / preparing / ready / served / voided
   - Item-level status and partial readiness
   - Expo/runner workflow
   - Prep-time and SLA analytics

5. **Delivery**
   - Customer, phone, full address, landmark, instructions, zone
   - Delivery fee rules and minimum order
   - Rider assignment, dispatch, picked-up, en-route, delivered, failed
   - COD settlement and delivery receipt
   - Delivery order source tracking

6. **Catalog / Menu**
   - Categories, products, variants, modifiers, recipes, bundles
   - Price lists, tax rules, discounts, promotions
   - Availability schedules and out-of-stock controls
   - Barcode/SKU/PLU and custom fields

7. **Inventory / Procurement**
   - Warehouses and locations
   - Stock ledger, transfers, adjustments, counts
   - Purchase requests, POs, GRNs, supplier invoices
   - Reorder points and low-stock alerts
   - Recipe consumption and theoretical vs actual usage
   - Waste, spoilage and variance

8. **CRM / Loyalty**
   - Customer profiles and timeline
   - Addresses and preferences
   - Points, tiers, credits, gift cards
   - Offers, campaigns, referrals
   - Purchase history and segmentation

9. **Finance**
   - Cash sessions and tills
   - Cash in/out, safe drops
   - Payment reconciliation
   - Expenses
   - Tax summary
   - Accounts, journals and cost centers
   - End-of-day close

10. **People / Security**
    - Employees, roles, permissions and approval policies
    - PIN login
    - Shifts and attendance
    - Manager overrides
    - Discount/void/refund approvals
    - Immutable audit trail

11. **Reporting / BI**
    - Sales, margin, tax, payment, product, category and hourly reports
    - Employee and shift performance
    - Kitchen SLA and prep-time reports
    - Delivery performance
    - Inventory valuation and variance
    - Customer retention and loyalty
    - Multi-location consolidated reporting
    - CSV/PDF export

12. **Hardware / Printing**
    - Thermal receipt printer as the default printer profile
    - 58mm and 80mm
    - Windows RAW, network RAW and Bluetooth routes
    - Unicode-safe raster printing
    - KOT/KDS printer routing
    - Customer display, cash drawer and barcode scanner integration
    - Print queue with retry/reprint/audit

13. **Receipt / Document Designer**
    - Admin-only template editor
    - Receipt, KOT, delivery, refund, payment and end-of-day templates
    - Blocks: text, image, line, table, totals, QR/barcode, custom fields
    - Themes, typography, spacing, alignment and conditional blocks
    - Preview using real order data
    - Test print
    - Template versioning and restore

14. **Administration**
    - Business profile, branches, counters and terminals
    - Tax/currency/rounding rules
    - Order types and workflows
    - Printers and routing rules
    - Receipt templates
    - Payment methods
    - Roles and approvals
    - Notifications
    - Backup/restore
    - Import/export
    - System diagnostics

15. **Omnichannel / Integrations**
    - QR ordering
    - Online orders
    - Delivery aggregators
    - Accounting/API/webhooks
    - WhatsApp/SMS/email adapters
    - Payment gateway adapters

## Architectural rules

### Transaction boundary
A completed sale must atomically create/update the order, payment, stock movements, customer history and accounting events. Partial success is not acceptable.

### Event history
Order status changes are append-only events. Current status is a projection. This makes tracking, audit and recovery reliable.

### Offline-first
The local SQLite/domain store is authoritative during offline operation. Sync uses idempotency keys, operation IDs, version numbers and conflict rules. No sale is discarded because connectivity is unavailable.

### Printing
Printing is asynchronous. A transaction never waits for printer success to become financially valid. Every document gets a print job ID, state, attempts, printer profile and error details.

### Permissions
UI visibility is not security. Every privileged operation must be checked at the domain/native boundary as well as the renderer.

### Money
Use integer minor units internally where possible; never use floating point for financial persistence. Tax and rounding rules are explicit and configurable.

### IDs
Every business record has a stable UUID plus a human-readable document number. Sync and retries must never create duplicate business transactions.

### Extensibility
New payment methods, printer transports, integrations, reports and document blocks must be adapters/plugins instead of modifications to the core transaction engine.

## Canonical order lifecycle

`DRAFT → CONFIRMED → ROUTED → PREPARING → READY → COUNTER/DELIVERY → SETTLED → COMPLETED`

Side transitions:

`DRAFT → CANCELLED`
`CONFIRMED → VOIDED`
`SETTLED → REFUNDED/PARTIALLY_REFUNDED`
`DELIVERY → FAILED/RETURNED`

Each transition records who, when, terminal, reason and source.

## Delivery lifecycle

`ADDRESS_REQUIRED → READY_FOR_DISPATCH → ASSIGNED → PICKED_UP → EN_ROUTE → DELIVERED`

Failure states: `CANCELLED`, `FAILED`, `RETURNED`.

## Document types

- Customer receipt
- Sale invoice
- Kitchen KOT
- Kitchen reprint
- Delivery ticket
- Delivery receipt
- Payment receipt
- Refund receipt
- Cash session report
- End-of-day report

## Build quality gates

Before an installer is considered production-ready:

1. renderer syntax/integrity tests pass
2. domain/store tests pass
3. workflow tests pass
4. printer contract tests pass
5. production hardening tests pass
6. Tauri validation passes
7. x64 installer builds
8. x86 installer builds
9. ARM64 builds only when ARM64 MSVC is installed
10. manual smoke test covers POS → KDS → counter → payment → print → history → reprint and delivery → dispatch → delivery receipt
