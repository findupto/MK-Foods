(() => {
  'use strict';

  // Compatibility + hardened kitchen transition layer.  The main workflow keeps
  // its v2 state private, so this small bridge reads/writes the same durable
  // workflow record without depending on private closures.
  const KEY = 'mkfoods.order.workflow.v2';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const write = value => localStorage.setItem(KEY, JSON.stringify(value));
  const now = () => new Date().toISOString();
  const user = () => window.session?.username || 'system';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  function toast(message, kind = 'info') {
    let box = document.getElementById('workflowToast');
    if (!box) { box = document.createElement('div'); box.id = 'workflowToast'; box.className = 'workflow-toast'; document.body.appendChild(box); }
    box.className = `workflow-toast ${kind}`; box.textContent = message; box.hidden = false;
    clearTimeout(box._timer); box._timer = setTimeout(() => { box.hidden = true; }, 3000);
  }

  function chooseStaff(title, done) {
    const staff = Array.isArray(window.db?.staff) ? window.db.staff.filter(x => x.active !== false) : [];
    const root = document.createElement('div');
    root.className = 'workflow-modal';
    root.innerHTML = `<div class="workflow-backdrop"></div><div class="workflow-dialog"><div class="workflow-dialog-head"><h2>${esc(title)}</h2><button class="mini" data-cancel>×</button></div><div class="workflow-dialog-body"><label class="field-label">Responsible staff<select class="field" data-staff><option value="">Select staff...</option>${staff.map(x => `<option value="${esc(x.username)}">${esc(x.name || x.username)}</option>`).join('')}</select></label></div><div class="workflow-dialog-actions"><button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-ok>Continue</button></div></div>`;
    document.body.appendChild(root);
    const close = () => root.remove();
    root.querySelectorAll('[data-cancel]').forEach(x => x.onclick = close);
    root.querySelector('[data-ok]').onclick = () => {
      const value = root.querySelector('[data-staff]')?.value;
      if (!value) return toast('Select a staff member first.', 'error');
      close(); done(value);
    };
  }

  window.markCooked = (id, kitchen) => chooseStaff(`Mark ${kitchen || 'Kitchen'} cooked`, cookedBy => {
    const state = read();
    state.schema = Math.max(2, Number(state.schema || 2));
    state.orders ||= {};
    const w = state.orders[id] ||= { orderId:id, stage:'collected', events:[], assignments:{}, createdAt:now() };
    w.assignments ||= {};
    const current = w.assignments[kitchen] || {};
    w.assignments[kitchen] = { ...current, status:'cooked', cookedBy, cookedAt:now() };
    w.events ||= [];
    w.events.push({ at:now(), action:'KITCHEN_COOKED', user:cookedBy, kitchen, cookedBy });
    const kitchens = w.kitchens || Object.keys(w.assignments);
    if (kitchens.length && kitchens.every(k => ['cooked','ready'].includes(w.assignments[k]?.status))) w.stage = 'ready';
    write(state);
    toast(`${kitchen || 'Kitchen'} marked cooked.`, 'success');
    if (typeof window.renderOrderFlow === 'function') window.renderOrderFlow();
  });

  // Keep the legacy contract available for older integrations.
  window.markPreparedAndCooked = window.markCooked;
})();
