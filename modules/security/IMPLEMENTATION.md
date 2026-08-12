# Security Implementation

- Argon2id password hashing with unique random salts; never store plaintext passwords.
- Password change requires current credential or authorized recovery flow; reset tokens are single-use, short-lived, and audited.
- PIN login is a configurable local POS convenience credential, separate from the primary password and protected by the same lockout policy.
- Session timeout, idle timeout, logout, device/session revocation, and re-authentication for sensitive actions.
- Account lockout with escalating delay after repeated failures; security events are audited.
- Backend authorization checks every IPC/API command. UI visibility is not a security boundary.
- Permissions cover refunds, voids, discounts, cash drawer, inventory adjustment, menu administration, exports, settings, and user administration.
- Sensitive data is encrypted at rest where practical and TLS is mandatory for cloud transport.
- Production payment card data must never be stored by the POS; use PCI-compliant terminal/tokenization providers.
