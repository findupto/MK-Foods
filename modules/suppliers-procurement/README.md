# Suppliers & Procurement

## Vendor Database

- Supplier profile with legal/contact details, lead times, delivery zones, payment terms, credit limits, and active status.
- Supplier-specific product catalogs, SKUs, units, pack sizes, costs, minimum order quantities, and preferred supplier ranking.
- Cost history and supplier performance history.

## Purchase Orders

- Create, edit, approve, send, receive, partially receive, cancel, and close POs.
- Generate POs from reorder thresholds or manually.
- Track PO number, supplier, requested items, expected delivery, status, received quantities, and outstanding quantities.
- Offline creation is supported locally; cloud publishing occurs during synchronization.

## Goods Receipt & Barcoding

- Scan item/barcode and match against open PO lines.
- Record received, damaged, missing, and substituted quantities.
- Update stock through append-only inventory ledger entries.
- Support partial shipments and multiple receipts against one PO.

## Accounts Payable

- Record supplier invoices, due dates, invoice numbers, credit terms, partial payments, outstanding balances, and payment references.
- Reconcile invoice quantities/costs against received goods.
- Keep accounting exports separate from destructive edits to operational inventory data.

## Cost & Price Updates

- Maintain supplier cost history.
- Configurable pricing rules can calculate suggested retail prices from updated costs and target margins.
- Price changes require permission and audit logging; they must not silently alter already completed orders.

## Controls & Analytics

- Low-stock triggers identify suggested reorder quantities and preferred vendors.
- Supplier reports cover fill rate, lead-time accuracy, cost changes, shortages, damages, and delivery performance.
- Procurement and AP actions are audited.
