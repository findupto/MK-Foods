# Delivery & Rider Management

## Core Features

- **Order Dispatch:** Instantly assign completed orders to available drivers with one click; support manual reassignment, unassignment, priority orders, and dispatch timestamps.
- **Live GPS Tracking:** Receive rider location updates when the rider app and permissions allow it; display active riders, estimated delivery time, last-known location, and connection state. GPS is privacy-controlled and must not be assumed available when the device is offline.
- **Rider Profiles:** Store staff details, active shifts, vehicle information, availability, assigned delivery zones, performance, and permissions.
- **Route Planning:** Build delivery routes from active orders and destinations, group compatible stops, and expose optimized route guidance through a mapping provider adapter. Preserve a usable manual route mode when routing services are unavailable.
- **Cash-on-Delivery (COD) Logs:** Record amount due, amount collected, digital payment reference where applicable, rider cash handover, settlement time, variance, and approval status. COD reconciliation must be auditable.

## Operational Workflow

1. Completed delivery order enters the dispatch queue.
2. Dispatcher sees eligible available riders by zone, shift, capacity, and status.
3. Dispatcher assigns the order and rider receives the task.
4. Rider accepts/rejects or auto-accept policy assigns it.
5. Rider statuses: Available, Assigned, Picked Up, En Route, Arrived, Delivered, Failed, Returned, Offline.
6. Delivery completion captures proof/status and payment collection result.
7. Cash collections enter rider settlement and reconciliation.

## Mobile Rider App

- Secure rider login and device registration.
- Today's assigned deliveries and destination list.
- Order details, customer contact controls, delivery notes, and navigation handoff.
- Status updates that work offline and synchronize later.
- COD amount and collection confirmation.
- Delivery completion, failed-delivery reason, return workflow, and optional proof-of-delivery capture.
- Background location is configurable and consent-aware; location collection must follow applicable privacy requirements.

## Offline Requirements

- Rider app caches assigned deliveries and required destination data.
- Status changes are persisted locally with immutable event IDs and synchronized when connectivity returns.
- Last-known GPS position is timestamped and clearly marked stale when offline.
- No duplicate delivery completion, payment collection, or settlement events after retry.

## Dispatch & Performance Analytics

Track assignment time, acceptance time, pickup time, dispatch-to-delivery duration, delivery SLA, failed deliveries, rider utilization, orders per rider, COD variance, fuel/route metrics when available, and zone performance.

## Security

- RBAC separates dispatcher, rider, manager, accountant, and admin capabilities.
- Rider location is accessible only to authorized operational roles.
- Customer addresses and phone numbers are protected as sensitive operational data.
- Every assignment, reassignment, status change, COD adjustment, and settlement is audited.
