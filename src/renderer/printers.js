(() => {
  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  let windowsPrinters = [];
  let bluetoothDevices = [];
  let scanTimer = null;
  let scanBusy = false;
  const toast = (message, error = false) => {
    let box = document.getElementById('printerToast');
    if (!box) { box = document.createElement('div'); box.id = 'printerToast'; box.className = 'workflow-toast'; document.body.appendChild(box); }
    box.textContent = message;
    box.className = `workflow-toast ${error ? 'error' : 'success'}`;
    box.hidden = false;
    clearTimeout(box._timer);
    box._timer = setTimeout(() => { box.hidden = true; }, 5000);
  };
  const testBytes = () => new TextEncoder().encode('\x1b@MK FOODS POS\nBluetooth printer connection test\n\x1b\x64\x04\x1dV\x42\x14');
  const currentPrinter = () => db.settings?.printerName || '';
  const currentMac = () => db.settings?.printerMac || '';
  const normalizeMac = value => {
    const hex = String(value || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    return hex.length === 12 ? hex.match(/.{2}/g).join(':') : '';
  };
  const printerKey = (name, mac) => `${String(name || '').trim()}|${normalizeMac(mac)}`;
  async function testPrinter(name) {
    const r = await window.mkFoods.printThermal(name, testBytes());
    if (r?.ok === false) throw new Error(r.reason || 'Windows could not open this printer.');
    return r;
  }
  async function testBluetooth(mac) {
    const normalized = normalizeMac(mac);
    if (!normalized) throw new Error('Bluetooth printer MAC address is unavailable.');
    const r = await window.mkFoods.printThermal(`__BLUETOOTH_RAW__|${normalized}`, testBytes());
    if (r?.ok === false) throw new Error(r.reason || 'Bluetooth printer test failed.');
    return r;
  }
  const findWindowsFallback = name => {
    const needle = String(name || '').trim().toLowerCase();
    if (!needle) return null;
    return windowsPrinters.find(p => String(p.name || '').trim().toLowerCase() === needle)
      || windowsPrinters.find(p => String(p.name || '').toLowerCase().includes(needle) || needle.includes(String(p.name || '').toLowerCase()))
      || null;
  };
  async function selectWindowsPrinter(name, printTest = true) {
    if (!name) return;
    const button = document.querySelector(`[data-printer-name="${CSS.escape(name)}"]`);
    if (button) { button.disabled = true; button.textContent = 'Connecting…'; }
    try {
      const saved = await window.mkFoods.connectPrinter(name);
      if (saved?.ok === false) throw new Error(saved.reason || 'Could not assign printer.');
      await load();
      if (printTest) await testPrinter(name);
      renderPrinterPage();
      toast(`${name} is connected and ready for receipts.`);
    } catch (err) {
      renderPrinterPage();
      toast(err?.message || String(err), true);
    }
  }
  async function selectBluetoothPrinter(device, printTest = true) {
    const name = String(device?.name || '').trim() || 'Bluetooth device';
    const mac = normalizeMac(device?.mac);
    const button = document.querySelector(`[data-bt-key="${CSS.escape(printerKey(name, mac))}"]`);
    if (button) { button.disabled = true; button.querySelector('.bluetooth-device-action')?.replaceChildren(Object.assign(document.createElement('span'), { className: 'mini secondary', textContent: 'Trying…' })); }
    const failures = [];
    try {
      // Method 1: direct Bluetooth Classic/RFCOMM SPP. This is the preferred thermal path.
      if (printTest && mac) {
        try {
          await testBluetooth(mac);
          const saved = await window.mkFoods.updateSettings({ printerName: name, printerMac: mac, printerConnection: 'bluetooth-spp', receiptPrinter: name });
          if (saved?.ok === false) throw new Error(saved.reason || 'Could not save Bluetooth printer.');
          await load();
          renderPrinterPage();
          toast(`${name} connected directly over Bluetooth SPP.`);
          return;
        } catch (err) {
          failures.push(`Direct Bluetooth: ${err?.message || err}`);
        }
      } else if (!mac) {
        failures.push('Direct Bluetooth: Windows did not expose a usable MAC address.');
      }

      // Method 2: use an already-installed Windows spooler queue for the same device.
      const fallback = findWindowsFallback(name);
      if (printTest && fallback?.name) {
        try {
          await testPrinter(fallback.name);
          const saved = await window.mkFoods.updateSettings({ printerName: fallback.name, printerMac: mac, printerConnection: 'windows-raw', receiptPrinter: fallback.name });
          if (saved?.ok === false) throw new Error(saved.reason || 'Could not save Windows printer.');
          await load();
          renderPrinterPage();
          toast(`${name} connected through Windows printer queue: ${fallback.name}.`);
          return;
        } catch (err) {
          failures.push(`Windows queue: ${err?.message || err}`);
        }
      } else {
        failures.push('Windows queue: no matching installed printer queue was found.');
      }

      // Method 3: if there is a MAC but no successful transport, keep the device selectable
      // and explain exactly what Windows exposed instead of silently disabling it.
      renderPrinterPage();
      toast(`${name} could not be connected. ${failures.join(' | ')}`, true);
    } catch (err) {
      renderPrinterPage();
      toast(`${name}: ${err?.message || err}`, true);
    }
  }
  window.selectPrinter = name => selectWindowsPrinter(name, true);
  window.selectBluetoothPrinter = device => selectBluetoothPrinter(device, true);
  window.testSelectedPrinter = async name => { try { await testPrinter(name); toast(`Test print sent to ${name}.`); } catch (err) { toast(err?.message || String(err), true); } };
  window.testSelectedBluetooth = async mac => { try { await testBluetooth(mac); toast(`Bluetooth test print sent to ${normalizeMac(mac)}.`); } catch (err) { toast(err?.message || String(err), true); } };
  function filteredPrinters() {
    const q = String(document.getElementById('printerLiveSearch')?.value || '').trim().toLowerCase();
    return windowsPrinters.filter(p => !q || `${p.name || ''} ${p.status || ''} ${p.connection || ''}`.toLowerCase().includes(q));
  }
  function renderWindowsPrinters(scanning = false) {
    const box = document.getElementById('printerList'); if (!box) return;
    const list = filteredPrinters(); const selected = currentPrinter();
    box.innerHTML = `<div class="printer-discovery-meta"><b>${scanning ? 'Scanning Windows…' : `${list.length} printer${list.length === 1 ? '' : 's'} found`}</b><span>${windowsPrinters.length ? 'Native Windows spooler' : 'No results yet'}</span></div>
      ${list.length ? list.map(p => `<div class="printer-row ${p.name === selected ? 'selected' : ''}"><div class="printer-row-main"><span class="printer-state ${p.online ? 'online' : 'offline'}"></span><div><b>${esc(p.name)}</b><small>${esc(p.status || 'Unknown')} · ${esc(p.connection || 'Windows')}</small></div></div><div class="printer-row-actions"><button class="mini ${p.name === selected ? 'secondary' : ''}" data-action="select-printer" data-printer-name="${esc(p.name)}">${p.name === selected ? 'Connected' : 'Connect'}</button><button class="mini secondary" data-action="test-printer" data-printer-name="${esc(p.name)}">Test</button></div></div>`).join('') : `<div class="empty-state"><b>${windowsPrinters.length ? 'No matching printers' : 'No Windows printers detected'}</b><span class="muted">Install or pair the printer in Windows, then Scan again.</span></div>`}`;
  }
  function renderBluetoothDevices() {
    const box = document.getElementById('bluetoothList'); if (!box) return;
    const selectedMac = normalizeMac(currentMac());
    box.innerHTML = bluetoothDevices.length ? bluetoothDevices.map(d => {
      const name = String(d.name || 'Bluetooth device').trim();
      const mac = normalizeMac(d.mac);
      const isSelected = !!mac && mac === selectedMac;
      const key = printerKey(name, mac);
      const status = d.status || (d.online ? 'Available' : 'Paired');
      const transport = d.connection || 'Bluetooth';
      return `<button type="button" class="bluetooth-row ${isSelected ? 'selected' : ''} clickable" data-action="select-bluetooth" data-bt-key="${esc(key)}" data-bt-name="${esc(name)}" data-bt-mac="${esc(mac)}" aria-label="Connect ${esc(name)}">
        <div class="bluetooth-device-icon">⌁</div><div class="bluetooth-device-info"><b>${esc(name)}</b><small><span class="printer-state ${d.online ? 'online' : 'offline'}"></span>${esc(status)} · ${mac ? esc(mac) : 'MAC unavailable'} · ${esc(transport)}</small></div>
        <div class="bluetooth-device-action">${isSelected ? '<span class="mini secondary">✓ Connected</span>' : '<span class="mini">Connect</span>'}</div>
      </button>`;
    }).join('') : '<div class="empty-state"><b>No paired Bluetooth devices detected</b><span class="muted">Pair the printer in Windows Bluetooth settings, then Scan again.</span></div>';
  }
  async function scanAll() {
    if (scanBusy) return; scanBusy = true; renderWindowsPrinters(true);
    const [printersResult, bluetoothResult] = await Promise.allSettled([window.mkFoods.discoverPrinters(), window.mkFoods.discoverBluetooth()]);
    windowsPrinters = printersResult.status === 'fulfilled' && printersResult.value?.ok !== false ? (Array.isArray(printersResult.value) ? printersResult.value : (printersResult.value?.printers || [])) : [];
    bluetoothDevices = bluetoothResult.status === 'fulfilled' && bluetoothResult.value?.ok !== false ? (bluetoothResult.value?.devices || []) : [];
    window.mkFoodsPrinters = windowsPrinters; renderWindowsPrinters(false); renderBluetoothDevices(); populateProfiles(); scanBusy = false;
  }
  function populateProfiles() { document.querySelectorAll('.printer-profile-select').forEach(select => { const current = select.dataset.current || select.value || ''; select.innerHTML = '<option value="">Choose printer…</option>' + windowsPrinters.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join(''); select.value = current; }); }
  window.refreshPrinters = scanAll;
  window.setPrinterProfile = async (profile, name) => { const key = { receipt: 'receiptPrinter', kitchen: 'kitchenPrinter', expo: 'expoPrinter', delivery: 'deliveryPrinter' }[profile]; if (!key || !name) return; const r = await window.mkFoods.updateSettings({ [key]: name }); if (r?.ok === false) { toast(r.reason || 'Could not save printer profile.', true); return; } await load(); renderPrinterPage(); toast(`${profile} printer assigned.`); };
  function renderPrinterPage() {
    const v = document.getElementById('view'); if (!v || view !== 'printers') return; const selected = currentPrinter();
    const profiles = [['receipt','Receipt',db.settings?.receiptPrinter || selected],['kitchen','Kitchen / KOT',db.settings?.kitchenPrinter || ''],['expo','Expo / Handoff',db.settings?.expoPrinter || ''],['delivery','Delivery / Packing',db.settings?.deliveryPrinter || '']];
    v.innerHTML = shell('Printers','Windows spooler + direct Bluetooth SPP · smart multi-method connection', `<div class="printer-console"><section class="panel printer-discovery-window"><div class="printer-window-title"><div><h2>Windows Printers</h2><p class="muted">Live inventory from the Windows print spooler. Connect validates the queue and sends a real test print.</p></div><span class="live-indicator"><i></i>LIVE</span></div><div class="printer-searchbar"><input id="printerLiveSearch" class="field" placeholder="Search printers…" oninput="renderPrinterResults(false)"><button class="btn" onclick="refreshPrinters()">Scan Now</button></div><div id="printerList"></div></section><section class="panel printer-bluetooth-window"><div class="printer-window-title"><div><h2>Bluetooth Printers & Devices</h2><p class="muted">Every discovered Bluetooth device is selectable. Connect tries direct SPP first, then an installed Windows printer queue.</p></div><span class="tag">SMART CONNECT</span></div><div id="bluetoothList"></div></section><section class="panel"><h2>Printer Routing</h2><p class="muted">Assign each production station to a Windows printer. Receipt printing also remembers a direct Bluetooth SPP printer.</p><div class="printer-profiles">${profiles.map(([k,label,val]) => `<label class="profile-row"><span><b>${label}</b><small>${val ? esc(val) : 'Not assigned'}</small></span><select class="field printer-profile-select" data-current="${esc(val)}" onchange="setPrinterProfile('${k}',this.value)"><option value="">Choose printer…</option>${windowsPrinters.map(p => `<option value="${esc(p.name)}" ${p.name === val ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`).join('')}</div></section></div>`);
    renderWindowsPrinters(false); renderBluetoothDevices();
  }
  window.renderPrinterResults = renderWindowsPrinters;
  views.printers = v => { renderPrinterPage(); if (!scanTimer) scanTimer = setInterval(() => { if (view === 'printers' && document.getElementById('printerList')) scanAll(); else { clearInterval(scanTimer); scanTimer = null; } }, 5000); scanAll(); };
  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-action="select-printer"],[data-action="test-printer"],[data-action="select-bluetooth"],[data-action="test-bluetooth"]'); if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'select-printer') selectWindowsPrinter(btn.getAttribute('data-printer-name') || '', true);
    else if (action === 'test-printer') window.testSelectedPrinter(btn.getAttribute('data-printer-name') || '');
    else if (action === 'select-bluetooth') selectBluetoothPrinter({ name: btn.getAttribute('data-bt-name') || '', mac: btn.getAttribute('data-bt-mac') || '' }, true);
    else window.testSelectedBluetooth(btn.getAttribute('data-bt-mac') || '');
  });
})();
