# Users & Permissions

## Staff Roles
- Support cashier, waiter, kitchen, rider, dispatcher, accountant, manager, owner, admin, and custom roles.
- Permissions are action-based and least-privilege: view, create, edit, void, refund, discount, reopen, export, configure, approve, and administer.

## Security Controls
- Manager/authorized approval can be required for voids, refunds, high-value discounts, cash adjustments, and other sensitive operations.
- Every privileged action records user, device, location, timestamp, reason where applicable, and affected entity.
- Bootstrap accounts use the documented initial credentials only for onboarding and must change password before production use.

## Time Clock
- Clock in/out, break records, shift assignment, attendance corrections, and worked-hour summaries.
- Prevent impossible overlapping shifts and require authorized correction for edited time records.
- Shift data remains locally available during WAN outages and synchronizes afterward.

## Offline Access
Staff authorization data required for active POS operation is cached securely at the edge. Permission changes published from the cloud become active only after a validated configuration sync.
