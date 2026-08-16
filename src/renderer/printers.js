(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
    box._timer = setTimeout(() => { box.hidden = true; }, 4000);
  };
  const testBytes = () => new TextEncoder().encode('\x1b@MK FOODS POS\nPrinter connection test\n\x1b\x64\x04\x1dV\x42\x14');
  const currentPrinter = () => db.settings?.printerName || '';

  async function testPrinter(name) {
    const r = await window.mkFoods.printThermal(name, testBytes());
    if (r?.ok === false) throw new Error(r.reason || 'Windows could not open this printer.');
    return r;
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

  window.selectPrinter = name => selectWindowsPrinter(name, true);
  window.testSelectedPrinter = async name => {
    try { await testPrinter(name); toast(`Test print sent to ${name}.`); }
    catch (err) { toast(err?.message || String(err), true); }
  };

  function filteredPrinters() {
    const q = String(document.getElementById('printerLiveSearch')?.value || '').trim().toLowerCase();
    return windowsPrinters.filter(p => !q || `${p.name || ''} ${p.status || ''} ${p.connection || ''}`.toLowerCase().includes(q));
  }

  function renderWindowsPrinters(scanning = false) {
    const box = document.getElementById('printerList');
    if (!box) return;
    const list = filteredPrinters();
    const selected = currentPrinter();
    box.innerHTML = `
      <div class="printer-discovery-meta"><b>${scanning ? 'Scanning Windows…' : `${list.length} printer${list.length === 1 ? '' : 's'} found`}</b><span>${windowsPrinters.length ? 'Native Windows spooler' : 'No results yet'}</span></div>
      ${list.length ? list.map(p => `
        <div class="printer-row ${p.name === selected ? 'selected' : ''}">
          <div class="printer-row-main"><span class="printer-state ${p.online ? 'online' : 'offline'}"></span><div><b>${esc(p.name)}</b><small>${esc(p.status || 'Unknown')} · ${esc(p.connection || 'Windows')}</small></div></div>
          <div class="printer-row-actions"><button class="mini ${p.name === selected ? 'secondary' : ''}" data-action="select-printer" data-printer-name="${esc(p.name)}">${p.name === selected ? 'Connected' : 'Connect'}</button><button class="mini secondary" data-action="test-printer" data-printer-name="${esc(p.name)}">Test</button></div>
        </div>`).join('') : `<div class="empty-state"><b>${windowsPrinters.length ? 'No matching printers' : 'No Windows printers detected'}</b><span class="muted">Install or pair the printer in Windows, then Scan again.</span></div>`}
    `;
  }

  function renderBluetoothDevices() {
    const box = document.getElementById('bluetoothList');
    if (!box) return;
    const paired = bluetoothDevices.filter(d => d.online || d.paired);
    box.innerHTML = paired.length ? paired.map(d => {
      const match = windowsPrinters.find(p => p.name.toLowerCase() === String(d.name || '').toLowerCase()) || windowsPrinters.find(p => p.name.toLowerCase().includes(String(d.name || '').toLowerCase()) || String(d.name || '').toLowerCase().includes(p.name.toLowerCase()));
      return `<div class="bluetooth-row"><div><b>${esc(d.name)}</b><small><span class="printer-state ${d.online ? 'online' : 'offline'}"></span>${esc(d.status || (d.online ? 'Available' : 'Paired'))} · Windows paired device</small></div>${match ? `<button class="mini" data-action="select-printer" data-printer-name="${esc(match.name)}">Use ${esc(match.name)}</button>` : `<span class="tag">Paired</span>`}</div>`;
    }).join('') : '<div class="empty-state"><b>No paired Bluetooth devices detected</b><span class="muted">Pair the printer in Windows Bluetooth settings. This POS will not open a browser/device picker.</span></div>';
  }

  async function scanAll() {
    if (scanBusy) return;
    scanBusy = true;
    renderWindowsPrinters(true);
    const [printersResult, bluetoothResult] = await Promise.allSettled([window.mkFoods.discoverPrinters(), window.mkFoods.discoverBluetooth()]);
    if (printersResult.status === 'fulfilled' && printersResult.value?.ok !== false) windowsPrinters = Array.isArray(printersResult.value) ? printersResult.value : (printersResult.value?.printers || []);
    else if (printersResult.status === 'fulfilled') windowsPrinters = [];
    if (bluetoothResult.status === 'fulfilled' && bluetoothResult.value?.ok !== false) bluetoothDevices = bluetoothResult.value?.devices || [];
    else bluetoothDevices = [];
    window.mkFoodsPrinters = windowsPrinters;
    renderWindowsPrinters(false);
    renderBluetoothDevices();
    populateProfiles();
    scanBusy = false;
  }

  function populateProfiles() {
    document.querySelectorAll('.printer-profile-select').forEach(select => {
      const current = select.dataset.current || select.value || '';
      select.innerHTML = '<option value="">Choose printer…</option>' + windowsPrinters.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
      select.value = current;
    });
  }

  window.refreshPrinters = scanAll;
  window.setPrinterProfile = async (profile, name) => {
    const key = { receipt: 'receiptPrinter', kitchen: 'kitchenPrinter', expo: 'expoPrinter', delivery: 'deliveryPrinter' }[profile];
    if (!key || !name) return;
    const r = await window.mkFoods.updateSettings({ [key]: name });
    if (r?.ok === false) { toast(r.reason || 'Could not save printer profile.', true); return; }
    await load();
    renderPrinterPage();
    toast(`${profile} printer assigned.`);
  };

  function renderPrinterPage() {
    const v = document.getElementById('view');
    if (!v || view !== 'printers') return;
    const selected = currentPrinter();
    const profiles = [['receipt','Receipt',db.settings?.receiptPrinter || selected],['kitchen','Kitchen / KOT',db.settings?.kitchenPrinter || ''],['expo','Expo / Handoff',db.settings?.expoPrinter || ''],['delivery','Delivery / Packing',db.settings?.deliveryPrinter || '']];
    v.innerHTML = shell('Printers','Native Windows printer control center · no browser Bluetooth picker', `
      <div class="printer-console">
        <section class="panel printer-discovery-window">
          <div class="printer-window-title"><div><h2>Windows Printers</h2><p class="muted">Live inventory from the Windows print spooler. Connect means the POS validates the printer and sends a real test print.</p></div><span class="live-indicator"><i></i>LIVE</span></div>
          <div class="printer-searchbar"><input id="printerLiveSearch" class="field" placeholder="Search printers…" oninput="renderPrinterResults(false)"><button class="btn" onclick="refreshPrinters()">Scan Now</button></div>
          <div id="printerList"></div>
        </section>
        <section class="panel printer-bluetooth-window">
          <div class="printer-window-title"><div><h2>Bluetooth Devices</h2><p class="muted">Native Windows paired-device inventory. No browser prompt or popup.</p></div><span class="tag">NATIVE</span></div>
          <div id="bluetoothList"></div>
        </section>
        <section class="panel">
          <h2>Printer Routing</h2><p class="muted">Assign each production station to a Windows printer.</p>
          <div class="printer-profiles">${profiles.map(([k,label,val]) => `<label class="profile-row"><span><b>${label}</b><small>${val ? esc(val) : 'Not assigned'}</small></span><select class="field printer-profile-select" data-current="${esc(val)}" onchange="setPrinterProfile('${k}',this.value)"><option value="">Choose printer…</option>${windowsPrinters.map(p => `<option value="${esc(p.name)}" ${p.name === val ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`).join('')}</div>
        </section>
      </div>
    `);
    renderWindowsPrinters(false);
    renderBluetoothDevices();
  }

  window.renderPrinterResults = renderWindowsPrinters;
  views.printers = v => { renderPrinterPage(); if (!scanTimer) scanTimer = setInterval(() => { if (view === 'printers' && document.getElementById('printerList')) scanAll(); else { clearInterval(scanTimer); scanTimer = null; } }, 5000); scanAll(); };
  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-action="select-printer"],[data-action="test-printer"]');
    if (!btn) return;
    const name = btn.getAttribute('data-printer-name') || '';
    if (btn.dataset.action === 'select-printer') selectWindowsPrinter(name, true);
    else window.testSelectedPrinter(name);
  });
})();