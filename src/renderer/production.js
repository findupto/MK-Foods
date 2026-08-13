(() => {
  const num = v => Number(v || 0);
  const arr = k => Array.isArray(db?.[k]) ? db[k] : [];
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

  window.updatePosTotals = () => {
    const subtotal = cart.reduce((s, x) => s + num(x.price) * Math.max(0, num(x.qty)), 0);
    const discount = Math.min(Math.max(0, num(document.getElementById('discount')?.value)), subtotal);
    const tax = Math.max(0, subtotal - discount) * Math.max(0, num(db?.settings?.tax)) / 100;
    const fee = Math.max(0, num(document.getElementById('deliveryFee')?.value));
    const vals = [subtotal, discount, tax, subtotal - discount + tax + fee];
    document.querySelectorAll('#posTotals strong').forEach((el, i) => {
      if (vals[i] !== undefined) el.textContent = money(vals[i]);
    });
  };

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
    const customerId = document.getElementById('customerId')?.value || '';
    const customer = arr('customers').find(c => c.id === customerId);
    const tableId = document.getElementById('tableId')?.value || '';
    const counterId = document.getElementById('counterId')?.value || '';
    const servedBy = document.getElementById('servedBy')?.value || '';
    const preparedBy = document.getElementById('preparedBy')?.value || '';
    const cashCollectedBy = document.getElementById('cashCollectedBy')?.value || session?.username || '';

    if ((payment === 'Online' || payment === 'Bank Transfer / Raast') && !bankReady()) {
      return alert('Online banking is not configured. Open Banking and complete merchant/provider setup first.');
    }
    if (payment === 'Card' && !bankReady()) {
      return alert('Card processing requires a configured acquiring/payment provider.');
    }
    if (type === 'Delivery' && !address.trim()) return alert('Delivery address is required.');
    if (payment === 'Due' && !customerId) return alert('Select a customer before recording a due sale.');

    for (const item of cart) {
      const product = arr('products').find(p => p.id === item.id);
      if (!product) return alert(`Product no longer exists: ${item.name}`);
      if (num(item.qty) <= 0 || num(item.qty) > num(product.stock)) {
        return alert(`Not enough stock for ${item.name}. Available: ${num(product.stock)}`);
      }
    }

    const settledOffline = payment === 'Cash';
    const codDue = payment === 'COD' || payment === 'Due';
    const digital = ['Card', 'Online', 'Bank Transfer / Raast'].includes(payment);
    const order = {
      id: 'ORD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
      items: cart.map(({id, name, price, qty}) => ({id, name, price, qty})),
      subtotal,
      discount,
      tax,
      deliveryFee,
      total,
      payment,
      orderType: type,
      address,
      customerId,
      customerName: customer?.name || '',
      tableId,
      counterId,
      servedBy,
      preparedBy,
      cashCollectedBy,
      createdBy: session?.username || '',
      status: digital ? 'payment_pending' : 'new',
      paymentStatus: settledOffline ? 'settled' : (codDue ? 'unpaid' : 'pending_verification'),
      paymentReference: '',
      paymentVerifiedAt: null,
      paidAmount: settledOffline ? total : 0
    };

    if (digital) {
      const ref = prompt('Enter the provider/bank transaction reference. Leave blank to cancel:')?.trim();
      if (!ref) return;
      order.paymentReference = ref;
    }

    const r = await (typeof api === 'function' ? api(window.mkFoods.createOrder, order) : window.mkFoods.createOrder(order));
    if (r?.ok === false) {
      if (typeof handleAuthError === 'function') handleAuthError(r);
      return;
    }
    cart = [];
    await load();
    if (typeof openDetail === 'function') {
      openDetail('Sale Recorded', `<div class="detail-grid">
        <div class="detail-kv"><span>Order</span><b>${esc(order.id)}</b></div>
        <div class="detail-kv"><span>Total</span><b>${money(order.total)}</b></div>
        <div class="detail-kv"><span>Payment</span><b>${esc(payment)}</b></div>
        <div class="detail-kv"><span>Payment status</span><b>${esc(order.paymentStatus)}</b></div>
        <div class="detail-kv"><span>Cashier</span><b>${esc(order.createdBy)}</b></div>
        <div class="detail-kv"><span>Customer</span><b>${esc(order.customerName || 'Walk-in')}</b></div>
      </div><div class="detail-actions"><button class="btn" onclick="closeDetail()">Done</button></div>`);
    } else {
      alert(`Order ${order.id} recorded. Payment status: ${order.paymentStatus}.`);
    }
  };

  views.pos = v => {
    const products = arr('products');
    const cats = [...new Set(products.filter(p => p.available).map(p => p.category))];
    const users = arr('staff').filter(s => s.active !== false);
    const subtotal = cart.reduce((s, x) => s + num(x.price) * num(x.qty), 0);
    const discount = Math.min(Math.max(0, num(document.getElementById('discount')?.value)), subtotal);
    const tax = Math.max(0, subtotal - discount) * Math.max(0, num(db?.settings?.tax)) / 100;
    const deliveryFee = Math.max(0, num(document.getElementById('deliveryFee')?.value));
    const total = subtotal - discount + tax + deliveryFee;
    v.innerHTML = shell('POS / Orders', 'Fast billing · complete responsibility tracking · offline cash', `<div class="poslayout">
      <div class="panel">
        <div class="toolbar"><input id="productSearch" class="field" placeholder="Search menu..." oninput="renderPosProducts()"><select id="posCat" class="field" onchange="renderPosProducts()"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div id="posProducts" class="productgrid"></div>
      </div>
      <div class="panel cartpanel">
        <h2>Current Order</h2>
        <div id="cartLines">${cart.map((x,i) => `<div class="orderline"><span>${esc(x.name)} × ${x.qty}</span><span>${money(x.price*x.qty)} <button class="mini danger" onclick="removeItem(${i})">×</button></span></div>`).join('') || '<p class="muted">No items yet</p>'}</div>
        <div class="formgrid">
          <label>Type<select id="orderType" class="field"><option>Dine-in</option><option>Takeaway</option><option>Delivery</option></select></label>
          <label>Payment<select id="payment" class="field"><option>Cash</option><option>Card</option><option>Online</option><option>COD</option><option>Due</option><option>Bank Transfer / Raast</option></select></label>
          <label>Table<select id="tableId" class="field"><option value="">No table</option>${arr('tables').map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>
          <label>Counter<select id="counterId" class="field"><option value="">Not assigned</option>${arr('counters').map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
          <label>Customer<select id="customerId" class="field"><option value="">Walk-in</option>${arr('customers').map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`).join('')}</select></label>
          <label>Server<select id="servedBy" class="field"><option value="">Not assigned</option>${users.map(s => `<option value="${esc(s.username)}">${esc(s.name || s.username)}</option>`).join('')}</select></label>
          <label>Prepared by<select id="preparedBy" class="field"><option value="">Kitchen to assign</option>${users.map(s => `<option value="${esc(s.username)}">${esc(s.name || s.username)}</option>`).join('')}</select></label>
          <label>Cash collected by<select id="cashCollectedBy" class="field"><option value="${esc(session?.username || '')}">${esc(session?.username || 'Current user')}</option>${users.filter(s => s.username !== session?.username).map(s => `<option value="${esc(s.username)}">${esc(s.name || s.username)}</option>`).join('')}</select></label>
          <label>Discount<input id="discount" class="field" type="number" min="0" value="0" oninput="updatePosTotals()"></label>
          <label>Delivery Fee<input id="deliveryFee" class="field" type="number" min="0" value="0" oninput="updatePosTotals()"></label>
          <label class="wide">Address<input id="deliveryAddress" class="field" placeholder="Delivery address"></label>
        </div>
        <div id="posTotals" class="grid cards" style="margin-top:12px"><div class="card"><small>Subtotal</small><strong>${money(subtotal)}</strong></div><div class="card"><small>Discount</small><strong>${money(discount)}</strong></div><div class="card"><small>Tax</small><strong>${money(tax)}</strong></div><div class="card"><small>Total</small><strong>${money(total)}</strong></div></div>
        <div class="notice" style="margin-top:12px">Cash settles offline. Card, Online and Raast remain pending verification until a trusted bank/provider integration confirms settlement. Due sales require a customer.</div>
        <button class="btn widebtn" ${cart.length ? '' : 'disabled'} onclick="checkout()">Complete Sale</button>
      </div>
    </div>`);
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
