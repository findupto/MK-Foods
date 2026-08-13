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

  // Replace the original checkout with a stricter calculation and payment guard.
  // Online payments are never marked settled unless a trusted provider adapter has
  // supplied a verified transaction reference. Cash remains fully offline-capable.
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

    const r = await (typeof api === 'function'
      ? api(window.mkFoods.createOrder, order)
      : window.mkFoods.createOrder(order));
    if (r?.ok === false) { if (typeof handleAuthError === 'function') handleAuthError(r); return; }
    cart = [];
    await load();
    alert(`Order ${order.id} recorded. Payment status: ${order.paymentStatus}.`);
  };

  // Add a compact readiness panel to the dashboard without changing the existing dashboard code.
  const originalDashboard = views.dashboard;
  views.dashboard = v => {
    originalDashboard(v);
    const r = window.mkFoodsProductionReadiness();
    const node = document.createElement('div');
    node.className = 'panel';
    node.style.marginTop = '14px';
    node.innerHTML = `<h2>Production Readiness</h2><div class="grid cards">
      <div class="card"><small>Offline Cash</small><strong>${r.offlineCash ? 'READY' : 'CHECK'}</strong></div>
      <div class="card"><small>Banking</small><strong>${r.banking ? 'CONFIGURED' : 'SETUP NEEDED'}</strong></div>
      <div class="card"><small>Printer</small><strong>${r.printer ? 'SELECTED' : 'SETUP NEEDED'}</strong></div>
      <div class="card"><small>Audit / Inventory</small><strong>${r.audit && r.inventory ? 'READY' : 'CHECK'}</strong></div>
    </div>`;
    v.appendChild(node);
  };
})();
