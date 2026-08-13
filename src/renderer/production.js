(() => {
  const num = v => Number(v || 0);
  const bankReady = () => {
    const s = db?.settings || {};
    return !!(s.paymentProvider && s.paymentEnvironment && s.paymentEnvironment !== 'disabled' && s.paymentMerchantId);
  };
  const printerReady = () => {
    const s = db?.settings || {};
    return !!(s.printerName || s.printerMac);
  };

  window.mkFoodsProductionReadiness = () => ({
    banking: bankReady(),
    printer: printerReady(),
    offlineCash: true,
    taxConfigured: num(db?.settings?.tax) >= 0,
    audit: Array.isArray(db?.audit),
    inventory: Array.isArray(db?.products)
  });

  window.checkout = async () => {
    if (!Array.isArray(cart) || !cart.length) return alert('Add at least one item.');
    const subtotal = cart.reduce((s, x) => s + num(x.price) * Math.max(0, num(x.qty)), 0);
    const discount = Math.min(Math.max(0, num(document.getElementById('discount')?.value)), subtotal);
    const taxable = Math.max(0, subtotal - discount);
    const taxRate = Math.max(0, num(db?.settings?.tax));
    const tax = taxable * taxRate / 100;
    const deliveryFee = Math.max(0, num(document.getElementById('deliveryFee')?.value));
    const total = taxable + tax + deliveryFee;
    const payment = document.getElementById('payment')?.value || 'Cash';
    const type = document.getElementById('orderType')?.value || 'Takeaway';
    const address = document.getElementById('deliveryAddress')?.value || '';
    const customerName = document.getElementById('customerName')?.value || '';

    if ((payment === 'Online' || payment === 'Bank Transfer / Raast') && !bankReady()) {
      return alert('Online banking is not configured. Open Banking and complete merchant/provider setup first.');
    }
    if (payment === 'Card' && !bankReady()) {
      return alert('Card processing requires a configured acquiring/payment provider.');
    }
    if (type === 'Delivery' && !address.trim()) return alert('Delivery address is required.');

    for (const item of cart) {
      const product = db.products?.find(p => p.id === item.id);
      if (!product) return alert(`Product no longer exists: ${item.name}`);
      if (num(item.qty) <= 0 || num(item.qty) > num(product.stock)) {
        return alert(`Not enough stock for ${item.name}. Available: ${num(product.stock)}`);
      }
    }

    const order = {
      id: 'ORD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
      items: cart.map(({id, name, price, qty}) => ({id, name, price, qty})),
      subtotal, discount, tax, deliveryFee, total, payment, orderType: type,
      address, customerName, status: 'new',
      paymentStatus: payment === 'Cash' || payment === 'COD' ? 'settled' : 'pending_verification',
      paymentReference: '',
      paymentVerifiedAt: null
    };

    if (order.paymentStatus === 'pending_verification') {
      const ref = prompt('Enter the provider/Bank transaction reference. Leave blank to cancel:')?.trim();
      if (!ref) return;
      order.paymentReference = ref;
      order.status = 'payment_pending';
    }

    const r = await (typeof api === 'function' ? api(window.mkFoods.createOrder, order) : window.mkFoods.createOrder(order));
    if (r?.ok === false) { if (typeof handleAuthError === 'function') handleAuthError(r); return; }
    cart = [];
    await load();
    alert(`Order ${order.id} recorded. Payment status: ${order.paymentStatus}.`);
  };

  window.updatePosTotals = () => {
    const subtotal = cart.reduce((s, x) => s + num(x.price) * num(x.qty), 0);
    const discount = Math.min(Math.max(0, num(document.getElementById('discount')?.value)), subtotal);
    const tax = Math.max(0, subtotal - discount) * Math.max(0, num(db.settings?.tax)) / 100;
    const fee = Math.max(0, num(document.getElementById('deliveryFee')?.value));
    const vals = [subtotal, discount, tax, subtotal - discount + tax + fee];
    document.querySelectorAll('#posTotals strong').forEach((el, i) => { if (vals[i] !== undefined) el.textContent = money(vals[i]); });
  };

  views.pos = v => {
    const cats = [...new Set((db.products || []).filter(p => p.available).map(p => p.category))];
    const subtotal = cart.reduce((s, x) => s + num(x.price) * num(x.qty), 0);
    const discount = Math.min(Math.max(0, num(document.getElementById('discount')?.value)), subtotal);
    const tax = Math.max(0, subtotal - discount) * Math.max(0, num(db.settings?.tax)) / 100;
    const deliveryFee = Math.max(0, num(document.getElementById('deliveryFee')?.value));
    const total = subtotal - discount + tax + deliveryFee;
    v.innerHTML = shell('POS / Orders', 'Fast billing · cash/card/COD · table or delivery', `<div class="poslayout"><div class="panel"><div class="toolbar"><input id="productSearch" class="field" placeholder="Search menu..." oninput="renderPosProducts()"><select id="posCat" class="field" onchange="renderPosProducts()"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div><div id="posProducts" class="productgrid"></div></div><div class="panel cartpanel"><h2>Current Order</h2><div id="cartLines">${cart.map((x,i) => `<div class="orderline"><span>${esc(x.name)} × ${x.qty}</span><span>${money(x.price*x.qty)} <button class="mini danger" onclick="removeItem(${i})">×</button></span></div>`).join('') || '<p class="muted">No items yet</p>'}</div><div class="formgrid"><label>Type<select id="orderType" class="field"><option>Dine-in</option><option>Takeaway</option><option>Delivery</option></select></label><label>Payment<select id="payment" class="field"><option>Cash</option><option>Card</option><option>Online</option><option>COD</option><option>Bank Transfer / Raast</option></select></label><label>Discount<input id="discount" class="field" type="number" min="0" value="0" oninput="updatePosTotals()"></label><label>Delivery Fee<input id="deliveryFee" class="field" type="number" min="0" value="0" oninput="updatePosTotals()"></label><label>Customer<input id="customerName" class="field" placeholder="Optional"></label><label class="wide">Address<input id="deliveryAddress" class="field" placeholder="Delivery address"></label></div><div id="posTotals" class="grid cards" style="margin-top:12px"><div class="card"><small>Subtotal</small><strong>${money(subtotal)}</strong></div><div class="card"><small>Discount</small><strong>${money(discount)}</strong></div><div class="card"><small>Tax</small><strong>${money(tax)}</strong></div><div class="card"><small>Total</small><strong>${money(total)}</strong></div></div><div class="notice" style="margin-top:12px">Cash/COD can settle offline. Card, Online and Raast payments require a real provider/bank configuration and remain pending verification until a trusted integration confirms settlement.</div><button class="btn widebtn" ${cart.length ? '' : 'disabled'} onclick="checkout()">Complete Sale</button></div></div>`);
    renderPosProducts();
  };

  const originalDashboard = views.dashboard;
  views.dashboard = v => {
    originalDashboard(v);
    const r = window.mkFoodsProductionReadiness();
    const node = document.createElement('div');
    node.className = 'panel';
    node.style.marginTop = '14px';
    node.innerHTML = `<h2>Production Readiness</h2><div class="grid cards"><div class="card"><small>Offline Cash</small><strong>${r.offlineCash ? 'READY' : 'CHECK'}</strong></div><div class="card"><small>Banking</small><strong>${r.banking ? 'CONFIGURED' : 'SETUP NEEDED'}</strong></div><div class="card"><small>Printer</small><strong>${r.printer ? 'SELECTED' : 'SETUP NEEDED'}</strong></div><div class="card"><small>Audit / Inventory</small><strong>${r.audit && r.inventory ? 'READY' : 'CHECK'}</strong></div></div>`;
    v.appendChild(node);
  };
})();