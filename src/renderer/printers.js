(() => {
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.refreshPrinters = async () => {
    const box = document.getElementById('printerList');
    if (box) box.innerHTML = '<p class="muted">Searching Windows printers...</p>';
    const r = await window.mkFoods.discoverPrinters();
    if (r?.ok === false) {
      if (box) box.innerHTML = `<div class="notice">Could not read Windows printers: ${e(r.reason)}</div>`;
      return;
    }
    const selected = db.settings?.printerName || '';
    const printers = Array.isArray(r) ? r : [];
    if (!box) return;
    box.innerHTML = printers.length ? printers.map(p => `<div class="dispatch"><div><b>${e(p.name)}</b><div class="muted">${p.default ? 'Windows default printer' : 'Installed printer'} · Status ${e(p.status)}</div></div><button class="mini ${selected === p.name ? 'secondary' : ''}" onclick="selectPrinter('${e(p.name).replace(/'/g, '&#39;')}')">${selected === p.name ? 'Selected' : 'Select'}</button></div>`).join('') : '<div class="notice">No Windows printers were found. Install the printer driver in Windows first, then click Refresh.</div>';
  };
  window.selectPrinter = async name => {
    const r = await window.mkFoods.connectPrinter(name);
    if (r?.ok === false) { alert(r.reason || 'Could not select printer.'); return; }
    await load();
    go('printers');
  };
  views.printers = v => {
    const selected = db.settings?.printerName || '';
    v.innerHTML = shell('Printers','Windows installed printers for receipts and POS printing', `<div class="grid cols"><div class="panel"><div class="toolbar"><div><h2>Installed Windows Printers</h2><p class="muted">The POS reads printers installed in Windows. USB, network and shared printers supported by Windows appear here.</p></div><button class="btn" onclick="refreshPrinters()">Refresh</button></div><div id="printerList"><p class="muted">Click Refresh to scan Windows printers.</p></div></div><div class="panel"><h2>Selected Printer</h2><div class="notice">${selected ? `<b>${e(selected)}</b><br><span class="muted">This printer is saved for MK Foods POS.</span>` : 'No printer selected yet.'}</div><p class="muted">For USB/network printers, make sure the printer is installed and visible under Windows Settings → Printers & scanners.</p></div></div>`);
    refreshPrinters();
  };
})();