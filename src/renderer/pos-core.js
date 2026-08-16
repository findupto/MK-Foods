(() => {
  'use strict';

  const KEY = 'mkfoods.pos.core.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const state = Object.assign({ schema: 1, parked: {}, payments: {}, approvals: [], tableOrders: {}, reservations: [] }, read());
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const now = () => new Date().toISOString();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const money2 = n => typeof money === 'function' ? money(Number(n || 0)) : `Rs. ${Number(n || 0).toFixed(2)}`;
  const user = () => window.session?.username || 'system';
  const role = () => window.session?.role || 'Cashier';
  const canApprove = () => ['Admin', 'Owner', 'Manager'].includes(role());
  const toast = (m, kind='info') => {
    let b = document.getElementById('posCoreToast');
    if (!b) { b = document.createElement('div'); b.id='posCoreToast'; b.className='workflow-toast'; document.body.appendChild(b); }
    b.className = `workflow-toast ${kind}`; b.textContent=m; b.hidden=false; clearTimeout(b._t); b._t=setTimeout(()=>b.hidden=true,3200);
  };
  const log = (action, data={}) => { state.approvals.push({ at:now(), action, user:user(), role:role(), ...data }); state.approvals = state.approvals.slice(-500); save(); };

  const cartSubtotal = items => (items || []).reduce((s,i) => s + Number(i.price||0) * Number(i.qty||0), 0);
  const discountValue = (subtotal, value, type='fixed') => type === 'percent' ? subtotal * Math.min(100,Math.max(0,Number(value||0))) / 100 : Math.min(subtotal,Math.max(0,Number(value||0)));
  const totals = (items, discount=0, deliveryFee=0) => { const subtotal=cartSubtotal(items); const d=Math.min(subtotal,Math.max(0,Number(discount||0))); const tax=Math.max(0,subtotal-d)*Math.max(0,Number(db.settings?.tax||0))/100; return {subtotal,discount:d,tax,deliveryFee:Number(deliveryFee||0),total:Math.max(0,subtotal-d+tax+Number(deliveryFee||0))}; };

  function normalizeCartItem(item) {
    return { id:item.id, name:item.name, category:item.category||'General', price:Number(item.price||0), qty:Number(item.qty||1), notes:item.notes||'', modifiers:Array.isArray(item.modifiers)?item.modifiers:[], variant:item.variant||'', station:item.station||'' };
  }
  function modifierDialog(product, done) {
    const groups = product.modifierGroups || product.modifiers || [];
    if (!groups.length) return done([],'');
    const html = groups.map((g,gi) => {
      const opts = (g.options||g.items||[]).map((o,oi)=>`<label class="checkrow"><input type="${g.required?'radio':'checkbox'}" name="mg${gi}" value="${oi}"><span>${esc(o.name||o.label)} ${o.price?`(+${money2(o.price)})`:''}</span></label>`).join('');
      return `<div class="modifier-group"><b>${esc(g.name||`Options ${gi+1}`)}${g.required?' *':''}</b>${opts}</div>`;
    }).join('');
    const root=document.createElement('div'); root.className='workflow-modal'; root.innerHTML=`<div class="workflow-backdrop"></div><div class="workflow-dialog"><div class="workflow-dialog-head"><h2>${esc(product.name)} options</h2><button class="mini" data-x>×</button></div><div class="workflow-dialog-body">${html}<label class="field-label">Item note<textarea class="field" data-note placeholder="No onions, extra spicy..."></textarea></label></div><div class="workflow-dialog-actions"><button class="btn secondary" data-x>Cancel</button><button class="btn" data-ok>Add to order</button></div></div>`;
    document.body.appendChild(root);
    const close=()=>root.remove(); root.querySelectorAll('[data-x]').forEach(x=>x.onclick=close);
    root.querySelector('[data-ok]').onclick=()=>{ const selected=[]; let valid=true; groups.forEach((g,gi)=>{const els=[...root.querySelectorAll(`[name=mg${gi}]:checked`)]; if(g.required&&!els.length)valid=false; els.forEach(e=>{const o=(g.options||g.items||[])[Number(e.value)]; if(o)selected.push({...o,group:g.name});});}); if(!valid)return toast('Select all required modifiers.','error'); done(selected,root.querySelector('[data-note]').value||''); close(); };
  }

  async function addCore(id) {
    const p=(db.products||[]).find(x=>x.id===id); if(!p)return;
    const stock=Number(p.stock||0), existing=(cart||[]).find(x=>x.id===id); if(existing&&existing.qty>=stock)return toast('Not enough stock.','error');
    modifierDialog(p,(mods,note)=>{ const extra=mods.reduce((s,m)=>s+Number(m.price||0),0); if(existing){existing.qty++; existing.modifiers=[...(existing.modifiers||[]),...mods]; if(note)existing.notes=[existing.notes,note].filter(Boolean).join('; ');} else cart.push(normalizeCartItem({...p,price:Number(p.price||0)+extra,modifiers:mods,notes:note})); render(); });
  }

  function renderCoreProducts() {
    const el=document.getElementById('posCoreProducts'); if(!el)return; const q=(document.getElementById('posCoreSearch')?.value||'').toLowerCase(), cat=document.getElementById('posCoreCat')?.value||'';
    el.innerHTML=(db.products||[]).filter(p=>p.available&&(!cat||p.category===cat)&&(!q||String(p.name).toLowerCase().includes(q))).map(p=>`<button class="product" onclick="posCoreAdd('${esc(p.id)}')"><b>${esc(p.name)}</b><span>${esc(p.category||'')} · ${money2(p.price)} · ${Number(p.stock||0)} in stock</span></button>`).join('')||'<p class="muted">No matching items.</p>';
  }

  function paymentRows(total) {
    const payments=state.currentPayments||[{method:'Cash',amount:total}]; const paid=payments.reduce((s,p)=>s+Number(p.amount||0),0); const change=Math.max(0,paid-total); const due=Math.max(0,total-paid);
    return `<div id="posCorePayments">${payments.map((p,i)=>`<div class="payment-row"><select class="field" data-pay-method="${i}">${['Cash','Card','Online','COD','Bank Transfer','Customer Credit','Advance'].map(m=>`<option ${m===p.method?'selected':''}>${m}</option>`).join('')}</select><input class="field" data-pay-amount="${i}" type="number" min="0" step=".01" value="${Number(p.amount||0)}"><button class="mini danger" onclick="posCoreRemovePayment(${i})">×</button></div>`).join('')}</div><div class="payment-summary"><span>Paid ${money2(paid)}</span><b>${due>0?`Due ${money2(due)}`:`Change ${money2(change)}`}</b></div><button class="mini" onclick="posCoreAddPayment()">+ Payment method</button>`;
  }

  function currentTotals() { const d=document.getElementById('posCoreDiscount')?.value||0, dt=document.getElementById('posCoreDiscountType')?.value||'fixed', fee=document.getElementById('posCoreDeliveryFee')?.value||0; return totals(cart,d,fee); }
  function syncPayments(){ const rows=[...document.querySelectorAll('#posCorePayments .payment-row')]; state.currentPayments=rows.map((r,i)=>({method:r.querySelector(`[data-pay-method="${i}"]`)?.value||'Cash',amount:Number(r.querySelector(`[data-pay-amount="${i}"]`)?.value||0)})); save(); }

  window.posCoreAdd=id=>addCore(id);
  window.posCoreAddPayment=()=>{ syncPayments(); state.currentPayments.push({method:'Cash',amount:0}); save(); render(); };
  window.posCoreRemovePayment=i=>{ syncPayments(); state.currentPayments.splice(i,1); if(!state.currentPayments.length)state.currentPayments.push({method:'Cash',amount:0}); save(); render(); };
  window.posCoreHold=()=>{ if(!cart.length)return toast('Add items before parking the order.','error'); syncPayments(); const id='PARK-'+Date.now(); const t=currentTotals(); state.parked[id]={id,createdAt:now(),createdBy:user(),items:cart.map(normalizeCartItem),...t,orderType:document.getElementById('posCoreType')?.value||'Takeaway',customerName:document.getElementById('posCoreCustomer')?.value||'',tableId:document.getElementById('posCoreTable')?.value||'',payments:state.currentPayments||[]}; save(); cart=[]; state.currentPayments=[]; render(); toast(`${id} parked.`,'success'); };
  window.posCoreRecall=id=>{ const p=state.parked[id]; if(!p)return; if(cart.length)return toast('Finish or park the current cart first.','error'); cart=p.items.map(normalizeCartItem); state.currentPayments=p.payments||[]; delete state.parked[id]; save(); render(); toast(`${id} recalled.`,'success'); };
  window.posCoreDeleteParked=id=>{if(confirm('Delete this parked order?')){delete state.parked[id];save();render();}};
  window.posCoreDuplicate=id=>{const o=(db.orders||[]).find(x=>x.id===id);if(!o)return;cart=(o.items||[]).map(normalizeCartItem);state.currentPayments=[];save();go('pos');};
  window.posCoreQuickReorder=id=>window.posCoreDuplicate(id);
  window.posCoreSplit=()=>{ if(cart.length<2)return toast('At least two items are required to split.','error'); const half=Math.ceil(cart.length/2),a=cart.slice(0,half).map(normalizeCartItem),b=cart.slice(half).map(normalizeCartItem); const id='SPLIT-'+Date.now(); state.parked[id+'-A']={id:id+'-A',items:a,...totals(a),createdAt:now(),createdBy:user(),orderType:'Takeaway',payments:[]}; state.parked[id+'-B']={id:id+'-B',items:b,...totals(b),createdAt:now(),createdBy:user(),orderType:'Takeaway',payments:[]}; cart=[];save();render();toast(`Created ${id}-A and ${id}-B.`,'success'); };
  window.posCoreMergeParked=()=>{const ids=Object.keys(state.parked);if(ids.length<2)return toast('Need at least two parked orders.','error');const a=state.parked[ids[0]],b=state.parked[ids[1]],items=[...a.items,...b.items];const id='MERGED-'+Date.now();state.parked[id]={id,items,...totals(items),createdAt:now(),createdBy:user(),orderType:a.orderType||'Takeaway',payments:[...(a.payments||[]),...(b.payments||[])]};delete state.parked[ids[0]];delete state.parked[ids[1]];save();render();toast(`Merged ${ids[0]} + ${ids[1]}.`,'success');};

  async function complete() {
    if(!cart.length)return toast('Add at least one item.','error'); syncPayments(); const t=currentTotals(); const paid=(state.currentPayments||[]).reduce((s,p)=>s+Number(p.amount||0),0); if(paid<t.total)return toast(`Payment short by ${money2(t.total-paid)}.`,`error`);
    const type=document.getElementById('posCoreType')?.value||'Takeaway', tableId=document.getElementById('posCoreTable')?.value||'', customerName=document.getElementById('posCoreCustomer')?.value||'', address=document.getElementById('posCoreAddress')?.value||'';
    const order={id:'ORD-'+Date.now(),createdAt:now(),items:cart.map(normalizeCartItem),...t,payment:state.currentPayments[0]?.method||'Cash',payments:state.currentPayments||[],paymentStatus:'settled',changeDue:Math.max(0,paid-t.total),orderType:type,tableId,customerName,address,status:'completed',workflowStatus:'completed',createdBy:user()};
    const r=await api(window.mkFoods.createOrder,order); if(r?.ok===false){handleAuthError(r);return;} log('ORDER_COMPLETED',{orderId:order.id,total:order.total,payments:order.payments}); cart=[];state.currentPayments=[];await load();toast(`Order ${order.id} completed.`,'success');
  }
  window.posCoreComplete=complete;

  window.posCoreVoid=async id=>{ if(!canApprove())return toast('Manager approval required for void.','error'); const reason=prompt('Void reason','Customer cancellation'); if(!reason)return; const r=await api(window.mkFoods.orderStatus,id,'cancelled');if(r?.ok===false){handleAuthError(r);return;}log('ORDER_VOID',{orderId:id,reason});await load();toast(`${id} voided.`,'success'); };
  window.posCoreRefund=async id=>{ if(!canApprove())return toast('Manager approval required for refund.','error'); const reason=prompt('Refund reason','Customer refund');if(!reason)return; const r=await api(window.mkFoods.orderStatus,id,'refunded');if(r?.ok===false){handleAuthError(r);return;}log('ORDER_REFUND',{orderId:id,reason});await load();toast(`${id} refunded.`,'success'); };
  window.posCoreReopen=async id=>{if(!canApprove())return toast('Manager approval required.','error');const r=await api(window.mkFoods.orderStatus,id,'new');if(r?.ok===false){handleAuthError(r);return;}log('ORDER_REOPENED',{orderId:id});await load();toast(`${id} reopened.`,'success');};

  function parkedPanel(){const rows=Object.values(state.parked);return `<div class="panel"><div class="head"><div><h2>Parked Orders</h2><div class="muted">Hold, recall, split and merge checks</div></div><div class="actions"><button class="mini" onclick="posCoreMergeParked()">Merge first 2</button></div></div>${rows.map(p=>`<div class="orderline"><span><b>${esc(p.id)}</b> · ${p.items.length} items · ${money2(p.total)}</span><span><button class="mini" onclick="posCoreRecall('${esc(p.id)}')">Recall</button> <button class="mini danger" onclick="posCoreDeleteParked('${esc(p.id)}')">Delete</button></span></div>`).join('')||'<p class="muted">No parked orders.</p>'}</div>`;}

  function corePos(v){
    const cats=[...new Set((db.products||[]).filter(p=>p.available).map(p=>p.category))]; if(!state.currentPayments)state.currentPayments=[];
    const t=currentTotals();
    v.innerHTML=shell('POS / Orders','Enterprise order engine · hold · split · merge · multi-payment · approvals',`<div class="poslayout"><div class="panel"><div class="toolbar"><input id="posCoreSearch" class="field" placeholder="Search menu..." oninput="renderPosCoreProducts()"><select id="posCoreCat" class="field" onchange="renderPosCoreProducts()"><option value="">All categories</option>${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div id="posCoreProducts" class="productgrid"></div></div><div class="panel cartpanel"><div class="head"><div><h2>Current Check</h2><div class="muted">Modifiers and notes are captured per item</div></div><div class="actions"><button class="mini" onclick="posCoreHold()">Hold / Park</button><button class="mini" onclick="posCoreSplit()">Split</button></div></div><div id="cartLines">${cart.map((x,i)=>`<div class="orderline"><span><b>${esc(x.name)}</b> × ${x.qty}<small class="muted"> ${x.modifiers?.map(m=>esc(m.name||'')).join(', ')} ${x.notes?` · ${esc(x.notes)}`:''}</small></span><span>${money2(Number(x.price||0)*Number(x.qty||0))} <button class="mini danger" onclick="removeItem(${i})">×</button></span></div>`).join('')||'<p class="muted">No items yet</p>'}</div><div class="formgrid"><label>Type<select id="posCoreType" class="field"><option>Dine-in</option><option>Takeaway</option><option>Delivery</option></select></label><label>Table<select id="posCoreTable" class="field"><option value="">No table</option>${(db.tables||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.name)} · ${esc(x.status)}</option>`).join('')}</select></label><label>Customer<input id="posCoreCustomer" class="field" placeholder="Optional"></label><label>Discount type<select id="posCoreDiscountType" class="field" onchange="render()"><option value="fixed">Fixed</option><option value="percent">Percent</option></select></label><label>Discount<input id="posCoreDiscount" class="field" type="number" min="0" value="0" oninput="posCoreRefreshTotals()"></label><label>Delivery fee<input id="posCoreDeliveryFee" class="field" type="number" min="0" value="0" oninput="posCoreRefreshTotals()"></label><label class="wide">Address<input id="posCoreAddress" class="field" placeholder="Delivery address"></label></div><div class="total"><span>Total</span><strong id="posCoreTotal">${money2(t.total)}</strong></div><div class="panel subtle"><h3>Split / multiple payment</h3>${paymentRows(t.total)}</div><div class="actions"><button class="btn widebtn" onclick="posCoreComplete()">Complete Sale</button></div></div></div>${parkedPanel()}`); renderPosCoreProducts(); }
  window.renderPosCoreProducts=renderCoreProducts;
  window.posCoreRefreshTotals=()=>{const el=document.getElementById('posCoreTotal');if(el)el.textContent=money2(currentTotals().total);};

  function patchHistory(){
    const old=window.views?.history; if(!old)return;
    window.views.history=v=>{ const orders=(db.orders||[]).slice().reverse(); v.innerHTML=shell('History','Completed, refunded and voided orders',`<div class="panel"><table class="list"><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Actions</th></tr>${orders.map(o=>`<tr><td>${esc(o.id)}</td><td>${esc(o.customerName||'Walk-in')}</td><td>${money2(o.total)}</td><td>${esc(o.status)}</td><td>${o.status==='completed'?`<button class="mini" onclick="posCoreRefund('${esc(o.id)}')">Refund</button> <button class="mini" onclick="posCoreVoid('${esc(o.id)}')">Void</button>`:`<button class="mini" onclick="posCoreReopen('${esc(o.id)}')">Reopen</button>`} <button class="mini" onclick="posCoreDuplicate('${esc(o.id)}')">Duplicate</button></td></tr>`).join('')||'<tr><td colspan=5>No orders.</td></tr>'}</table></div>`); };
  }

  const oldRender=window.render;
  window.render=()=>{ if(view==='pos')return corePos(document.getElementById('view')); if(view==='history')patchHistory(); return oldRender?.(); };
  document.addEventListener('DOMContentLoaded',save);
  save();
})();
