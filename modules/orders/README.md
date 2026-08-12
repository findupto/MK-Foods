# Orders System

## Order Entry

- Rapid touch-first item entry.
- Barcode scanning where applicable.
- Search, categories, favorites, quantities, notes, and modifiers.
- Order types: dine-in, takeaway, delivery, drive-thru, kiosk, and configured external channels.

## Modifiers

- Modifier groups with required/optional rules, min/max selections, price adjustments, availability, and kitchen instructions.
- Support requests such as extra cheese, no onions, spice level, and other configurable options.

## Order Lifecycle

Draft → Confirmed → Sent to Kitchen → Preparing → Ready → Fulfilled/Handed Off → Closed, with controlled cancellation/refund/void states.

Orders are immutable financial records after completion; corrections are represented by authorized adjustment, refund, or void events.

## Offline

Order creation, modification, local printing, KDS dispatch, and closing must continue through the edge system during WAN outages. Synchronization must be idempotent and preserve the original local event chronology.
