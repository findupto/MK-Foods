# Customers & Loyalty

## Customer Profiles

Store buyer name, phone, email, birthday when voluntarily provided, communication preferences, loyalty account, purchase history, favorite items, notes, and consent state.

## Rewards

- Points, visits, VIP tiers, and store credits.
- Configurable earn, redeem, expiry, bonus, and promotion rules.
- Prevent duplicate awards during offline synchronization using idempotent event IDs.
- Support customer lookup during checkout without requiring cloud connectivity.

## Purchase History & Insights

- Search historical receipts and orders.
- Show favorite items, visit frequency, average order value, spend, and channel usage.
- Segment customers by configurable criteria for analytics and promotions.

## Targeted Promotions

- Create customer segments and eligible offers.
- SMS/email delivery through provider adapters.
- Track campaign status, delivery results, redemption, and unsubscribe/consent state.
- Do not send marketing communications without the required customer consent.

## Acceptance Criteria

- Customer can be attached to an order in seconds from POS.
- Offline purchases remain associated with the local customer record and synchronize safely.
- Rewards are not double-awarded after retries.
- Authorized staff can view customer history while sensitive fields and exports remain permission-controlled.
