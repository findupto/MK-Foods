(() => {
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let bluetoothDevice = null;
  let bluetoothServer = null;
  let bluetoothCharacteristic = null;
  let serialPort = null;
  let serialWriter = null;

  const BLE_SERVICE_CANDIDATES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455'
  ];
  const BLE_CHARACTERISTIC_CANDIDATES = [
    '00002af1-0000-1000-8000-00805f9b34fb',
    '49535343-8841-43f4-a8d4-ecbe34729bb3',
    '49535343-1e4d-4bd9-ba61-23c647249616'
  ];

  function bluetoothSupported() {
    return !!navigator.bluetooth;
  }

  function serialSupported() {
    return !!navigator.serial;
  }

  async function findWritableCharacteristic(server) {
    for (const serviceId of BLE_SERVICE_CANDIDATES) {
      try {
        const service = await server.getPrimaryService(serviceId);
        for (const characteristicId of BLE_CHARACTERISTIC_CANDIDATES) {
          try {
            const c = await service.getCharacteristic(characteristicId);
            if (c.properties.write || c.properties.writeWithoutResponse) return c;
          } catch (_) {}
        }
        const chars = await service.getCharacteristics();
        const c = chars.find(x => x.properties.write || x.properties.writeWithoutResponse);
        if (c) return c;
      } catch (_) {}
    }

    const services = await server.getPrimaryServices();
    for (const service of services) {
      const chars = await service.getCharacteristics();
      const c = chars.find(x => x.properties.write || x.properties.writeWithoutResponse);
      if (c) return c;
    }
    throw new Error('No writable Bluetooth printer characteristic was found.');
  }

  async function connectBluetooth() {
    if (!bluetoothSupported()) throw new Error('Bluetooth LE is not available in this Windows WebView.');
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_SERVICE_CANDIDATES
    });
    bluetoothDevice.addEventListener('gattserverdisconnected', () => {
      bluetoothServer = null;
      bluetoothCharacteristic = null;
      renderBluetoothState();
    });
    bluetoothServer = await bluetoothDevice.gatt.connect();
    bluetoothCharacteristic = await findWritableCharacteristic(bluetoothServer);
    await window.mkFoods.updateSettings({
      printerName: bluetoothDevice.name || 'Bluetooth Printer',
      printerMac: bluetoothDevice.id || '',
      printerConnection: 'bluetooth-le'
    });
    await load();
    renderBluetoothState();
  }

  async function connectSerial() {
    if (!serialSupported()) throw new Error('Web Serial is not available in this Windows WebView.');
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 9600 });
    serialWriter = serialPort.writable?.getWriter();
    await window.mkFoods.updateSettings({
      printerName: 'Bluetooth / COM Printer',
      printerMac: '',
      printerConnection: 'serial'
    });
    await load();
    renderBluetoothState();
  }

  async function disconnectBluetooth() {
    try { bluetoothDevice?.gatt?.disconnect(); } catch (_) {}
    bluetoothDevice = null;
    bluetoothServer = null;
    bluetoothCharacteristic = null;
    try { serialWriter?.releaseLock(); } catch (_) {}
    serialWriter = null;
    try { await serialPort?.close(); } catch (_) {}
    serialPort = null;
    renderBluetoothState();
  }

  async function testBluetoothPrint() {
    const text = '\x1b@MK Foods POS\nBluetooth printer connected\n\n\x1dV\x00';
    const data = new TextEncoder().encode(text);
    if (bluetoothCharacteristic) {
      for (let i = 0; i < data.length; i += 180) {
        const chunk = data.slice(i, i + 180);
        if (bluetoothCharacteristic.properties.writeWithoutResponse) await bluetoothCharacteristic.writeValueWithoutResponse(chunk);
        else await bluetoothCharacteristic.writeValue(chunk);
      }
      return;
    }
    if (serialWriter) {
      await serialWriter.write(data);
      return;
    }
    throw new Error('Connect a Bluetooth printer first.');
  }

  function renderBluetoothState() {
    const box = document.getElementById('bluetoothState');
    if (!box) return;
    const connected = !!bluetoothCharacteristic || !!serialWriter;
    box.innerHTML = connected
      ? `<div class="notice"><b>Bluetooth printer connected</b><br><span class="muted">${e(bluetoothDevice?.name || 'Bluetooth / COM printer')}</span><div class="toolbar" style="margin-top:10px"><button class="mini" onclick="testBluetoothPrint()">Test Print</button><button class="mini secondary" onclick="disconnectBluetooth()">Disconnect</button></div></div>`
      : `<div class="notice">No live Bluetooth printer connection.</div>`;
  }

  window.connectBluetooth = async () => {
    try { await connectBluetooth(); } catch (err) { alert(err?.message || String(err)); }
  };
  window.connectBluetoothSerial = async () => {
    try { await connectSerial(); } catch (err) { alert(err?.message || String(err)); }
  };
  window.disconnectBluetooth = disconnectBluetooth;
  window.testBluetoothPrint = async () => {
    try { await testBluetoothPrint(); alert('Test print sent.'); } catch (err) { alert(err?.message || String(err)); }
  };

  window.refreshPrinters = async () => {
    const box = document.getElementById('printerList');
    if (box) box.innerHTML = '<p class="muted">Searching Windows printers...</p>';
    const r = await window.mkFoods.discoverPrinters();
    if (r?.ok === false) {
      if (box) box.innerHTML = `<div class="notice">Could not read Windows printers: ${e(r.reason)}</div>`;
      renderBluetoothState();
      return;
    }
    const selected = db.settings?.printerName || '';
    const printers = Array.isArray(r) ? r : [];
    if (!box) return;
    box.innerHTML = printers.length ? printers.map(p => `<div class="dispatch"><div><b>${e(p.name)}</b><div class="muted">${p.default ? 'Windows default printer' : 'Installed printer'} · Status ${e(p.status)}</div></div><button class="mini ${selected === p.name ? 'secondary' : ''}" onclick="selectPrinter('${e(p.name).replace(/'/g, '&#39;')}')">${selected === p.name ? 'Selected' : 'Select'}</button></div>`).join('') : '<div class="notice">No Windows printers were found. Install the printer driver in Windows first, then click Refresh.</div>';
    renderBluetoothState();
  };

  window.selectPrinter = async name => {
    const r = await window.mkFoods.connectPrinter(name);
    if (r?.ok === false) { alert(r.reason || 'Could not select printer.'); return; }
    await load();
    go('printers');
  };

  views.printers = v => {
    const selected = db.settings?.printerName || '';
    v.innerHTML = shell('Printers','Windows installed printers, Bluetooth and POS receipt printing', `<div class="grid cols"><div class="panel"><div class="toolbar"><div><h2>Installed Windows Printers</h2><p class="muted">USB, network and shared printers installed in Windows appear here.</p></div><button class="btn" onclick="refreshPrinters()">Refresh</button></div><div id="printerList"><p class="muted">Click Refresh to scan Windows printers.</p></div></div><div class="panel"><h2>Live Bluetooth Printer</h2><p class="muted">Use this for Bluetooth LE thermal printers without installing a Windows printer driver. Windows will show a device picker so you can discover and connect a nearby printer live.</p><div class="toolbar"><button class="btn" onclick="connectBluetooth()">Discover Bluetooth</button><button class="btn secondary" onclick="connectBluetoothSerial()">Bluetooth / COM</button></div><div id="bluetoothState" style="margin-top:12px"></div><p class="muted" style="margin-top:12px">For classic Bluetooth SPP printers, pair the printer in Windows first, then use Bluetooth / COM. BLE printers can be discovered directly from the POS.</p></div><div class="panel"><h2>Selected Printer</h2><div class="notice">${selected ? `<b>${e(selected)}</b><br><span class="muted">This printer is saved for MK Foods POS.</span>` : 'No printer selected yet.'}</div><p class="muted">Windows USB/network printers still need to be installed under Windows Settings → Printers & scanners.</p></div></div>`);
    refreshPrinters();
    renderBluetoothState();
  };
})();