(() => {
  const heldKey = 'mk-foods-held-orders-v1';
  const getHeld = () => { try { return JSON.parse(localStorage.getItem(heldKey) || '[]'); } catch (_) { return []; } };
  const setHeld = rows => localStorage.setItem(heldKey, JSON.stringify(rows));
  const num = v => Math.max(0, Number(v || 0));
  const calc = () => {
    const subtotal = cart.reduce((s, x) => s + num(x.price) * num(x.qty), 0);
    const discountType = document.getElementById('discountType')?.value || 'fixed';
    const discountInput = num(document.getElementById('discount')?.value);
    const discount = Math.min(discountType === 'percent' ? subtotal * Math.min(discountInput, 100) / 100 : discountInput, subtotal);
    const taxable = Math.max(0, subtotal - discount);
    const tax = taxable * num(db.settings?.tax) / 100;
    const deliveryFee = document.getElementById('orderType')?.value === 'Delivery' ? num(document.getElementById('deliveryFee')?.value) : 0;
    return { subtotal, discount, tax, deliveryFee, total: taxable + tax + deliveryFee };
  };
  const renderTotals = () => {
    const t = calc();
    const box = document.getElementById('posTotals');
    if (!box) return;
    box.innerHTML = `<div><span>Subtotal</span><b>${money(t.subtotal)}</b></div><div><span>Discount</span><b>-${money(t.discount)}</b></div><div><span>Tax (${num(db.settings?.tax)}%)</span><b>${money(t.tax)}</b></div>${t.deliveryFee ? `<div><span>Delivery</span><b>${money(t.deliveryFee)}</b></div>` : ''}<div class="total"><span>Total</span><strong>${money(t.total)}</strong></div>`;
  };
  const renderHeld = () => {
    const rows = getHeld();
    const box = document.getElementById('heldOrders');
    if (!box) return;
    box.innerHTML = rows.length ? rows.map((o, i) => `<div class="dispatch"><div><b>${esc(o.name || o.id)}</b><div class="muted">${o.items.length} item(s) · ${money(o.total)}</div></div><div class="toolbar"><button class="mini" onclick="resumeHeld(${i})">Resume</button><button class="mini danger" onclick="deleteHeld(${i})">Delete</button></div></div>`).join('') : '<p class="muted">No held orders.</p>';
  };
  const renderCart = () => {
    const box = document.getElementById('cartLines');
    if (!box) return;
    box.innerHTML = cart.length ? cart.map((x, i) => `<div class="orderline"><div><b>${esc(x.name)}</b><small class="muted">${x.note ? ` · ${esc(x.note)}` : ''}</small><div class="toolbar"><button class="mini" onclick="changeCartQty(${i},-1)">−</button><span>${x.qty}</span><button class="mini" onclick="changeCartQty(${i},1)">+</button><button class="mini secondary" onclick="editCartNote(${i})">Note</button></div></div><span>${money(num(x.price) * num(x.qty))}<button class="mini danger" onclick="removeItem(${i})">×</button></span></div>`).join('') : '<p class="muted">No items yet</p>';
    renderTotals();
  };
  window.changeCartQty = (i, delta) => {
    const x = cart[i];
    if (!x) return;
    const p = db.products.find(p => p.id === x.id);
    const next = num(x.qty) + delta;
    if (next <= 0) return removeItem(i);
    if (p && next > num(p.stock)) return alert('Not enough stock.');
    x.qty = next;
    renderCart();
  };
  window.editCartNote = i => {
    if (!cart[i]) return;
    const note = prompt('Item note / modifier', cart[i].note || '');
    if (note !== null) cart[i].note = note.trim();
    renderCart();
  };
  window.holdCurrentOrder = () => {
    if (!cart.length) return alert('Add at least one item before holding the order.');
    const t = calc();
    const name = prompt('Hold name / order number', `Hold ${new Date().toLocaleTimeString()}`);
    if (!name) return;
    const rows = getHeld();
    rows.push({ id: `H-${Date.now()}`, name, items: cart.map(x => ({ ...x })), total: t.total, createdAt: new Date().toISOString() });
    setHeld(rows);
    cart.length = 0;
    render();
  };
  window.resumeHeld = i => {
    const rows = getHeld();
    const o = rows[i];
    if (!o) return;
    if (cart.length && !confirm('Current order has items. Replace it with the held order?')) return;
    cart.length = 0;
    o.items.forEach(x => cart.push({ ...x }));
    rows.splice(i, 1);
    setHeld(rows);
    render();
  };
  window.deleteHeld = i => {
    const rows = getHeld();
    if (!rows[i] || !confirm('Delete this held order?')) return;
    rows.splice(i, 1); setHeld(rows); renderHeld();
  };
  window.printReceipt = order => {
    const items = Array.isArray(order.items) ? order.items : [];
    const w = window.open('', '_blank', 'width=420,height=700');
    if (!w) return alert('Allow pop-ups to print the receipt.');
    const itemRows = items.map(i => `<tr><td>${esc(i.name)}${i.note ? `<br><small>${esc(i.note)}</small>` : ''}</td><td>${i.qty}</td><td>${money(num(i.price) * num(i.qty))}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><title>${esc(order.id)}</title><style>body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;padding:8px;font-size:12px}h2{text-align:center;margin:0 0 6px}.muted{color:#666}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}td:nth-child(2),td:nth-child(3){text-align:right}.line{border-top:1px dashed #777;margin:6px 0}.total{font-size:16px;font-weight:700;display:flex;justify-content:space-between}.center{text-align:center}</style></head><body><h2>${esc(db.settings?.business || 'MK Foods POS')}</h2><div class="center">${esc(db.settings?.phone || '')}</div><div class="line"></div><div><b>${esc(order.id)}</b><br>${new Date(order.createdAt).toLocaleString()}</div><div class="line"></div><table>${itemRows}</table><div class="line"></div><div>Subtotal: ${money(order.subtotal)}</div><div>Discount: -${money(order.discount)}</div><div>Tax: ${money(order.tax)}</div>${num(order.deliveryFee) ? `<div>Delivery: ${money(order.deliveryFee)}</div>` : ''}<div class="total"><span>Total</span><span>${money(order.total)}</span></div><div class="line"></div><div>Payment: ${esc(order.payment)} · ${esc(order.paymentStatus || 'pending')}</div><div class="center" style="margin-top:10px">Thank you!</div><script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}</script></body></html>`);
    w.document.close();
  };
  window.checkoutEnhanced = async () => {
    if (!cart.length) return;
    const t = calc();
    const type = document.getElementById('orderType')?.value || 'Takeaway';
    const payment = document.getElementById('payment')?.value || 'Cash';
    const address = document.getElementById('deliveryAddress')?.value.trim() || '';
    const customerName = document.getElementById('customerName')?.value.trim() || '';
    const tableId = document.getElementById('tableId')?.value || '';
    if (type === 'Delivery' && !address) return alert('Delivery address is required.');
    let tenders = [{ method: payment, amount: t.total }];
    let paidAmount = payment === 'Cash' ? t.total : 0;
    if (payment === 'Split') {
      const cash = num(prompt(`Cash amount (total ${t.total})`, t.total));
      const card = num(prompt(`Card amount (remaining ${Math.max(0, t.total - cash)})`, Math.max(0, t.total - cash)));
      const online = Math.max(0, t.total - cash - card);
      tenders = [{ method: 'Cash', amount: cash }, { method: 'Card', amount: card }, { method: 'Online', amount: online }].filter(x => x.amount > 0);
      paidAmount = cash;
    }
    const paymentStatus = payment === 'Cash' ? 'settled' : payment === 'COD' ? 'due' : 'pending_verification';
    const order = { id: `ORD-${Date.now()}`, createdAt: new Date().toISOString(), items: cart.map(({ id, name, price, qty, note }) => ({ id, name, price, qty, note: note || '' })), subtotal: t.subtotal, discount: t.discount, tax: t.tax, deliveryFee: t.deliveryFee, total: t.total, payment, paymentStatus, tenders, paidAmount, orderType: type, address, customerName, tableId, status: 'new' };
    const r = await api(window.mkFoods.createOrder, order);
    if (r?.ok === false) return handleAuthError(r);
    cart.length = 0;
    await load();
    renderHeld();
    if (confirm(`Order ${order.id} saved. Print receipt now?`)) window.printReceipt(r || order);
  };
  views.pos = v => {
    const cats = [...new Set((db.products || []).filter(p => p.available && num(p.stock) > 0).map(p => p.category))];
    v.innerHTML = shell('POS / Orders', 'Complete billing · tax · discounts · tables · delivery · split tenders · hold/resume', `<div class="poslayout"><div class="panel"><div class="toolbar"><input id="productSearch" class="field" placeholder="Search menu..." oninput="renderPosProducts()"><select id="posCat" class="field" onchange="renderPosProducts()"><option value="">All categories</option>${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div><div id="posProducts" class="productgrid"></div><div class="panel" style="margin-top:12px"><h3>Held Orders</h3><div id="heldOrders"></div></div></div><div class="panel cartpanel"><h2>Current Order</h2><div id="cartLines"></div><div class="formgrid"><label>Type<select id="orderType" class="field"><option>Dine-in</option><option>Takeaway</option><option>Delivery</option></select></label><label>Payment<select id="payment" class="field"><option>Cash</option><option>Card</option><option>Online</option><option>COD</option><option>Split</option></select></label><label>Discount Type<select id="discountType" class="field"><option value="fixed">Fixed</option><option value="percent">Percentage</option></select></label><label>Discount<input id="discount" class="field" type="number" min="0" step="0.01" value="0"></label><label>Customer<input id="customerName" class="field" placeholder="Optional"></label><label>Dine-in Table<select id="tableId" class="field"><option value="">No table</option>${(db.tables || []).filter(t => t.status !== 'Paid').map(t => `<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.status)}</option>`).join('')}</select></label><label class="wide">Delivery Address<input id="deliveryAddress" class="field" placeholder="Required for delivery"></label><label class="wide">Delivery Fee<input id="deliveryFee" class="field" type="number" min="0" step="0.01" value="0"></label></div><div id="posTotals"></div><div class="toolbar"><button class="btn secondary" onclick="holdCurrentOrder()" ${cart.length ? '' : 'disabled'}>Hold Order</button><button class="btn widebtn" ${cart.length ? '' : 'disabled'} onclick="checkoutEnhanced()">Complete Sale</button></div></div></div>`);
    document.getElementById('orderType').addEventListener('change', renderTotals);
    document.getElementById('discountType').addEventListener('change', renderTotals);
    document.getElementById('discount').addEventListener('input', renderTotals);
    document.getElementById('deliveryFee').addEventListener('input', renderTotals);
    renderPosProducts(); renderCart(); renderHeld();
  };
  window.renderPosProducts = () => {
    const el = document.getElementById('posProducts'); if (!el) return;
    const q = (document.getElementById('productSearch')?.value || '').toLowerCase();
    const cat = document.getElementById('posCat')?.value || '';
    el.innerHTML = (db.products || []).filter(p => p.available && num(p.stock) > 0 && (!cat || p.category === cat) && (!q || String(p.name).toLowerCase().includes(q))).map(p => `<button class="product" onclick="add('${esc(p.id).replace(/'/g, '&#39;')}')"><b>${esc(p.name)}</b><span>${esc(p.category)} · ${money(p.price)} · Stock ${num(p.stock)}</span></button>`).join('') || '<p class="muted">No matching items.</p>';
  };
  window.add = id => {
    const p = db.products.find(x => x.id === id); if (!p || !p.available || num(p.stock) <= 0) return alert('Item is out of stock.');
    const existing = cart.find(x => x.id === id);
    if (existing) { if (num(existing.qty) >= num(p.stock)) return alert('Not enough stock.'); existing.qty += 1; }
    else cart.push({ ...p, qty: 1, note: '' });
    render();
  };
  window.removeItem = i => { cart.splice(i, 1); render(); };
})();
