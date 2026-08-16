# Bluetooth Thermal Printer Architecture

MK Foods POS treats Bluetooth printing as a transport problem rather than assuming every thermal printer behaves like a Windows spooler printer.

## Discovery paths

1. **Windows PnP / BTHENUM** — discovers paired Bluetooth devices exposed through Windows Plug-and-Play.
2. **Bluetooth SPP virtual COM ports** — discovers `Win32_SerialPort` devices backed by the Bluetooth SPP service. This catches many inexpensive ESC/POS printers that do not appear as printer queues.
3. **Windows printer spooler** — discovers installed printer queues. A paired Bluetooth printer can be connected through its existing Windows queue even when direct Bluetooth access is unavailable.
4. **Manual MAC / COM fallback** — an operator can enter a Bluetooth MAC address or `COMx` SPP port when Windows exposes the device but does not provide a useful friendly record.

## Connection paths

### Direct Bluetooth Classic SPP

The Tauri backend opens an RFCOMM socket using the standard Serial Port Profile UUID and sends raw ESC/POS bytes. This avoids the Windows print spooler and is the preferred path when the printer exposes a stable Bluetooth MAC address.

### Bluetooth SPP virtual COM

The backend writes raw ESC/POS bytes directly to the Windows virtual COM device. This is useful for printers that pair as a serial device and is often more compatible with low-cost receipt printers.

### Windows RAW spooler

The existing Windows RAW path sends ESC/POS bytes to an installed Windows printer queue. It remains an important fallback because vendor drivers and Windows Bluetooth pairing can expose a reliable queue even when direct SPP is blocked.

## Operator workflow

The Printers screen scans all supported discovery surfaces together and shows the discovered transport evidence. Each device can expose independent **Direct SPP**, **SPP COM**, and **Windows Queue** connection actions. Every connection attempt sends a real ESC/POS test print before the route is saved.

## Production validation

Validate the exact printer model, firmware, Windows version, Bluetooth adapter and paper width used in production. Bluetooth printer behavior varies significantly by vendor; some devices use proprietary BLE services and cannot accept generic ESC/POS over Classic SPP or a serial port.

For enterprise deployments, configure a primary printer plus a tested fallback route for receipt/KOT/expo output and verify reconnect behavior after Bluetooth sleep, Windows restart, printer power cycling and temporary radio loss.
