# Payments, Banking and Printer Readiness

## Online banking in Pakistan

MK Foods POS must not invent or simulate a bank connection. A real connection requires merchant onboarding with a bank, 1LINK/Raast participant, or payment gateway and then a certified adapter.

The POS now provides a **Banking** screen for the non-secret merchant profile:

- provider and environment
- merchant ID
- bank/provider name
- account title
- IBAN
- Raast alias
- provider API base URL
- webhook URL
- Bank Transfer / Raast as an order tender

The tender is recorded on the order, but the application must not mark an online payment as approved until the provider adapter returns a verified transaction status/ID. API secrets, card PAN and CVV must never be stored in the renderer or POS database.

### Recommended Pakistan integration path

1. Ask the business bank/payment provider to enable **Raast P2M** for the merchant account.
2. Obtain the provider's sandbox credentials and API specification.
3. Implement the provider adapter on the trusted/native side, not in renderer JavaScript.
4. Handle payment notification, status inquiry, timeout, reversal and refund.
5. Reconcile provider transaction IDs with local order/payment IDs at end of day.
6. Complete provider certification before enabling production payments.

Raast P2M supports merchant acceptance through Request to Pay, IBAN, merchant alias and static/dynamic QR. 1LINK exposes P2M merchant, QR and RTP APIs and requires registration/certification for API use. See the official provider documentation before production onboarding.

## Printer readiness

The current printer screen supports:

- Windows-installed USB/network/shared printers through the native Tauri command
- Bluetooth LE discovery and writable-characteristic selection
- Bluetooth/COM printers through Web Serial
- test printing and explicit disconnect
- saved printer selection

A physical printer cannot be declared connected from software alone. Production validation still requires a real test on every printer model/connection type used by the store, including paper width, cutter, cash drawer and encoding.

## Global standards target

The POS architecture should be treated as **standards-aligned**, not certified. Before commercial deployment, complete the applicable assessments for:

- PCI DSS for the payment environment and any card-processing scope
- EMV/terminal/provider certification for card acceptance
- ISO 20022/provider-specific requirements where applicable to bank rails
- WCAG accessibility requirements for the user interface
- OWASP application-security testing and secure secret handling
- Local tax, invoicing, consumer-protection and privacy requirements

Certification belongs to the merchant, acquiring bank/payment provider, hardware vendor and deployment environment; source code alone cannot confer certification.
