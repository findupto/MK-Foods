# Printer Runtime

## Drivers

Provide adapters for ESC/POS thermal printers over Bluetooth, USB and TCP/network. A capability model detects paper width, cutter, cash-drawer pulse and encoding support.

## Discovery

- Bluetooth discovery scans paired/visible devices where the OS permits it.
- USB enumeration detects compatible printers.
- Network discovery may use configured IP/hostname or supported discovery protocols.
- Store stable device identifiers and preferred connection method.

## Auto reconnect

At application startup, load saved printer profiles, test availability, reconnect when possible, and expose clear Offline/Connected/Error state. Never silently select an unrelated device.

## Queue

Print jobs have durable IDs, priority, retry count, status, timestamps and error details. Retry transient failures with backoff; prevent duplicate ticket printing after ambiguous failures using printer/job identifiers.

## Routing/templates

Route receipt, kitchen, bar, delivery and cash-drawer jobs by station. Templates support business header, order details, taxes, payment, footer, QR/barcode and copy labels.
