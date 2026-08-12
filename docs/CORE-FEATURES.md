# MK Foods POS — Core Features Requirements

## 1. Purpose

Extend the enterprise POS PRD with operational modules for daily management, people management, business control, transaction review, audit history, analytics, reporting, and high-volume search/filter workflows.

These features must remain **offline-first** at the location edge and synchronize with the cloud when connectivity is available.

## 2. Dashboard

### Requirements
- Show today's gross sales, net sales, refunds, discounts, tax, cash/card totals, and active orders.
- Show total money made for the selected business day and location.
- Show active/open orders with order number, order type, age, status, amount, and assigned counter person where applicable.
- Show current cash drawer/session state and expected cash when permitted by role.
- Show KDS backlog and overdue preparation counts.
- Show sync status: Online, Offline, Syncing, Failed, and last successful cloud sync.
- Allow authorized users to change date/location scope.
- Dashboard cards must load from the local database during offline operation.

### Performance
- Local dashboard summary p95 <= 500 ms for normal store-day data.
- Large historical analytics may be cloud-backed and asynchronously loaded.

## 3. Counter Persons

### Requirements
- Cashiers can securely sign in and access only permitted POS functions.
- Support quick cashier/PIN login where configured by management.
- Every order, discount, void, refund, drawer opening, and cash movement records the responsible staff member.
- Support cash drawer assignment and shift/session tracking.
- Prevent simultaneous unauthorized use of another cashier's session.
- Allow managers/admins to review active counter persons and current open orders.
- Cashier workflows must continue when WAN connectivity is unavailable.

## 4. Transactions History

### Requirements
- Search historical completed, voided, refunded, and cancelled orders.
- Search by receipt/order number, date range, customer, counter person, payment method, amount, order type, and location.
- Display receipt details, items, modifiers, discounts, taxes, tenders, timestamps, and responsible staff.
- Reprint receipts when a printer is available.
- Support authorized refunds with permission checks and reason capture.
- Preserve original financial records; refunds and corrections create new auditable transactions instead of destructive edits.
- Work against locally retained transaction history while offline.

## 5. History / Audit Activity

### Requirements
- Record security events, system configuration changes, cash drawer openings, shifts, refunds, voids, discounts, price changes, inventory adjustments, menu publication, user/role changes, printer configuration, sync failures, and daily operational actions.
- Each event includes actor, role, location, device, timestamp, event type, target entity, before/after values where appropriate, correlation ID, and reason where required.
- Audit records are append-only and tamper-evident.
- Authorized users can filter and export audit history.
- Audit history must be available locally for recent store operations and synchronized to cloud audit storage.

## 6. Customers

### Requirements
- Store customer name, phone, email, preferred contact method, notes, consent/status fields, and purchase history.
- Link customers to POS, kiosk, delivery, loyalty, and future ordering channels using a canonical customer ID.
- Search by name, phone, email, customer ID, and recent order number.
- Show customer purchase history subject to RBAC and privacy permissions.
- Support duplicate detection and controlled profile merging.
- Customer changes must be audited.
- Offline customer creation and updates are allowed; conflicts are reconciled by canonical ID/version rules.

## 7. Suppliers

### Requirements
- Store supplier/company name, contacts, address, payment/reference information, active status, and supplied inventory items.
- Link suppliers to ingredients, stock items, purchase receipts, and inventory movements.
- Support supplier search/filter by name, item, status, and location coverage.
- Track supplier reference numbers on purchase receipts.
- Support future purchasing/reorder workflows without coupling the supplier domain to a specific accounting system.

## 8. Staff

### Requirements
- Staff profiles include name, employee/reference ID, username, role, active status, assigned locations, work schedule, and security permissions.
- Support roles including Admin, Owner, Manager, Accountant, Cashier, Kitchen, and custom roles.
- Track shifts, clock-in/clock-out records, assigned drawer/session, and operational actions.
- Role permissions are granular by module and action: view, create, edit, discount, void, refund, export, configure, administer.
- Staff security changes require audit events.
- Staff records required for local operation must be cached at the edge.

## 9. Settings

### Requirements
- Business profile: MK Pizza & Ice Bar, Collage Road Abbas Chowk, Bhakkar, Pakistan, 0316 9700025.
- Currency: Rs.
- Default tax: 0%.
- Configure Bluetooth printer MAC address, printer name, receipt width, test print, and connection status.
- Configure receipt layout, business header/footer, order numbering, tax behavior, rounding, payment methods, operating hours, and location settings.
- Configure drive-thru SLA thresholds, KDS colors/timers, kiosk timeout, inventory policies, and sync behavior where authorized.
- Settings are versioned and auditable.
- High-impact settings require Admin/Owner permissions.
- Location edge keeps the last known valid settings package for offline operation.

## 10. Analytics

### Requirements
- Visualize sales, orders, average order value, item performance, cashier performance, payment mix, refunds, discounts, inventory movement, waste, KDS prep time, and drive-thru timing.
- Charts support day, week, month, custom range, location, channel, category, item, and staff dimensions where applicable.
- Provide trend comparisons such as current period vs previous period.
- Support drill-down from a metric into its underlying transactions where permissions allow.
- Local operational analytics use edge data while offline; enterprise cross-location analytics use cloud data after synchronization.
- Analytics must clearly identify incomplete/sync-pending data.

## 11. Reports

### Required reports
- Daily sales summary.
- Sales by item/category.
- Sales by counter person.
- Payment/tender report.
- Refund and void report.
- Discount report.
- Tax report.
- Cash drawer and shift reconciliation.
- Inventory stock and movement report.
- Waste report.
- Supplier/purchase report.
- Customer purchase report.
- KDS preparation report.
- Drive-thru timing report.
- Sync/error report.
- Audit activity report.

### Export
- CSV for operational data exports.
- PDF for printable management reports.
- Role-based export permissions.
- Large cloud reports may be generated asynchronously.

## 12. Filters and Sorting

All large list screens must expose reusable filtering and sorting capabilities.

### Common filters
- Date/date range.
- Location.
- Amount/price range.
- Staff/counter person.
- Customer.
- Supplier.
- Item/category.
- Order type.
- Payment method.
- Transaction status.
- Refund/void/discount state.
- Inventory status.
- Audit event type.
- Sync state.

### Sorting
- Newest/oldest.
- Highest/lowest amount.
- Alphabetical item/customer/supplier name.
- Staff member.
- Status.
- Priority/age for operational queues.

### UX requirements
- Search should support partial matching and normalized phone numbers where relevant.
- Filters can be combined with AND semantics by default.
- Clear-all filters must be available.
- Frequently used filters can be saved per user/device where permitted.
- Pagination or virtualized lists must prevent large datasets from blocking the UI.
- Filter state must survive refresh/navigation where practical.
- Offline lists filter the local dataset and must not imply cloud completeness.

## 13. Authorization Matrix Additions

| Module | Admin | Owner | Accountant | Cashier |
|---|---:|---:|---:|---:|
| Dashboard | Full | Full | Financial | Operational |
| Counter Persons | Full | Full | View | Self |
| Transactions History | Full | Full | Financial | Own/Allowed |
| Audit History | Full | Full | View | No |
| Customers | Full | Full | View | Create/View |
| Suppliers | Full | Full | Full | View |
| Staff | Full | Manage | View | No |
| Settings | Full | Full | No | Device-only if enabled |
| Analytics | Full | Full | Financial | Limited |
| Reports | Full | Full | Full | Limited |
| Filters | Full | Full | Full | Allowed data scope |

## 14. Offline and Sync Acceptance Criteria

- Dashboard remains usable without internet using current local-day data.
- Cashiers can log in and complete sales while offline.
- Transaction history shows locally available historical orders during an outage.
- Audit events are recorded locally and uploaded after reconnect.
- Customer, supplier, and staff data required for active workflows remain available locally.
- Settings changes are versioned; edge devices continue using the last valid package during cloud outages.
- Analytics/reports identify when data is locally scoped or not fully synchronized.
- Filters work identically against local and cloud datasets within the available data scope.
- Sync retries are idempotent and never duplicate financial transactions or audit events.

## 15. Source References

The feature direction was additionally informed by the references supplied with the requirements:

1. https://cisepos.com/point-of-sale-dashboard-benefits-for-retailers/
2. https://qloapps.com/qloapps-point-of-sales-system/
3. https://pages.365retailmarkets.com/hubfs/Resources%20Page%20PDFs/ADM-CapabilitiesPager.pdf
4. https://www.almiriatechstore.co.ke/point-of-sale-pos-the-small-business-basic/
5. https://ivend.com/retail/whats-coming-in-ivend-pos-6-4/
6. https://www.techfunnel.com/martech/pos-system-features/
7. https://velosiaims.com/point-of-sale-system-pos-features/
8. https://www.getapp.com/customer-management-software/point-of-sale/
9. https://www.goodfirms.co/point-of-sale-software/
10. https://albadrsales.com/en/cashier-software/
11. https://finalpos.com/blog/how-to-use-a-pos-system-a-step-by-step-tutorial
12. https://docs.daftra.com/en/tutorial/pos-settings/
13. https://hikeup.com/retail-pos/
14. https://www.eats365pos.com/sg/blog/post/restaurant-pos-features-singapore
15. https://www.ibm.com/think/topics/sales-analytics
