(() => {
  'use strict';
  const ux = () => window.mkFoodsUX;
  const toast = message => ux()?.toast ? ux().toast(message) : (() => {
    const n=document.createElement('div'); n.className='workflow-toast'; n.textContent=message; document.body.appendChild(n); setTimeout(()=>n.remove(),2600);
  })();
  const wire = () => {
    if (!ux()?.openForm) return setTimeout(wire, 100);
    window.deleteProduct = async id => {
      if (!canManage()) return toast('Admin or Owner permission required');
      const p=(db.products||[]).find(x=>x.id===id);
      if (!p) return;
      const v=await ux().openForm('Remove Menu Item',[{type:'section',label:'Confirmation'},{id:'confirm',label:`Type REMOVE to permanently delete “${p.name}”`,required:true,placeholder:'REMOVE'}]);
      if (!v || v.confirm.trim().toUpperCase()!=='REMOVE') return toast('Delete cancelled.');
      const r=await api(window.mkFoods.deleteProduct,id);
      if (r?.ok===false) return handleAuthError(r);
      await load(); toast('Menu item deleted.');
    };
    window.exportMenu = async () => {
      const r=await window.mkFoods.exportMenu();
      if (r?.ok===false) return handleAuthError(r);
      if (r) toast(`Menu exported: ${r}`);
    };
    window.importMenu = async () => {
      if (!canManage()) return toast('Admin or Owner permission required');
      const r=await window.mkFoods.importMenu();
      if (r?.ok===false) return handleAuthError(r);
      if (r!==null) { await load(); toast(`${r} menu item(s) imported.`); }
    };
    window.dispatchOrder = async id => {
      const rid=document.getElementById('rid-'+id)?.value||'';
      const km=Number(document.getElementById('km-'+id)?.value||0);
      if (!rid) return toast('Select a rider before assigning the delivery.');
      if (!(km>=0)) return toast('Enter a valid delivery distance.');
      const c=await api(window.mkFoods.calcDelivery,km,rid);
      if (c?.ok===false) return handleAuthError(c);
      const r=await api(window.mkFoods.updateDelivery,id,rid,km,c.riderPay,c.riderPay,'','', 'out_for_delivery');
      if (r?.ok===false) return handleAuthError(r);
      await load(); toast(`Delivery ${id} dispatched.`);
    };
  };
  window.addEventListener('DOMContentLoaded', wire);
})();
