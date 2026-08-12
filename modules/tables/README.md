# Tables Management

## Floor Plan

- Visual floor-plan editor for dining areas.
- Tables have stable IDs, names/numbers, capacity, zone, position, shape, and active status.
- Support configurable layouts for different locations.

## Table Status

Supported statuses include Open, Reserved, Seated, Ordered, Partially Paid, Paid, Cleaning, and Out of Service.

## Table Operations

- Open order against a table.
- Transfer a table/order to another table.
- Merge or split tables according to configured permissions.
- Split bills by guest, item, quantity, seat, or amount.
- Preserve order and payment audit history through transfers.

## Offline

Floor plans and table state required for active service are cached at the edge. Table operations remain available during WAN outages and synchronize as events after reconnect.
