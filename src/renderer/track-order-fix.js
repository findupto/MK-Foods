(() => {
  'use strict';

  const WORKFLOW_KEY = 'mkfoods.order.workflow.v2';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const moneySafe = value => { try { return typeof money === 'function' ? money(Number(value || 0)) : `Rs. ${Number(value || 0).toLocaleString()}`; } catch (_) { return `Rs. ${Number(value || 0).toLocaleString()}`; } };
  const orders = () => Array.isArray(window.db?.orders) ? window.db.orders : [];
  const findOrder = id => orders().find(o => String(o.id) === String(id));
  const workflowState = () => { try { return JSON.parse(localStorage.getItem(WORKFLOW_KEY) || '{}'); } catch (_) { return {}; } };

  function resolveOrderId(value, element) {
    if (value && typeof value === 'object') value = value.id || value.orderId;
    if (value != null && String(value).trim()) return String(value).trim();
    let node = element;
    while (node && node !== document.body) {
      const direct = node.dataset?.orderId || node.dataset?.order || node.getAttribute?.('data-id');
      if (direct) return direct;
      const onclick = node.getAttribute?.('onclick') || '';
      const match = onclick.match(/(?:showOrderTracking|trackOrder|showOrderDetail|track)[(]['\"]([^'\"]+)['\"]/i);
      if (match) return match[1];
      const text = node.textContent || '';
      const orderMatch = text.match(/\bORD-[A-Za-z0-9_-]+\b/);
      if (orderMatch) return orderMatch[0];
      node = node.parentElement;
    }
    return '';
  }

  function closeTrackModal() { document.getElementById('mkTrackOrderModal')?.remove(); }

  function queueReceipt(order) {
    const copy = { ...order, id: order.id, items: Array.isArray(order.items) ? order.items : [], printDocumentType: 'Sale Receipt', printStatus: 'queued', queuedAt: new Date().toISOString() };
    if (typeof window.queueOrderForPrint === 'function') {
      window.queueOrderForPrint(copy);
      if (typeof window.toast === 'function') window.toast(`Receipt ${order.id} added to Print Center.`);
      else alert(`Receipt ${order.id} added to Print Center.`);
      return true;
    }
    if (typeof window.go === 'function') window.go('printmanager');
    if (typeof window.toast === 'function') window.toast('Print Center is not ready. Open Print Center and retry.', true);
    else alert('Print Center is not ready. Open Print Center and retry.');
    return false;
  }

  function openTrackModal(orderId) {
    const order = findOrder(orderId);
    if (!order) {
      if (typeof window.toast === 'function') window.toast(`Order ${orderId || ''} was not found.`, true);
      return false;
    }
    const ws = workflowState();
    const workflow = ws.orders?.[order.id] || {};
    const audit = Array.isArray(order.auditTrail) ? order.auditTrail : [];
    const workflowEvents = Array.isArray(workflow.events) ? workflow.events : [];
    const events = [...audit.map(e => ({ at:e.at || e.createdAt || order.createdAt, action:e.action || e.status || 'Order update', user:e.by || e.user || e.username || '-' })), ...workflowEvents.map(e => ({ at:e.at || order.createdAt, action:e.action || 'Workflow update', user:e.user || e.by || '-' }))].filter(e => e.at).sort((a,b) => new Date(a.at) - new Date(b.at));
    const kitchens = Object.entries(workflow.assignments || {}).map(([name,data]) => `<div class="mk-track-kitchen"><div><b>${esc(name)}</b><span class="tag">${esc(data?.status || 'pending')}</span></div><small>Forwarded: ${esc(data?.forwardedBy || '-')} · Prepared: ${esc(data?.preparedBy || data?.cookedBy || '-')} · Ready: ${esc(data?.readyBy || '-')}</small></div>`).join('');
    const timeline = events.length ? events.map(e => `<div class="mk-track-event"><span class="mk-track-dot"></span><div><b>${esc(String(e.action).replaceAll('_',' '))}</b><small>${esc(e.user)} · ${esc(new Date(e.at).toLocaleString())}</small></div></div>`).join('') : '<div class="muted">No workflow events recorded yet.</div>';
    const items = (order.items || []).map(i => `<div class="mk-track-item"><span>${esc(i.qty)} × ${esc(i.name)}</span><b>${moneySafe(Number(i.price || 0) * Number(i.qty || 0))}</b></div>`).join('');

    closeTrackModal();
    const root = document.createElement('div');
    root.id = 'mkTrackOrderModal'; root.className = 'detail-modal open';
    root.innerHTML = `<div class="detail-backdrop" data-track-close></div><div class="detail-dialog" role="dialog" aria-modal="true" aria-label="Order Tracking">
      <div class="detail-head"><div><h2>Order Tracking · ${esc(order.id)}</h2><span class="muted">Live order details, kitchen progress and receipt actions</span></div><button class="mini" type="button" data-track-close>Close</button></div>
      <div class="detail-actions mk-track-actions"><button class="btn" type="button" data-print-receipt>Print Receipt</button><button class="btn secondary" type="button" data-print-manager>Open Print Center</button></div>
      <div class="detail-grid"><div class="detail-kv"><span>Order</span><b>${esc(order.id)}</b></div><div class="detail-kv"><span>Type</span><b>${esc(order.orderType || '-')}</b></div><div class="detail-kv"><span>Status</span><b>${esc(order.status || workflow.stage || '-')}</b></div><div class="detail-kv"><span>Workflow stage</span><b>${esc(workflow.stage || order.workflowStatus || '-')}</b></div><div class="detail-kv"><span>Customer</span><b>${esc(order.customerName || 'Walk-in')}</b></div><div class="detail-kv"><span>Total</span><b>${moneySafe(order.total)}</b></div><div class="detail-kv"><span>Payment</span><b>${esc(order.payment || '-')} · ${esc(order.paymentStatus || '-')}</b></div><div class="detail-kv"><span>Created</span><b>${esc(new Date(order.createdAt || Date.now()).toLocaleString())}</b></div></div>
      <h3>Items</h3><div class="mk-track-items">${items || '<span class="muted">No items.</span>'}</div>
      <h3>Kitchen Tracking</h3><div class="mk-track-kitchens">${kitchens || '<div class="muted">No kitchen assignment recorded.</div>'}</div>
      <h3>Timeline</h3><div class="mk-track-timeline">${timeline}</div>
    </div>`;
    document.body.appendChild(root);
    root.querySelectorAll('[data-track-close]').forEach(node => node.addEventListener('click', closeTrackModal));
    root.querySelector('[data-print-receipt]')?.addEventListener('click', () => queueReceipt(order));
    root.querySelector('[data-print-manager]')?.addEventListener('click', () => { closeTrackModal(); if (typeof window.go === 'function') window.go('printmanager'); });
    return true;
  }

  window.trackOrder = orderId => openTrackModal(orderId);
  window.trackOrderDetails = window.trackOrder;
  window.showOrderTracking = orderId => openTrackModal(orderId);

  // Capture Track buttons before other UI handlers. This also supports buttons
  // rendered dynamically by Order Flow and legacy modules.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button, a, [role="button"]');
    if (!button) return;
    const label = String(button.textContent || button.getAttribute('aria-label') || button.title || '').trim();
    if (!/track(\s+order|\s+details)?/i.test(label)) return;
    const id = resolveOrderId(null, button);
    if (!id) return;
    event.preventDefault(); event.stopPropagation();
    openTrackModal(id);
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    #mkTrackOrderModal .detail-dialog { max-height: 88vh; overflow: auto; }
    #mkTrackOrderModal .mk-track-actions { display:flex; gap:8px; margin:0 0 14px; flex-wrap:wrap; }
    .mk-track-items { display:grid; gap:5px; }
    .mk-track-item { display:flex; justify-content:space-between; gap:12px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; }
    .mk-track-kitchens { display:grid; gap:8px; }
    .mk-track-kitchen { border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; }
    .mk-track-kitchen > div { display:flex; justify-content:space-between; gap:10px; }
    .mk-track-kitchen small, .mk-track-event small { display:block; margin-top:4px; color:#667085; }
    .mk-track-timeline { display:grid; gap:10px; }
    .mk-track-event { display:flex; gap:10px; align-items:flex-start; }
    .mk-track-dot { width:9px; height:9px; margin-top:6px; border-radius:50%; background:#0f9d68; flex:0 0 auto; }
  `;
  document.head.appendChild(style);
})();
