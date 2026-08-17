# MK Foods POS — Phase 2 Upgrade

This phase focuses on making the existing restaurant POS faster and more operationally complete without replacing its offline-first architecture.

## Delivered direction
- Receipt Studio and Unicode-safe thermal printing
- Printer route diagnostics
- Print queue/reprint workflow
- Fast POS keyboard-first operation
- Dashboard operational KPIs
- Kitchen workflow
- Delivery/rider workflow
- Customer/loyalty foundation
- Menu/inventory controls

## Next implementation priorities
1. Product modifiers and recipes
2. Split/merge bills and partial payments
3. Table floor planner and table transfer
4. Kitchen stations with routing by category
5. Purchase orders and supplier invoice workflow
6. Recipe-level stock depletion and food-cost reporting
7. Barcode scanner mode
8. Cash drawer/open-close shift workflow
9. Manager approvals for voids, discounts and refunds
10. End-of-day reconciliation
11. Customer loyalty campaigns and stored credit
12. QR table ordering
13. Delivery zones and live dispatch board
14. Multi-terminal synchronization with conflict handling
15. Backup/restore and encrypted export
16. Audit log viewer with immutable event IDs
17. Role-based screen/action permissions
18. Advanced sales, margin, product and staff reports
19. Configurable receipt/kitchen ticket templates
20. Hardware health dashboard for printer, cash drawer and display

## Product principles
- Offline-first: sales must continue when internet is unavailable.
- No silent financial mutations: voids/refunds/discount overrides require an audit event.
- Hardware failures must never delete or lose an order.
- Every print job has a status and retry path.
- Unicode should render through graphics mode when printer firmware cannot encode the requested language.
- Keyboard, touch and barcode workflows should coexist.
- Settings should be configurable from the UI instead of requiring source-code changes.
