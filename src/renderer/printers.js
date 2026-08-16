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
  const currentConnection = () => db.settings?.printerConnection || 'windows-raw';
  const normalizeMac = value => {
    const hex = String(value || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    return hex.length === 12 ? hex.match(/.{2}/g).join(':') : '';
  };
  const normalizeCom = value => {
    const v = String(value || '').trim().toUpperCase();
    return /^COM\d+$/.test(v) ? v : '';
  };
  const printerKey = (name, mac, com) => `${String(name || '').trim()}|${normalizeMac(mac)}|${normalizeCom(com)}`;
  async function testPrinter(name) {
    const r = await window.mkFoods.printThermal(name, testBytes());
    if (r?.ok === false) throw new Error(r.reason || 'Windows could not open this printer.');
    return r;
  }
  async function testBluetooth(mac) {
    const normalized = normalizeMac(mac);
    if (!normalized) throw new Error('Bluetooth printer MAC address is unavailable.');
    return window.mkFoods.printThermal(`__BLUETOOTH_RAW__|${normalized}`, testBytes());
  }
  async function testBluetoothCom(com) {
    const port = normalizeCom(com);
    if (!port) throw new Error('Bluetooth COM port is unavailable.');
    return window.mkFoods.printThermal(`__BLUETOOTH_COM__|${port}`, testBytes());
  }
  const findWindowsFallback = name => {
    const needle = String(name || '').trim().toLowerCase();
    if (!needle) return null;
    return windowsPrinters.find(p => String(p.name || '').trim().toLowerCase() === needle)
      || windowsPrinters.find(p => String(p.name || '').toLowerCase().includes(needle) || needle.includes(String(p.name || '').toLowerCase()))
      || null;
  };
  async function saveBluetoothSelection(name, mac, connection, comPort = '') {
    const saved = await window.mkFoods.updateSettings({
      printerName: name,
      printerMac: normalizeMac(mac),
      printerComPort: normalizeCom(comPort),
      printerConnection: connection,
      receiptPrinter: name
    });
    if (saved?.ok === false) throw new Error(saved.reason || 'Could not save Bluetooth printer.');
    await load();
  }
  async function connectBluetoothMethod(device, method, printTest = true) {
    const name = String(device?.name || 'Bluetooth printer').trim();
    const mac = normalizeMac(device?.mac);
    const comPort = normalizeCom(device?.comPort);
    try {
      if (method === 'bluetooth-spp') {
        if (!mac) throw new Error('This device has no usable Bluetooth MAC address.');
        if (printTest) await testBluetooth(mac);
        await saveBluetoothSelection(name, mac, 'bluetooth-spp', '');
        toast(`${name} connected directly using Bluetooth Classic SPP.`);
      } else if (method === 'bluetooth-com') {
        if (!comPort) throw new Error('This device has no Bluetooth SPP COM port.');
        if (printTest) await testBluetoothCom(comPort);
        await saveBluetoothSelection(name, mac, 'bluetooth-com', comPort);
        toast(`${name} connected through Bluetooth SPP virtual port ${comPort}.`);
      } else if (method === 'windows-spooler') {
        const fallback = findWindowsFallback(name);
        if (!fallback?.name) throw new Error('No matching Windows printer queue is installed.');
        if (printTest) await testPrinter(fallback.name);
        await saveBluetoothSelection(fallback.name, mac, 'windows-raw', comPort);
        toast(`${name} connected through Windows printer queue ${fallback.name}.`);
      }
      renderPrinterPage();
      return true;
    } catch (err) {
      toast(`${name}: ${err?.message || err}`, true);
      return false;
    }
  }
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
    const comPort = normalizeCom(device?.comPort);
    const button = document.querySelector(`[data-bt-key="${CSS.escape(printerKey(name, mac, comPort))}"]`);
    if (button) { button.disabled = true; button.querySelector('.bluetooth-device-action')?.replaceChildren(Object.assign(document.createElement('span'), { className: 'mini secondary', textContent: 'Connecting…' })); }
    const failures = [];
    // Enterprise connection policy: prefer the transport with the strongest
    // evidence, then fall back without silently changing the configured route.
    const methods = [];
    if (mac) methods.push('bluetooth-spp');
    if (comPort) methods.push('bluetooth-com');
    if (findWindowsFallback(name)?.name) methods.push('windows-spooler');
    if (!methods.length) { toast(`${name}: no supported transport was discovered.`, true); renderPrinterPage(); return; }
    for (const method of methods) {
      try {
        const ok = await connectBluetoothMethod(device, method, printTest);
        if (ok) return;
      } catch (err) {
        failures.push(`${method}: ${err?.message || err}`);
      }
    }
    renderPrinterPage();
    toast(`${name} could not be connected. ${failures.join(' | ')}`, true);
  }
  async function manualBluetoothConnect() {
    const name = String(document.getElementById('manualBluetoothName')?.value || '').trim() || 'Bluetooth thermal printer';
    const mac = normalizeMac(document.getElementById('manualBluetoothMac')?.value || '');
    const comPort = normalizeCom(document.getElementById('manualBluetoothCom')?.value || '');
    if (!mac && !comPort) { toast('Enter a Bluetooth MAC address or SPP COM port.', true); return; }
    const device = { name, mac, comPort };
    const preferred = comPort && !mac ? 'bluetooth-com' : 'bluetooth-spp';
    if (!(await connectBluetoothMethod(device, preferred, true)) && comPort && preferred !== 'bluetooth-com') await connectBluetoothMethod(device, 'bluetooth-com', true);
  }
  window.selectPrinter = name => selectWindowsPrinter(name, true);
  window.selectBluetoothPrinter = device => selectBluetoothPrinter(device, true);
  window.testSelectedPrinter = async name => { try { await testPrinter(name); toast(`Test print sent to ${name}.`); } catch (err) { toast(err?.message || String(err), true); } };
  window.testSelectedBluetooth = async (mac, comPort = '') => { try { if (comPort) await testBluetoothCom(comPort); else await testBluetooth(mac); toast(`Bluetooth test print sent successfully.`); } catch (err) { toast(err?.message || String(err), true); } };
  window.manualBluetoothConnect = manualBluetoothConnect;
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
  function methodLabel(method) { return ({'bluetooth-spp':'Direct SPP','bluetooth-com':'SPP COM','windows-spooler':'Windows Queue'}[method] || method); }
  function renderBluetoothDevices() {
    const box = document.getElementById('bluetoothList'); if (!box) return;
    const selectedMac = normalizeMac(currentMac());
    box.innerHTML = bluetoothDevices.length ? bluetoothDevices.map(d => {
      const name = String(d.name || 'Bluetooth device').trim();
      const mac = normalizeMac(d.mac);
      const comPort = normalizeCom(d.comPort);
      const isSelected = (!!mac && mac === selectedMac) || (!!comPort && comPort === normalizeCom(db.settings?.printerComPort));
      const key = printerKey(name, mac, comPort);
      const status = d.status || (d.online ? 'Available' : 'Paired');
      const methods = Array.isArray(d.methods) ? d.methods : [mac ? 'bluetooth-spp' : null, comPort ? 'bluetooth-com' : null, findWindowsFallback(name) ? 'windows-spooler' : null].filter(Boolean);
      return `<div class="bluetooth-row ${isSelected ? 'selected' : ''}">
        <div class="bluetooth-device-icon">⌁</div><div class="bluetooth-device-info"><b>${esc(name)}</b><small><span class="printer-state ${d.online ? 'online' : 'offline'}"></span>${esc(status)} · ${mac ? esc(mac) : 'MAC unavailable'}${comPort ? ` · ${esc(comPort)}` : ''}</small><small class="printer-methods">Discovery: ${esc(d.discoveryMethod || 'Windows Bluetooth')}${d.thermalCandidate ? ' · likely thermal' : ''}</small></div>
        <div class="bluetooth-device-action">${isSelected ? '<span class="mini secondary">✓ Connected</span>' : methods.map(m => `<button type="button" class="mini ${m === 'bluetooth-spp' ? '' : 'secondary'}" data-action="connect-bt-method" data-bt-key="${esc(key)}" data-bt-name="${esc(name)}" data-bt-mac="${esc(mac)}" data-bt-com="${esc(comPort)}" data-bt-method="${esc(m)}">${esc(methodLabel(m))}</button>`).join(' ')}</div>
      </div>`;
    }).join('') : '<div class="empty-state"><b>No paired Bluetooth devices detected</b><span class="muted">Scan checks Windows PnP/BTHENUM devices and Bluetooth SPP virtual COM ports. Pair the printer in Windows first if it is not listed.</span></div>';
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
    v.innerHTML = shell('Printers','Enterprise hardware console · multi-path Bluetooth + Windows raw printing', `<div class="printer-console"><section class="panel printer-discovery-window"><div class="printer-window-title"><div><h2>Windows Printers</h2><p class="muted">Native spooler inventory. Connection is validated with a real ESC/POS test print.</p></div><span class="live-indicator"><i></i>LIVE</span></div><div class="printer-searchbar"><input id="printerLiveSearch" class="field" placeholder="Search printers…" oninput="renderPrinterResults(false)"><button class="btn" onclick="refreshPrinters()">Scan All</button></div><div id="printerList"></div></section><section class="panel printer-bluetooth-window"><div class="printer-window-title"><div><h2>Bluetooth Thermal Discovery</h2><p class="muted">Three independent discovery/transport paths: Windows PnP/BTHENUM, Bluetooth SPP virtual COM, and the Windows printer spooler. Direct MAC SPP is also available when Windows exposes a usable address.</p></div><span class="tag">MULTI-PATH</span></div><div id="bluetoothList"></div><div class="panel printer-manual-connect"><h3>Manual Bluetooth / SPP</h3><p class="muted">Use this when a low-cost thermal printer is paired but Windows does not expose a friendly printer record.</p><div class="printer-searchbar"><input id="manualBluetoothName" class="field" placeholder="Printer name (optional)"><input id="manualBluetoothMac" class="field" placeholder="MAC e.g. 00:11:22:33:44:55"><input id="manualBluetoothCom" class="field" placeholder="SPP COM e.g. COM5"><button class="btn" onclick="manualBluetoothConnect()">Connect & Test</button></div></div></section><section class="panel"><h2>Printer Routing</h2><p class="muted">Assign production stations independently. Bluetooth connection details are retained for receipt failover.</p><div class="printer-profiles">${profiles.map(([k,label,val]) => `<label class="profile-row"><span><b>${label}</b><small>${val ? esc(val) : 'Not assigned'}</small></span><select class="field printer-profile-select" data-current="${esc(val)}" onchange="setPrinterProfile('${k}',this.value)"><option value="">Choose printer…</option>${windowsPrinters.map(p => `<option value="${esc(p.name)}" ${p.name === val ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`).join('')}</div><small class="muted">Current receipt transport: ${esc(currentConnection())}${db.settings?.printerComPort ? ` · ${esc(db.settings.printerComPort)}` : ''}</small></section></div>`);
    renderWindowsPrinters(false); renderBluetoothDevices();
  }
  window.renderPrinterResults = renderWindowsPrinters;
  views.printers = v => { renderPrinterPage(); if (!scanTimer) scanTimer = setInterval(() => { if (view === 'printers' && document.getElementById('printerList')) scanAll(); else { clearInterval(scanTimer); scanTimer = null; } }, 5000); scanAll(); };
  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-action="select-printer"],[data-action="test-printer"],[data-action="select-bluetooth"],[data-action="test-bluetooth"],[data-action="connect-bt-method"]'); if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'select-printer') selectWindowsPrinter(btn.getAttribute('data-printer-name') || '', true);
    else if (action === 'test-printer') window.testSelectedPrinter(btn.getAttribute('data-printer-name') || '');
    else if (action === 'connect-bt-method') connectBluetoothMethod({ name: btn.getAttribute('data-bt-name') || '', mac: btn.getAttribute('data-bt-mac') || '', comPort: btn.getAttribute('data-bt-com') || '' }, btn.getAttribute('data-bt-method') || '', true);
    else if (action === 'select-bluetooth') selectBluetoothPrinter({ name: btn.getAttribute('data-bt-name') || '', mac: btn.getAttribute('data-bt-mac') || '', comPort: btn.getAttribute('data-bt-com') || '' }, true);
    else window.testSelectedBluetooth(btn.getAttribute('data-bt-mac') || '', btn.getAttribute('data-bt-com') || '');
  });
})();
