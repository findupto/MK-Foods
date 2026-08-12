# Inventory

- Actual on-hand quantities by location, unit and lot where applicable.
- Append-only stock ledger for receipts, sales consumption, adjustments, transfers, returns and waste.
- Recipes/BOM define ingredient quantities consumed per menu item/modifier.
- Sale completion posts ingredient consumption through idempotent inventory events.
- Stock adjustments require reason and permission.
- Inter-location transfers have source, destination, quantities, dispatch and receipt states.
- Physical stock counts support count sessions, variance approval and reconciliation.
- Low-stock/reorder alerts based on minimum, par and lead-time rules.
- Expiry tracking by lot/batch and expiry date with near-expiry alerts.
- Multi-location quantities and valuation are separated by branch.
- Offline inventory operations are queued for cloud synchronization.
