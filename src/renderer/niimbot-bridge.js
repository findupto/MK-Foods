(() => {
  const SERVICE = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
  const QUEUE_KEY = 'mk-foods-print-queue-v4';
  const isB11 = name => /^B11(?:[-_ ]|$)/i.test(String(name || '').trim());
  let client = null;
  let connectedName = '';
  let connectPromise = null;

  const lib = () => window.niimbluelib || null;
  const supported = name => isB11(name) && !!lib() && !!navigator.bluetooth;

  async function knownDevice(name) {
    if (!navigator.bluetooth?.getDevices) return null;
    try {
      const wanted = String(name || '').trim().toLowerCase();
      const devices = await navigator.bluetooth.getDevices();
      return devices.find(d => {
        const n = String(d.name || '').trim().toLowerCase();
        return n === wanted || (wanted && n && (n.includes(wanted) || wanted.includes(n)));
      }) || null;
    } catch (_) {
      return null;
    }
  }

  async function connect(name, allowPrompt = true) {
    if (!supported(name)) throw new Error('NIIMBOT_BLE_UNAVAILABLE');
    if (client && connectedName && connectedName.toLowerCase() === String(name).toLowerCase() && client.isConnected?.()) return client;
    if (connectPromise) return connectPromise;

    connectPromise = (async () => {
      const api = lib();
      const Ctor = api.NiimbotBluetoothClient;
      if (!Ctor) throw new Error('NIIMBOT_BLE_CLIENT_UNAVAILABLE');
      const device = await knownDevice(name);
      if (!device && !allowPrompt) throw new Error('NIIMBOT_BLE_PERMISSION_NOT_GRANTED');

      const originalRequest = navigator.bluetooth.requestDevice.bind(navigator.bluetooth);
      navigator.bluetooth.requestDevice = async options => device || originalRequest(options);
      try {
        if (client) {
          try { await client.disconnect(); } catch (_) {}
        }
        client = new Ctor();
        client.setServiceUuidFilter?.([SERVICE]);
        await client.connect();
        connectedName = String(name || client.getPrinterInfo?.()?.serial || '').trim();
        return client;
      } finally {
        navigator.bluetooth.requestDevice = originalRequest;
      }
    })();

    try {
      return await connectPromise;
    } finally {
      connectPromise = null;
    }
  }

  function wrapLines(text, maxChars) {
    const out = [];
    String(text ?? '').split(/\r?\n/).forEach(line => {
      let s = line;
      if (!s) { out.push(''); return; }
      while (s.length > maxChars) {
        let cut = s.lastIndexOf(' ', maxChars);
        if (cut < Math.floor(maxChars * 0.55)) cut = maxChars;
        out.push(s.slice(0, cut));
        s = s.slice(cut).trimStart();
      }
      out.push(s);
    });
    return out;
  }

  function orderLines(order) {
    const lines = ['MK FOODS', 'MK Pizza & Ice Bar', `Order: ${order.id || ''}`, '--------------------------------'];
    for (const item of order.items || []) {
      const qty = Number(item.qty || 0);
      const price = Number(item.price || 0);
      const total = qty * price;
      lines.push(`${qty} x ${item.name || ''}`);
      lines.push(`  ${price.toFixed(2)} x ${qty} = ${total.toFixed(2)}`);
    }
    lines.push('--------------------------------');
    lines.push(`TOTAL: ${Number(order.total || 0).toFixed(2)}`);
    if (order.payment) lines.push(`Payment: ${order.payment}`);
    if (order.customerName) lines.push(`Customer: ${order.customerName}`);
    lines.push('Thank you!');
    return lines.flatMap(x => wrapLines(x, 42));
  }

  function renderOrderCanvas(order) {
    const width = 384;
    const lineHeight = 18;
    const lines = orderLines(order);
    const height = Math.max(120, lines.length * lineHeight + 28);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.font = '15px Consolas, "Courier New", monospace';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, 8, 10 + i * lineHeight));
    return canvas;
  }

  async function printOrder(order, allowPrompt = true) {
    const name = String(window.db?.settings?.printerName || order?.printerName || '').trim();
    if (!isB11(name)) throw new Error('NIIMBOT_B11_NOT_SELECTED');
    const c = await connect(name, allowPrompt);
    const api = lib();
    const encoder = api.ImageEncoder;
    if (!encoder) throw new Error('NIIMBOT_IMAGE_ENCODER_UNAVAILABLE');
    const canvas = renderOrderCanvas(order);
    const encoded = encoder.encodeCanvas(canvas, 'top');
    const taskName = c.getPrintTaskType?.();
    if (!taskName) throw new Error('NIIMBOT_B11_PRINT_TASK_UNAVAILABLE');
    const task = c.abstraction.newPrintTask(taskName, {
      totalPages: 1,
      statusPollIntervalMs: 100,
      statusTimeoutMs: 15000
    });
    await task.printInit();
    try {
      await task.printPage(encoded, 1);
      await task.waitForFinished();
    } finally {
      try { await c.abstraction.printEnd(); } catch (_) {}
    }
    return { ok: true, route: 'bluetooth-niimbot-ble', printer: name };
  }

  async function connectAndSave(name, mac) {
    await connect(name, true);
    const r = await window.mkFoods.updateSettings({
      printerName: name,
      receiptPrinter: name,
      printerMac: String(mac || '').trim(),
      printerComPort: '',
      printerConnection: 'bluetooth-niimbot-ble'
    });
    if (r?.ok === false) throw new Error(r.reason || 'SETTINGS_SAVE_FAILED');
    return r;
  }

  function markPrinted(id) {
    try {
      const rows = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      const updated = rows.map(x => x.id === id ? {
        ...x,
        printStatus: 'printed',
        printError: '',
        printedAt: new Date().toISOString(),
        printRoute: 'bluetooth-niimbot-ble'
      } : x);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
      window.refreshPrintManager?.();
    } catch (_) {}
  }

  async function printQueued(id) {
    const rows = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    const order = rows.find(x => x.id === id) || (window.db?.orders || []).find(x => x.id === id);
    if (!order) return;
    try {
      await printOrder(order, true);
      markPrinted(id);
      window.toast?.(`${id} printed on ${window.db?.settings?.printerName || 'Niimbot B11'} via Bluetooth LE.`);
    } catch (e) {
      const message = String(e?.message || e || 'NIIMBOT_PRINT_FAILED');
      try {
        const next = rows.map(x => x.id === id ? { ...x, printStatus: 'error', printError: message } : x);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
      } catch (_) {}
      window.toast?.(message, true);
    }
  }

  async function autoReconnect() {
    try {
      const snapshot = await window.mkFoods.snapshot();
      const settings = snapshot?.settings || {};
      if (!isB11(settings.printerName) || settings.printerConnection !== 'bluetooth-niimbot-ble') return;
      await connect(settings.printerName, false);
      console.log(`[MK Foods] Auto-reconnected Niimbot B11: ${settings.printerName}`);
    } catch (e) {
      console.info('[MK Foods] Niimbot auto-reconnect deferred:', String(e?.message || e));
    }
  }

  window.mkFoodsNiimbot = {
    isSupported: supported,
    connect: name => connect(name, true),
    connectAndSave,
    printOrder,
    autoReconnect
  };

  const originalBluetooth = window.pcUseBluetooth;
  window.pcUseBluetooth = async (name, mac, com, method) => {
    if (isB11(name)) {
      try {
        await connectAndSave(name, mac);
        window.toast?.(`${name} connected via Bluetooth LE (Niimbot). Auto-reconnect enabled.`);
        window.pcScan?.();
      } catch (e) {
        window.toast?.(`${name}: ${String(e?.message || e)}`, true);
      }
      return;
    }
    return originalBluetooth?.(name, mac, com, method);
  };

  const originalPassPrintJob = window.passPrintJob;
  const wrappedPrint = async id => {
    const name = String(window.db?.settings?.printerName || '');
    if (isB11(name) && window.db?.settings?.printerConnection === 'bluetooth-niimbot-ble') {
      return printQueued(id);
    }
    return originalPassPrintJob?.(id);
  };
  window.passPrintJob = wrappedPrint;
  window.printQueuedOrder = wrappedPrint;
  window.retryPrintOrder = wrappedPrint;

  setTimeout(autoReconnect, 2500);
})();
