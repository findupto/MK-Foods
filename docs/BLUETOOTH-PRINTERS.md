# Bluetooth Thermal Printer Architecture

MK Foods POS treats thermal printing as a transport problem instead of assuming every device is a Windows spooler printer.

## Discovery paths

1. **Windows PnP / BTHENUM** — discovers paired Bluetooth devices exposed through Windows Plug-and-Play.
2. **Bluetooth SPP virtual COM ports** — discovers `Win32_SerialPort` devices backed by the Bluetooth SPP service. This catches many inexpensive ESC/POS printers that do not appear as printer queues.
3. **Windows printer spooler** — discovers installed printer queues. A paired Bluetooth printer can be connected through its existing Windows queue even when direct Bluetooth access is unavailable.
4. **Manual MAC / COM fallback** — an operator can enter a Bluetooth MAC address or `COMx` SPP port when Windows exposes the device but does not provide a useful friendly record.

## Connection paths

### Direct Bluetooth Classic SPP

The Tauri backend opens an RFCOMM socket using the standard Serial Port Profile UUID and sends raw ESC/POS bytes. The connection is retried up to three times to tolerate short Bluetooth wake/reconnect delays.

### Bluetooth SPP virtual COM

The backend writes raw ESC/POS bytes directly to the Windows virtual COM device. This is useful for printers that pair as a serial device and is often more compatible with low-cost receipt printers.

### Windows RAW spooler

The existing Windows RAW path sends ESC/POS bytes to an installed Windows printer queue. It remains an important fallback because vendor drivers and Windows Bluetooth pairing can expose a reliable queue even when direct SPP is blocked.

### Network RAW / TCP 9100

Network-capable thermal printers can be tested and saved by IP address and TCP port, defaulting to port `9100`. The backend retries failed connections before reporting the print job as failed.

## Route persistence

A successful connection stores both the friendly printer name and the transport metadata (`printerConnection`, Bluetooth MAC/COM, or network IP/port). The Print Center resolves that saved route when it sends a receipt, so a Bluetooth printer is not accidentally treated as a Windows queue just because it has a friendly name.

## Operator workflow

The Printers screen scans the supported discovery surfaces together and exposes independent **Direct SPP**, **SPP COM**, **Windows Queue**, and manual/network connection options. Every connection attempt sends a real ESC/POS test print before the route is saved.

## Production validation

Validate the exact printer model, firmware, Windows version, Bluetooth adapter and paper width used in production. Some devices use proprietary BLE services and cannot accept generic ESC/POS over Classic SPP or a serial port.

For enterprise deployments, configure a primary printer plus a tested fallback route for receipt/KOT/expo output and verify reconnect behavior after Bluetooth sleep, Windows restart, printer power cycling and temporary radio loss.
