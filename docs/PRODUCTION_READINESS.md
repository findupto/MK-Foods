# MK Foods POS — Enterprise Production Readiness

## Implemented application controls

- Offline-first cash/COD order processing.
- Inventory deduction and low-stock handling.
- Role-based authentication with PBKDF2 password hashing, lockout and sessions.
- Audit logging.
- Sales, expenses, suppliers, procurement, delivery and kitchen workflows.
- Windows printer discovery/selection plus Bluetooth/COM printer paths.
- Banking merchant configuration screen.
- Digital-payment orders remain `pending_verification` until a trusted provider integration verifies them.
- Checkout tax, discount and delivery-fee calculation is handled consistently in the POS.
- Cloud sync API with idempotency keys, rate limiting, request IDs, bounded payloads and location-scoped event streams.
- Cloud sync persistence is file-backed with atomic replacement and a previous-store backup so a process restart does not discard accepted events.
- Production cloud mode requires API authentication by default and supports an explicit approved CORS origin.
- Security response headers are emitted by the cloud API and secrets are configured through environment variables rather than source code.

## Enterprise deployment requirements

1. Run the cloud API behind HTTPS/TLS using the organization's approved reverse proxy or load balancer.
2. Store `MK_FOODS_API_KEY` in a managed secret store; never commit it to Git.
3. Set `MK_FOODS_REQUIRE_AUTH=true` and a specific `MK_FOODS_CORS_ORIGIN` in production.
4. Put `MK_FOODS_DATA_DIR` on encrypted, backed-up storage. For multi-instance/high-volume deployments, replace the file-backed event store with PostgreSQL or another HA transactional datastore.
5. Back up the cloud event store and local POS application data according to the organization's RPO/RTO policy.
6. Use separate credentials and locations/tenants for each deployment; do not share production API keys across unrelated environments.
7. Connect every intended receipt/KDS printer model and verify discovery, printing, reconnect and failure recovery.
8. Test the exact Windows version and POS hardware used in production.
9. Test payment terminals and bank QR/Raast flows with the real acquiring provider.
10. Verify end-of-day cash reconciliation, inventory reconciliation, backup/restore and disaster recovery.

## Online banking / Raast

Before real online banking is enabled, the business must onboard with the selected bank or SBP-regulated payment provider, obtain production credentials, implement the provider's authenticated adapter/webhook verification, test in sandbox and complete the provider/acquirer certification process.

The POS must never mark a digital payment as `settled` merely because a user typed a transaction/reference number.

## Compliance boundary

PCI DSS v4.0.1 and other regulatory/compliance requirements cannot be granted by source code alone. Use approved payment terminals, provider/P2PE architecture and the applicable merchant/acquirer compliance process.

## Enterprise status

The repository now has the core controls for an enterprise-oriented offline POS plus a hardened persistent sync service. Production certification still depends on infrastructure, payment-provider certification, physical hardware validation, backups, monitoring and the chosen organization's compliance requirements.
