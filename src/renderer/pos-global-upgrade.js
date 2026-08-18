(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get = id => document.getElementById(id);
  const toast = (m, bad=false) => { if (typeof window.toast === 'function') return window.toast(m,bad); let x=document.getElementById('globalUpgradeToast'); if(!x){x=document.createElement('div');x.id='globalUpgradeToast';x.style.cssText='position:fixed;right:20px;bottom:20px;z-index:99999;padding:12px 16px;border-radius:10px;background:#111827;color:#fff;box-shadow:0 8px 30px #0003';document.body.appendChild(x)} x.textContent=m;x.hidden=false;clearTimeout(x._t);x._t=setTimeout(()=>x.hidden=true,3200)};
  function injectDeliveryFields(){
    const type=get('orderType'); if(!type || type.value!=='Delivery') return;
    if(get('globalDeliveryPanel')) return;
    const anchor=type.closest('label') || type.parentElement; if(!anchor) return;
    const panel=document.createElement('section'); panel.id='globalDeliveryPanel'; panel.className='panel delivery-customer-panel';
    panel.innerHTML=`<div class="section-head"><div><h3>Delivery Details</h3><p class="muted">Required before sending the order for delivery.</p></div><span class="tag">Delivery</span></div><div class="formgrid"><label>Customer Name<input id="deliveryCustomerName" class="field" autocomplete="name" placeholder="Customer name"></label><label>Phone<input id="deliveryPhone" class="field" autocomplete="tel" inputmode="tel" placeholder="03xx-xxxxxxx"></label><label class="span-2">Full Address<input id="deliveryAddress" class="field" autocomplete="street-address" placeholder="House / Shop, Street, Area, City" required></label><label class="span-2">Delivery Instructions<textarea id="deliveryInstructions" class="field" rows="2" placeholder="Gate, floor, landmark, rider notes..."></textarea></label><label>Delivery Fee<input id="deliveryFee" class="field" type="number" min="0" step="0.01" value="0"></label></div>`;
    anchor.parentElement?.appendChild(panel);
  }
  function removeDeliveryFields(){get('globalDeliveryPanel')?.remove()}
  function wireType(){
    const type=get('orderType'); if(!type || type.dataset.globalUpgrade==='1') return;
    type.dataset.globalUpgrade='1'; type.addEventListener('change',()=>{ if(type.value==='Delivery') injectDeliveryFields(); else removeDeliveryFields(); });
    if(type.value==='Delivery') injectDeliveryFields();
  }
  function patchDeliveryGuard(){
    const original=window.collectOrder;
    if(typeof original!=='function' || original.__globalUpgrade) return;
    const wrapped=async function(){
      const type=get('orderType')?.value;
      if(type==='Delivery'){
        injectDeliveryFields();
        const address=get('deliveryAddress')?.value?.trim()||'';
        const phone=get('deliveryPhone')?.value?.trim()||'';
        const name=get('deliveryCustomerName')?.value?.trim()||'';
        if(!name || !phone || !address){ toast('Delivery requires customer name, phone and full address.',true); return; }
      }
      return original.apply(this,arguments);
    };
    wrapped.__globalUpgrade=true; window.collectOrder=wrapped;
  }
  function patchOrderFlowButtons(){
    document.querySelectorAll('[data-order-id]').forEach(card=>{
      const id=card.getAttribute('data-order-id'); if(!id || card.querySelector('.global-order-actions')) return;
      const box=document.createElement('div');box.className='global-order-actions';box.innerHTML=`<button class="mini secondary" type="button">Track</button><button class="mini secondary" type="button">Receipt</button>`;
      const bs=box.querySelectorAll('button');bs[0].onclick=()=>window.showOrderTracking?.(id);bs[1].onclick=()=>{const o=(window.db?.orders||[]).find(x=>x.id===id);if(o)window.queueOrderForPrint?.({...o,printDocumentType:'Sale Receipt',printStatus:'queued'});else toast('Order not found.',true)};card.appendChild(box);
    });
  }
  function boot(){ wireType(); patchDeliveryGuard(); patchOrderFlowButtons(); }
  const mo=new MutationObserver(()=>boot()); mo.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('hashchange',boot); document.addEventListener('click',()=>setTimeout(boot,0));
  setTimeout(boot,250); setTimeout(boot,1000);
  window.MKFoodsGlobalUpgrade={version:'1.0.0',boot};
})();