# MK Foods POS — Production Readiness

## Ready in the application

- Offline cash/COD order processing.
- Inventory deduction and low-stock handling.
- Role-based authentication with password hashing, lockout and sessions.
- Audit logging.
- Sales, expenses, suppliers, procurement, delivery and kitchen workflows.
- Windows printer discovery/selection.
- Bluetooth LE and Bluetooth/COM printer connection paths.
- Banking merchant configuration screen.
- Digital-payment orders are never treated as settled merely because a reference was typed; they remain `pending_verification` until a trusted provider integration verifies them.
- Checkout tax, discount and delivery-fee calculation is shown consistently in the POS.

## Required before real online banking is live

1. Open/enable a merchant account with the bank or SBP-regulated payment provider.
2. Enable Raast P2M and/or the provider's merchant API.
3. Obtain the production merchant identifier and provider documentation/credentials.
4. Implement or obtain the provider's authenticated payment adapter and webhook endpoint.
5. Implement verification of transaction status, settlement, timeout, reversal and refund using the provider's signed/authenticated protocol.
6. Test in the provider sandbox and complete the provider/acquirer certification process before production.
7. Keep secrets outside renderer JavaScript and outside Git.

Raast P2M supports QR, alias, IBAN and Request-to-Pay acceptance. Merchants enable Raast through their bank or payment provider; this cannot be completed from POS software alone.

## Required before claiming payment compliance

The POS must be assessed against the merchant/acquirer requirements applicable to the chosen payment architecture. PCI DSS v4.0.1 is the current PCI DSS release, but compliance/certification is not something source code alone can grant. Use approved/validated payment terminals and a suitable provider/P2PE architecture where required.

## Required physical validation

- Connect every intended receipt/KDS printer model and test discovery, connection, printing and reconnect behavior.
- Test the exact Windows version and POS hardware used in production.
- Test payment terminals and bank QR/Raast flows with the real acquiring provider.
- Verify backup/restore of the local application data.
- Verify end-of-day cash reconciliation and settlement reports.

## Production rule

Never mark a digital payment as `settled` based only on a manually entered transaction/reference number. The application deliberately refuses to fake bank approval.