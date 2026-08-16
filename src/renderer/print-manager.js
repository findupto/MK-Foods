(() => {
  const key = 'mk-foods-print-queue-v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; } };
  const write = rows => localStorage.setItem(key, JSON.stringify(rows));
  const num = v => Number(v || 0);
  const text = v => String(v ?? '');
  const escP = s => esc(text(s));
  const queue = order => {
    if (!order?.id) return;
    const rows = read();
    const copy = JSON.parse(JSON.stringify(order));
    const i = rows.findIndex(x => x.id === copy.id);
    if (i >= 0) rows[i] = { ...rows[i], ...copy, queuedAt: rows[i].queuedAt || new Date().toISOString() };
    else rows.unshift({ ...copy, queuedAt: new Date().toISOString(), printStatus: 'queued' });
    write(rows);
  };
  const remove = id => { write(read().filter(x => x.id !== id)); renderManager(); };
  const clearDone = () => { write(read().filter(x => x.printStatus !== 'printed')); renderManager(); };
  const receiptHtml = order => {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemRows = items.map(i => `<tr><td>${escP(i.name)}${i.note ? `<br><small>${escP(i.note)}</small>` : ''}</td><td>${num(i.qty)}</td><td>${money(num(i.price) * num(i.qty))}</td></tr>`).join('');
    return `<section class="print-receipt"><h2>${escP(db.settings?.business || 'MK Foods POS')}</h2><div class="center">${escP(db.settings?.phone || '')}</div><div class="print-line"></div><div><b>${escP(order.id)}</b><br>${new Date(order.createdAt || Date.now()).toLocaleString()}</div>${order.customerName ? `<div>Customer: ${escP(order.customerName)}</div>` : ''}${order.orderType ? `<div>Type: ${escP(order.orderType)}</div>` : ''}<div class="print-line"></div><table>${itemRows}</table><div class="print-line"></div><div>Subtotal: ${money(order.subtotal)}</div><div>Discount: -${money(order.discount)}</div><div>Tax: ${money(order.tax)}</div>${num(order.deliveryFee) ? `<div>Delivery: ${money(order.deliveryFee)}</div>` : ''}<div class="print-total"><span>Total</span><span>${money(order.total)}</span></div><div class="print-line"></div><div>Payment: ${escP(order.payment || 'Cash')} · ${escP(order.paymentStatus || 'pending')}</div><div class="center" style="margin-top:10px">Thank you!</div></section>`;
  };
  const printOrder = id => {
    const order = read().find(x => x.id === id);
    if (!order) return;
    const area = document.getElementById('printOutput');
    if (!area) return;
    document.body.classList.add('printing-receipt');
    area.innerHTML = receiptHtml(order);
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-receipt');
        area.innerHTML = '';
        write(read().map(x => x.id === id ? { ...x, printStatus: 'printed', printedAt: new Date().toISOString() } : x));
        renderManager();
      }, 300);
    });
  };
  window.printReceipt = order => { queue(order); go('printmanager'); };
  window.queueOrderForPrint = order => { queue(order); go('printmanager'); };
  window.removePrintOrder = remove;
  window.printQueuedOrder = printOrder;
  window.clearPrintedQueue = clearDone;
  window.addOrderToPrintQueue = () => {
    const id = document.getElementById('printOrderSelect')?.value;
    const order = (db.orders || []).find(x => x.id === id);
    if (!order) return;
    queue(order); renderManager();
  };
  window.addManualPrintOrder = () => {
    const id = document.getElementById('manualPrintId')?.value.trim() || `MAN-${Date.now()}`;
    const customerName = document.getElementById('manualPrintCustomer')?.value.trim() || '';
    const itemText = document.getElementById('manualPrintItems')?.value.trim() || '';
    const total = num(document.getElementById('manualPrintTotal')?.value);
    if (!itemText || total <= 0) return;
    const items = itemText.split(/\n|,/).map(s => s.trim()).filter(Boolean).map(name => ({ id: `manual-${Date.now()}-${Math.random()}`, name, price: 0, qty: 1 }));
    queue({ id, createdAt: new Date().toISOString(), customerName, items, subtotal: total, discount: 0, tax: 0, deliveryFee: 0, total, payment: document.getElementById('manualPrintPayment')?.value || 'Cash', paymentStatus: 'settled', orderType: 'Manual' });
    renderManager();
  };
  function renderManager() {
    const v = document.getElementById('view');
    if (!v || view !== 'printmanager') return;
    const rows = read();
    const queued = rows.filter(x => x.printStatus !== 'printed');
    const printed = rows.filter(x => x.printStatus === 'printed');
    const options = (db.orders || []).filter(o => !rows.some(q => q.id === o.id && q.printStatus !== 'printed')).map(o => `<option value="${escP(o.id).replace(/'/g, '&#39;')}">${escP(o.id)} · ${escP(o.customerName || 'Walk-in')} · ${money(o.total)}</option>`).join('');
    v.innerHTML = shell('Print Manager','Manage receipts in one window — no receipt popup', `<div class="print-manager"><div class="panel print-toolbar-panel"><div class="toolbar"><div><h2>Print Queue</h2><p class="muted">Add, remove, review and pass orders to printing from this window.</p></div><div class="actions"><button class="btn" onclick="go('pos')">New Order</button><button class="btn secondary" onclick="clearPrintedQueue()">Clear Printed</button></div></div><div class="formgrid"><label class="wide">Add existing order<select id="printOrderSelect" class="field"><option value="">Select an order...</option>${options}</select></label><button class="btn" onclick="addOrderToPrintQueue()">Add to Queue</button></div></div><div class="grid cols"><div class="panel"><h2>Queued / Pending (${queued.length})</h2>${queued.map(o => `<div class="print-job"><div><b>${escP(o.id)}</b><div>${escP(o.customerName || 'Walk-in')} · ${escP(o.orderType || 'Order')} · ${money(o.total)}</div><small class="muted">${new Date(o.createdAt || o.queuedAt || Date.now()).toLocaleString()} · ${Array.isArray(o.items) ? o.items.length : 0} item(s)}</small></div><div class="toolbar"><button class="mini" onclick="showPrintOrderDetails('${escP(o.id).replace(/'/g, '&#39;')}')">Details</button><button class="mini" onclick="printQueuedOrder('${escP(o.id).replace(/'/g, '&#39;')}')">Pass / Print</button><button class="mini danger" onclick="removePrintOrder('${escP(o.id).replace(/'/g, '&#39;')}')">Remove</button></div></div>`).join('') || '<div class="notice">No pending print jobs.</div>'}</div><div class="panel"><h2>Manual Receipt</h2><p class="muted">Create a receipt for an order that is not in the POS database.</p><div class="formgrid"><label>Order ID<input id="manualPrintId" class="field" placeholder="Optional"></label><label>Customer<input id="manualPrintCustomer" class="field" placeholder="Walk-in"></label><label class="wide">Items<input id="manualPrintItems" class="field" placeholder="Pizza x1, Fries x2"></label><label>Total<input id="manualPrintTotal" class="field" type="number" min="0" step="0.01"></label><label>Payment<select id="manualPrintPayment" class="field"><option>Cash</option><option>Card</option><option>Online</option><option>COD</option></select></label></div><button class="btn" onclick="addManualPrintOrder()">Add Manual Receipt</button></div></div><div class="panel"><h2>Printed History (${printed.length})</h2>${printed.slice(0,30).map(o => `<div class="print-job"><div><b>${escP(o.id)}</b><div>${escP(o.customerName || 'Walk-in')} · ${money(o.total)}</div><small class="muted">Printed ${o.printedAt ? new Date(o.printedAt).toLocaleString() : ''}</small></div><div class="toolbar"><button class="mini" onclick="showPrintOrderDetails('${escP(o.id).replace(/'/g, '&#39;')}')">Details</button><button class="mini" onclick="printQueuedOrder('${escP(o.id).replace(/'/g, '&#39;')}')">Reprint</button><button class="mini danger" onclick="removePrintOrder('${escP(o.id).replace(/'/g, '&#39;')}')">Remove</button></div></div>`).join('') || '<p class="muted">No printed receipts yet.</p>'}</div><div id="printOutput"></div></div>`);
  }
  window.showPrintOrderDetails = id => {
    const o = read().find(x => x.id === id); if (!o) return;
    const lines = (o.items || []).map(i => `<div class="orderline"><span>${num(i.qty) || 1} × ${escP(i.name || 'Item')}</span><b>${money(num(i.price) * num(i.qty || 1))}</b></div>`).join('');
    const area = document.getElementById('printOutput');
    if (area) area.innerHTML = `<div class="panel print-detail-panel"><div class="toolbar"><div><h2>${escP(o.id)}</h2><p class="muted">${escP(o.customerName || 'Walk-in')} · ${escP(o.orderType || 'Order')}</p></div><button class="mini" onclick="document.getElementById('printOutput').innerHTML=''">Close</button></div>${lines}<div class="total"><span>Total</span><strong>${money(o.total)}</strong></div><div class="toolbar"><button class="btn" onclick="printQueuedOrder('${escP(o.id).replace(/'/g, '&#39;')}')">Pass / Print</button><button class="btn secondary" onclick="removePrintOrder('${escP(o.id).replace(/'/g, '&#39;')}')">Remove</button></div></div>`;
    area.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  views.printmanager = renderManager;
  window.openPrintManager = () => go('printmanager');
  window.refreshPrintManager = renderManager;
  const originalCheckoutEnhanced = window.checkoutEnhanced;
  if (typeof originalCheckoutEnhanced === 'function') {
    window.checkoutEnhanced = async (...args) => {
      const oldConfirm = window.confirm;
      window.confirm = () => true;
      try { return await originalCheckoutEnhanced(...args); } finally { window.confirm = oldConfirm; }
    };
  }
})();