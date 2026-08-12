# Offline → Cloud Synchronization

## Architecture

**Local POS DB → Sync Queue → Sync Engine → Cloud API → Central DB**

The local database remains authoritative for immediate transaction capture while offline. Every mutation creates an immutable outbox event with device ID, location ID, user ID, entity ID, version, timestamp, and idempotency key.

## Sync Engine

- Device registration and authentication.
- Connectivity state monitor: Offline, Connecting, Online, Syncing, Error.
- Durable outbound queue and inbound cursor.
- Batch upload/download with exponential backoff and jitter.
- Idempotent API requests and deduplication.
- Retry after transient failures without duplicating orders/payments/inventory movements.
- Conflict resolution by entity/version policy; financial ledgers are append-only and never silently overwritten.
- Dead-letter queue for permanently rejected events with operator review.
- Cloud acknowledgements mark local events synchronized.
- Periodic cloud backup and health heartbeat.

## Multi-location

Every operational entity carries a location/branch scope. Central menu/configuration can publish versioned snapshots to locations. Inventory is location-specific and transfers are explicit ledger events. Reports aggregate centrally without modifying local source transactions.

## Recovery

- Resume from last acknowledged cursor after restart.
- Export/import encrypted business backup.
- Integrity checksums and schema migrations.
- Restore requires an explicit administrative operation and is audited.
