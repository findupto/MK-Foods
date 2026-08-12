# Payments

## Provider abstraction

`PaymentProvider` supports authorize, capture, sale, void, refund, reversal, status, terminal discovery and reconciliation. Provider adapters isolate EMV/card terminals from the POS core.

## Tender types

- Cash
- EMV chip/card
- NFC/contactless
- Digital wallets supported by the selected terminal/provider
- Configurable gateway tenders

Card credentials are handled by PCI-compliant hardware/provider APIs; raw PAN/CVV are never persisted in the POS database.

## Offline behavior

Cash can complete offline. Card behavior depends on the terminal/provider and must never be falsely reported as approved. Pending terminal transactions are reconciled when connectivity returns.

## Reconciliation

Record provider transaction ID, local payment ID, order ID, tender, amount, currency, status, timestamps, terminal/device ID and reconciliation state. Support mismatch detection, reversal/refund linkage and end-of-day settlement reports.
