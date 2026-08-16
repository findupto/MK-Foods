(() => {
  'use strict';

  const KEY = 'mkfoods.order.workflow.v2';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const state = Object.assign({ schema: 2, orders: {} }, load());
  const now = () => new Date().toISOString();
  const escW = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const currentUser = () => window.session?.username || 'system';
  const staff = () => ((db && db.staff) || []).filter(x => x.active !== false);
  const kitchens = ['Fastfood Kitchen', 'Biryani Kitchen', 'Shake Kitchen'];
  const kitchenFor = item => {
    const v = `${item?.category || ''} ${item?.name || ''}`.toLowerCase();
    if (/shake|drink|beverage|juice|lassi|cold/.test(v)) return 'Shake Kitchen';
    if (/biryani|rice|pulao|karahi/.test(v)) return 'Biryani Kitchen';
    return 'Fastfood Kitchen';
  };
  const order = id => (db.orders || []).find(x => x.id === id);
  const get = id => state.orders[id] || null;
  const ensure = (id) => {
    if (!state.orders[id]) state.orders[id] = { orderId:id, stage:'collected', events:[], assignments:{}, createdAt:now() };
    return state.orders[id];
  };
  const event = (id, action, data = {}) => {
    const w = ensure(id);
    w.events.push({ at:now(), action, user:currentUser(), ...data });
    save();
    return w;
  };
  const stage = (id, value) => { ensure(id).stage = value; save(); };

  function notify(message, kind = 'info') {
    let box = document.getElementById('workflowToast');
    if (!box) {
      box = document.createElement('div'); box.id = 'workflowToast'; box.className = 'workflow-toast'; document.body.appendChild(box);
    }
    box.className = `workflow-toast ${kind}`; box.textContent = message; box.hidden = false;
    clearTimeout(box._timer); box._timer = setTimeout(() => { box.hidden = true; }, 3500);
  }

  function modal(title, body, buttons = []) {
    let root = document.getElementById('workflowModal');
    if (!root) { root = document.createElement('div'); root.id = 'workflowModal'; root.className = 'workflow-modal'; document.body.appendChild(root); }
    root.innerHTML = `<div class="workflow-backdrop" data-close="1"></div><div class="workflow-dialog"><div class="workflow-dialog-head"><h2>${escW(title)}</h2><button class="mini" data-close="1">×</button></div><div class="workflow-dialog-body">${body}</div><div class="workflow-dialog-actions">${buttons.map((b,i)=>`<button class="btn ${b.secondary?'secondary':''}" data-action="${i}">${escW(b.label)}</button>`).join('')}</div></div>`;
    root.hidden = false;
    const close = () => { root.hidden = true; root.innerHTML = ''; };
    root.querySelectorAll('[data-close]').forEach(x => x.onclick = close);
    root.querySelectorAll('[data-action]').forEach(x => x.onclick = async () => { const b = buttons[Number(x.dataset.action)]; try { await b.run?.(root); } finally { if (b.close !== false) close(); } });
    return { root, close };
  }

  function queueReceipt(o, type, items = o.items || []) {
    const copy = { ...o, id: o.id, items, printDocumentType:type, printStatus:'queued', queuedAt:now() };
    if (typeof window.queueOrderForPrint === 'function') {
      window.queueOrderForPrint(copy);
      notify(`${type} added to Print Manager`, 'success');
    } else {
      notify('Print Manager is not ready. Open Print Manager and try again.', 'error');
    }
  }

  function assignKitchens(id) {
    const o = order(id); if (!o) return;
    const w = ensure(id);
    const groups = {};
    (o.items || []).forEach(item => { const k = kitchenFor(item); (groups[k] ||= []).push(item); });
    Object.keys(groups).forEach(k => { if (!w.assignments[k]) w.assignments[k] = { status:'pending', items:groups[k].map(x => x.id) }; });
    w.kitchens = Object.keys(groups); save();
  }

  function selectStaff(title, onDone) {
    const options = staff().map(x => `<option value="${escW(x.username)}">${escW(x.name || x.username)}</option>`).join('');
    modal(title, `<label class="field-label">Responsible staff<select id="workflowStaff" class="field"><option value="">Select staff...</option>${options}</select></label>`, [
      { label:'Cancel', secondary:true },
      { label:'Continue', run:root => { const v = root.querySelector('#workflowStaff')?.value; if (!v) { notify('Select a staff member first.', 'error'); return Promise.reject(new Error('staff')); } onDone(v); } }
    ]);
  }

  window.collectOrder = async () => {
    if (!Array.isArray(cart) || !cart.length) return notify('Add at least one item.', 'error');
    const type = document.getElementById('orderType')?.value || 'Takeaway';
    const address = document.getElementById('deliveryAddress')?.value || '';
    if (type === 'Delivery' && !address.trim()) return notify('Delivery address is required.', 'error');
    for (const item of cart) {
      const p = db.products?.find(x => x.id === item.id);
      if (!p || Number(item.qty) <= 0 || Number(item.qty) > Number(p.stock || 0)) return notify(`Stock unavailable: ${item.name}`, 'error');
    }
    const subtotal = cart.reduce((s,x) => s + Number(x.price||0) * Number(x.qty||0), 0);
    const discount = Math.min(Math.max(Number(document.getElementById('discount')?.value || 0),0), subtotal);
    const tax = Math.max(0, subtotal-discount) * Math.max(0, Number(db.settings?.tax||0)) / 100;
    const deliveryFee = Math.max(0, Number(document.getElementById('deliveryFee')?.value || 0));
    const total = subtotal - discount + tax + deliveryFee;
    const customerId = document.getElementById('workflowCustomer')?.value || '';
    const customer = db.customers?.find(x => x.id === customerId);
    const id = `ORD-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const user = currentUser();
    const orderData = {
      id, createdAt:now(), items:cart.map(({id,name,price,qty,category}) => ({id,name,price,qty,category})),
      subtotal, discount, tax, deliveryFee, total, payment:'Cash', paymentStatus:'unpaid',
      orderType:type, address, customerId, customerName:customer?.name || '', status:'new',
      workflowStatus:'collected', collectedBy:user, createdBy:user,
      counterId:document.getElementById('counterId')?.value || '', tableId:document.getElementById('tableId')?.value || ''
    };
    const r = await api(window.mkFoods.createOrder, orderData);
    if (r?.ok === false) return handleAuthError(r);
    state.orders[id] = { orderId:id, stage:'collected', collectedBy:user, events:[], assignments:{}, createdAt:orderData.createdAt };
    assignKitchens(id); event(id,'ORDER_COLLECTED',{collectedBy:user, customerName:orderData.customerName});
    cart = [];
    await load();
    go('orderflow');
    notify(`Order ${id} collected. Review it in Order Flow.`,'success');
  };

  window.forwardKitchen = async (id, kitchen) => {
    const o = order(id); if (!o) return;
    selectStaff(`Forward ${id} to ${kitchen}`, async by => {
      const w = ensure(id); assignKitchens(id); w.assignments[kitchen] = { ...(w.assignments[kitchen]||{}), status:'preparing', forwardedBy:by, forwardedAt:now() };
      stage(id,'kitchen'); event(id,'FORWARDED_TO_KITCHEN',{kitchen, forwardedBy:by});
      queueReceipt({ ...o, items:(o.items||[]).filter(i => kitchenFor(i) === kitchen) }, `${kitchen} Kitchen Ticket`);
      renderOrderFlow();
    });
  };

  window.markPrepared = (id, kitchen) => selectStaff(`Mark ${kitchen} prepared`, by => {
    const w = ensure(id); w.assignments[kitchen] = { ...(w.assignments[kitchen]||{}), status:'prepared', preparedBy:by, preparedAt:now() };
    event(id,'KITCHEN_PREPARED',{kitchen, preparedBy:by});
    const all = (w.kitchens||[]).every(k => w.assignments[k]?.status === 'prepared' || w.assignments[k]?.status === 'ready');
    if (all) stage(id,'ready'); else save(); renderOrderFlow();
  });

  window.markReady = (id, kitchen) => selectStaff(`Mark ${kitchen} ready`, by => {
    const w = ensure(id); w.assignments[kitchen] = { ...(w.assignments[kitchen]||{}), status:'ready', readyBy:by, readyAt:now() };
    event(id,'KITCHEN_READY',{kitchen, readyBy:by});
    if ((w.kitchens||[]).every(k => w.assignments[k]?.status === 'ready')) stage(id,'ready'); else save(); renderOrderFlow();
  });

  window.sendToCounter = id => selectStaff('Send order to counter', by => {
    stage(id,'counter'); const w=ensure(id); w.counterBy=by; w.sentToCounterAt=now(); event(id,'READY_SENT_TO_COUNTER',{counterBy:by}); renderOrderFlow();
  });

  window.collectCash = id => {
    const o = order(id); if (!o) return;
    const due = Number(o.total || 0);
    const staffOptions = staff().map(x => `<option value="${escW(x.username)}">${escW(x.name||x.username)}</option>`).join('');
    modal(`Settle ${id}`, `<div class="payment-summary"><span>Amount due</span><strong>${money(due)}</strong></div><div class="formgrid"><label>Cashier<select id="cashier" class="field"><option value="">Select cashier...</option>${staffOptions}</select></label><label>Cash received<input id="cashReceived" class="field" type="number" min="${due}" step="0.01" value="${due}"></label></div><div id="changePreview" class="payment-change">Change: ${money(0)}</div>`, [
      {label:'Cancel',secondary:true},
      {label:'Complete & Queue Receipt',run:async root=>{
        const cashier=root.querySelector('#cashier')?.value, received=Number(root.querySelector('#cashReceived')?.value||0);
        if(!cashier || !Number.isFinite(received) || received < due){ notify('Select cashier and enter enough cash.','error'); return Promise.reject(new Error('payment')); }
        const r=await api(window.mkFoods.orderStatus,id,'completed'); if(r?.ok===false){handleAuthError(r);return Promise.reject(new Error('status'));}
        const w=ensure(id); w.cashCollectedBy=cashier; w.cashReceived=received; w.change=received-due; w.cashCollectedAt=now(); stage(id,'completed'); event(id,'CASH_COLLECTED',{cashCollectedBy:cashier,cashReceived:received,change:received-due});
        queueReceipt({...o,payment:'Cash',paymentStatus:'settled'},'Sale Receipt'); await load(); renderOrderFlow();
      }}
    ]);
    setTimeout(()=>{const el=document.getElementById('cashReceived'),out=document.getElementById('changePreview'); if(el&&out)el.oninput=()=>out.textContent=`Change: ${money(Math.max(0,Number(el.value||0)-due))}`;},0);
  };

  window.showOrderTracking = id => {
    const o=order(id), w=get(id); if(!o||!w)return;
    const events=(w.events||[]).map(e=>`<div class="timeline-item"><span class="timeline-dot"></span><div><b>${escW(e.action.replaceAll('_',' '))}</b><div class="muted">${escW(e.user)} · ${new Date(e.at).toLocaleString()}</div></div></div>`).join('');
    const kitchensHtml=(w.kitchens||[]).map(k=>{const a=w.assignments?.[k]||{};return `<div class="tracking-kitchen"><b>${escW(k)}</b><span class="tag">${escW(a.status||'pending')}</span><small>Forwarded: ${escW(a.forwardedBy||'-')} · Prepared: ${escW(a.preparedBy||'-')} · Ready: ${escW(a.readyBy||'-')}</small></div>`}).join('');
    openDetail(`Order Tracking · ${id}`, `<div class="tracking-hero"><div><span class="muted">Customer</span><h2>${escW(o.customerName||'Walk-in')}</h2></div><div class="tracking-total">${money(o.total)}</div></div><div class="detail-grid"><div class="detail-kv"><span>Stage</span><b>${escW(w.stage||o.status)}</b></div><div class="detail-kv"><span>Collected</span><b>${escW(w.collectedBy||'-')}</b></div><div class="detail-kv"><span>Counter</span><b>${escW(w.counterBy||'-')}</b></div><div class="detail-kv"><span>Cashier</span><b>${escW(w.cashCollectedBy||'-')}</b></div></div><h3>Kitchen Tracking</h3><div class="tracking-kitchens">${kitchensHtml||'<span class="muted">No kitchen assignments.</span>'}</div><h3>Timeline</h3><div class="workflow-timeline">${events||'<span class="muted">No events recorded.</span>'}</div>`);
  };

  window.renderOrderFlow = () => {
    const v=document.getElementById('view'); if(!v)return;
    const orders=(db.orders||[]).slice().reverse();
    const cards=orders.map(o=>{
      const w=ensure(o.id); if(!w.kitchens?.length)assignKitchens(o.id);
      const current=get(o.id)||w, stageName=current.stage||o.status||'new';
      const kitchenCards=(current.kitchens||[]).map(k=>{const a=current.assignments?.[k]||{};let action='';
        if(a.status==='pending') action=`<button class="mini" onclick="forwardKitchen('${escW(o.id)}','${escW(k)}')">Send to ${escW(k)}</button>`;
        else if(a.status==='preparing') action=`<button class="mini" onclick="markPrepared('${escW(o.id)}','${escW(k)}')">Prepared</button>`;
        else if(a.status==='prepared') action=`<button class="mini" onclick="markReady('${escW(o.id)}','${escW(k)}')">Ready</button>`;
        return `<div class="workflow-kitchen-card"><div><b>${escW(k)}</b><span class="tag">${escW(a.status||'pending')}</span></div><small>${(a.items||[]).length} item group</small>${action}</div>`;
      }).join('');
      const counter=stageName==='ready'?`<button class="btn" onclick="sendToCounter('${escW(o.id)}')">Send to Counter</button>`:'';
      const payment=stageName==='counter'?`<button class="btn" onclick="collectCash('${escW(o.id)}')">Settle Payment</button>`:'';
      const track=`<button class="btn secondary" onclick="showOrderTracking('${escW(o.id)}')">Track Order</button>`;
      return `<article class="workflow-order-card"><div class="workflow-order-head"><div><div class="order-number">${escW(o.id)}</div><div class="muted">${escW(o.customerName||'Walk-in')} · ${escW(o.orderType||'Takeaway')} · ${new Date(o.createdAt||Date.now()).toLocaleString()}</div></div><div class="workflow-stage ${escW(stageName)}">${escW(stageName)}</div></div><div class="workflow-items">${(o.items||[]).map(i=>`<div><span>${escW(i.qty)} × ${escW(i.name)}</span><b>${money(Number(i.price)*Number(i.qty))}</b></div>`).join('')}</div><div class="workflow-kitchens">${kitchenCards}</div><div class="workflow-actions">${counter}${payment}${track}</div></article>`;
    }).join('');
    v.innerHTML=shell('Order Flow','Live control board · Collection → Kitchens → Ready → Counter → Payment', `<div class="workflow-board"><div class="workflow-board-head"><div><h2>Live Orders</h2><p class="muted">Each kitchen has its own status. Every action is tracked with staff and time.</p></div><div class="actions"><button class="btn secondary" onclick="go('pos')">New Order</button><button class="btn secondary" onclick="go('printmanager')">Print Manager</button></div></div>${cards||'<div class="panel empty-state"><h2>No orders</h2><p class="muted">Collected orders will appear here.</p></div>'}</div>`);
  };

  const oldPos = views.pos;
  views.pos = v => {
    const products=db.products||[], cats=[...new Set(products.filter(p=>p.available).map(p=>p.category))], customers=db.customers||[];
    v.innerHTML=shell('Collect Order','Fast order entry with customer, table, counter and delivery details', `<div class="poslayout"><div class="panel"><div class="toolbar"><input id="productSearch" class="field" placeholder="Search menu..." oninput="renderPosProducts()"><select id="posCat" class="field" onchange="renderPosProducts()"><option value="">All categories</option>${cats.map(c=>`<option>${escW(c)}</option>`).join('')}</select></div><div id="posProducts" class="productgrid"></div></div><div class="panel cartpanel"><div class="cart-header"><div><h2>Current Order</h2><span class="muted">Add items, then collect.</span></div><button class="mini danger" onclick="cart=[];render()">Clear</button></div><div id="cartLines">${cart.map((x,i)=>`<div class="orderline"><div><b>${escW(x.name)}</b><small>${money(x.price)} each</small></div><div class="line-controls"><button class="mini" onclick="cart[${i}].qty=Math.max(1,cart[${i}].qty-1);render()">−</button><b>${x.qty}</b><button class="mini" onclick="add('${escW(x.id)}')">+</button><button class="mini danger" onclick="removeItem(${i})">×</button></div></div>`).join('')||'<div class="empty-state"><b>No items yet</b><span class="muted">Select menu items on the left.</span></div>'}</div><div class="formgrid"><label>Customer<select id="workflowCustomer" class="field"><option value="">Walk-in</option>${customers.map(c=>`<option value="${escW(c.id)}">${escW(c.name)}${c.phone?' · '+escW(c.phone):''}</option>`).join('')}</select></label><label>Order Type<select id="orderType" class="field"><option>Takeaway</option><option>Dine-in</option><option>Delivery</option><option>Drive-thru</option><option>Kiosk</option></select></label><label>Table<select id="tableId" class="field"><option value="">No table</option>${(db.tables||[]).map(t=>`<option value="${escW(t.id)}">${escW(t.name)}</option>`).join('')}</select></label><label>Counter<select id="counterId" class="field"><option value="">Not assigned</option>${(db.counters||[]).map(c=>`<option value="${escW(c.id)}">${escW(c.name)}</option>`).join('')}</select></label><label>Discount<input id="discount" class="field" type="number" min="0" value="0"></label><label>Delivery Fee<input id="deliveryFee" class="field" type="number" min="0" value="0"></label><label class="wide">Delivery Address<input id="deliveryAddress" class="field" placeholder="Required for delivery"></label></div><div class="order-total-bar"><span>Total</span><strong>${money(cart.reduce((s,x)=>s+Number(x.price)*Number(x.qty),0))}</strong></div><button class="btn widebtn" ${cart.length?'':'disabled'} onclick="collectOrder()">Collect Order</button><button class="btn secondary widebtn" onclick="go('orderflow')">Open Live Order Flow</button></div></div>`);
    renderPosProducts();
  };

  views.orderflow = () => renderOrderFlow();
})();