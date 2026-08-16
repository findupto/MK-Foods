(() => {
  'use strict';
  const originalComplete = window.posCoreComplete;
  const stripPercent = () => { const t=document.getElementById('posCoreDiscountType'); if(t){ [...t.options].filter(o=>o.value==='percent').forEach(o=>o.remove()); t.value='fixed'; } };
  const normalize = () => {
    const box = document.getElementById('posCorePayments');
    if (!box) return;
    stripPercent();
    if (!box.querySelector('.payment-row')) {
      const total = Number(document.getElementById('posCoreTotal')?.textContent?.replace(/[^0-9.-]/g,'') || 0);
      box.innerHTML = `<div class="payment-row"><select class="field" data-pay-method="0"><option selected>Cash</option><option>Card</option><option>Online</option><option>COD</option><option>Bank Transfer</option><option>Customer Credit</option><option>Advance</option></select><input class="field" data-pay-amount="0" type="number" min="0" step=".01" value="${total}"><button class="mini danger" onclick="posCoreRemovePayment(0)">×</button></div>`;
    }
  };
  const oldRender = window.render;
  window.render = (...args) => { const r = oldRender?.(...args); setTimeout(normalize, 0); return r; };
  window.posCoreComplete = async (...args) => { stripPercent(); normalize(); return originalComplete?.(...args); };
  setTimeout(normalize, 0);
})();
