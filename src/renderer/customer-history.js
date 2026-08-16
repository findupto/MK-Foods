(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moneySafe = value => typeof window.money === 'function' ? window.money(Number(value || 0)) : Number(value || 0).toFixed(2);

  function customerHistorySearch(query = '') {
    const q = String(query || '').trim().toLowerCase();
    const orders = Array.isArray(window.db?.orders) ? window.db.orders : [];
    const customers = Array.isArray(window.db?.customers) ? window.db.customers : [];
    const matches = orders.filter(order => {
      if (!q) return true;
      const customer = customers.find(c => c.id === order.customerId);
      const haystack = [
        order.id, order.customerId, order.customerName, order.phone, order.address,
        customer?.name, customer?.phone, customer?.mobile, customer?.email
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return matches;
  }

  window.customerHistorySearch = customerHistorySearch;
  window.showCustomerHistory = (query = '') => {
    const rows = customerHistorySearch(query);
    const total = rows.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const body = rows.length ? rows.map(order => `
      <div class="dispatch" data-order-id="${esc(order.id)}">
        <div>
          <b>${esc(order.id)}</b>
          <div>${esc(order.customerName || 'Walk-in')} · ${esc(order.orderType || 'Order')}</div>
          <small class="muted">${new Date(order.createdAt || Date.now()).toLocaleString()} · ${moneySafe(order.total)}</small>
        </div>
        <button class="mini" data-history-order="${esc(order.id)}">Details</button>
      </div>`).join('') : '<div class="notice">No matching customer orders found.</div>';

    const title = q ? `Customer History · ${q}` : 'Customer History';
    if (typeof window.openDetail === 'function') {
      window.openDetail(title, `<div class="panel"><div class="toolbar"><div><b>${rows.length}</b> order(s)</div><strong>${moneySafe(total)}</strong></div><div class="history-results">${body}</div></div>`);
      document.querySelectorAll('[data-history-order]').forEach(button => {
        button.onclick = () => {
          const id = button.getAttribute('data-history-order');
          const order = orders.find(item => item.id === id);
          if (!order) return;
          const lines = (order.items || []).map(item => `<div class="orderline"><span>${Number(item.qty || 0)} × ${esc(item.name || 'Item')}</span><b>${moneySafe(Number(item.price || 0) * Number(item.qty || 0))}</b></div>`).join('');
          window.openDetail(`Order ${esc(order.id)}`, `<div class="panel"><div class="toolbar"><div><b>${esc(order.customerName || 'Walk-in')}</b><div class="muted">${new Date(order.createdAt || Date.now()).toLocaleString()}</div></div><strong>${moneySafe(order.total)}</strong></div>${lines}<div class="total"><span>Total</span><strong>${moneySafe(order.total)}</strong></div></div>`);
        };
      });
    }
    return rows;
  };

  window.renderCustomerHistorySearch = () => {
    const input = document.getElementById('customerHistorySearch');
    if (input) window.showCustomerHistory(input.value);
  };
})();
