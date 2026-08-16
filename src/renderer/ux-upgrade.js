(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const escx = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function ensureUi() {
    if ($('mkUxLayer')) return;
    const style = document.createElement('style');
    style.id = 'mkUxStyle';
    style.textContent = `
      #mkUxLayer{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(8,12,20,.58);backdrop-filter:blur(8px)}
      #mkUxLayer.open{display:flex}.mkux-dialog{width:min(720px,96vw);max-height:90vh;overflow:auto;background:var(--panel,#fff);border:1px solid rgba(127,127,127,.18);border-radius:22px;box-shadow:0 28px 90px rgba(0,0,0,.28);animation:mkuxin .16s ease-out}.mkux-head{display:flex;align-items:center;justify-content:space-between;padding:22px 24px 12px}.mkux-head h2{margin:0;font-size:21px}.mkux-body{padding:8px 24px 20px}.mkux-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.mkux-grid .wide{grid-column:1/-1}.mkux-field{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700}.mkux-field input,.mkux-field select,.mkux-field textarea{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:11px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;outline:none}.mkux-field input:focus,.mkux-field select:focus,.mkux-field textarea:focus{border-color:#6b7cff;box-shadow:0 0 0 3px rgba(107,124,255,.13)}.mkux-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 24px;border-top:1px solid rgba(127,127,127,.16)}.mkux-toast{position:fixed;right:22px;bottom:22px;z-index:100000;padding:13px 17px;border-radius:13px;background:#171a21;color:#fff;box-shadow:0 12px 35px rgba(0,0,0,.25);animation:mkuxin .18s ease-out}.mkux-section{grid-column:1/-1;margin-top:5px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.6}.mkux-loading{display:flex;align-items:center;gap:10px;padding:12px 0}.mkux-dot{width:8px;height:8px;border-radius:50%;background:currentColor;animation:mkuxpulse 1s infinite alternate}@keyframes mkuxin{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}@keyframes mkuxpulse{to{opacity:.25}}
      @media(max-width:620px){.mkux-grid{grid-template-columns:1fr}.mkux-grid .wide{grid-column:auto}}
    `;
    document.head.appendChild(style);
    const layer = document.createElement('div');
    layer.id = 'mkUxLayer';
    layer.innerHTML = `<div class="mkux-dialog" role="dialog" aria-modal="true"><div class="mkux-head"><h2 id="mkUxTitle"></h2><button class="mini" id="mkUxClose">×</button></div><div class="mkux-body" id="mkUxBody"></div><div class="mkux-actions"><button class="btn secondary" id="mkUxCancel">Cancel</button><button class="btn primary" id="mkUxSave">Save</button></div></div>`;
    document.body.appendChild(layer);
    $('mkUxClose').onclick = $('mkUxCancel').onclick = () => closeForm(false);
    layer.addEventListener('click', e => { if (e.target === layer) closeForm(false); });
  }

  let resolver = null;
  function closeForm(ok) { const layer=$('mkUxLayer'); if(layer) layer.classList.remove('open'); const r=resolver; resolver=null; if(r) r(ok); }
  function openForm(title, fields, values={}) {
    ensureUi();
    $('mkUxTitle').textContent = title;
    $('mkUxBody').innerHTML = `<div class="mkux-grid">${fields.map(f=>f.type==='section'?`<div class="mkux-section">${escx(f.label)}</div>`:`<label class="mkux-field ${f.wide?'wide':''}">${escx(f.label)}${f.type==='textarea'?`<textarea id="mkf_${escx(f.id)}" rows="3" placeholder="${escx(f.placeholder||'')}">${escx(values[f.id]??f.value??'')}</textarea>`:f.type==='select'?`<select id="mkf_${escx(f.id)}">${(f.options||[]).map(o=>`<option value="${escx(o.value??o)}" ${(values[f.id]??f.value)===(o.value??o)?'selected':''}>${escx(o.label??o)}</option>`).join('')}</select>`:`<input id="mkf_${escx(f.id)}" type="${f.type||'text'}" value="${escx(values[f.id]??f.value??'')}" placeholder="${escx(f.placeholder||'')}" ${f.required?'required':''} ${f.min!=null?`min="${f.min}"`:''}>`}</label>`).join('')}</div>`;
    $('mkUxLayer').classList.add('open');
    $('mkUxSave').onclick = () => { const out={}; for(const f of fields) if(f.id){ const el=$('mkf_'+f.id); out[f.id]=el?.value??''; if(f.required && !String(out[f.id]).trim()){el?.focus();return;} } closeForm(out); };
    setTimeout(()=>{const first=$('mkUxBody').querySelector('input,select,textarea'); first?.focus()},30);
    return new Promise(resolve => { resolver=resolve; });
  }

  window.mkFoodsUX = { openForm, toast(message){ensureUi();const t=document.createElement('div');t.className='mkux-toast';t.textContent=message;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)} };

  async function restoreSession() {
    try {
      if (!window.mkFoods?.session) return;
      const r = await window.mkFoods.session();
      if (r?.ok && r.user) {
        window.mkFoodsSession = r;
        window.session = r.user;
        const login=$('login'), root=$('appRoot'), s=$('session');
        if(login) login.hidden=true; if(root) root.hidden=false; if(s) s.textContent=`${r.user.username} · ${r.user.role}`;
        if(typeof load==='function') await load();
        if(typeof scheduleSession==='function') scheduleSession();
      }
    } catch(e) { console.debug('Session restore skipped', e); }
  }

  async function addCustomerModern() {
    const v=await openForm('Add Customer',[{type:'section',label:'Customer information'},{id:'name',label:'Full name',required:true,placeholder:'Customer name'},{id:'phone',label:'Phone',placeholder:'03xx xxxxxxx'},{id:'email',label:'Email',type:'email'},{id:'birthday',label:'Birthday',type:'date'},{id:'notes',label:'Notes',type:'textarea',wide:true}]);
    if(!v)return; const r=await api(window.mkFoods.addCustomer,v); if(r?.ok===false){handleAuthError(r);return} await load(); window.mkFoodsUX.toast('Customer created successfully');
  }

  async function addRiderModern() {
    if(!canManage()) return window.mkFoodsUX.toast('Admin or Owner permission required');
    const v=await openForm('Add Rider',[{id:'name',label:'Full name',required:true},{id:'phone',label:'Phone'},{id:'zone',label:'Delivery zone'},{id:'customPerKm',label:'Custom per KM',type:'number',value:'0',min:'0'}]);
    if(!v)return; v.customPerKm=Number(v.customPerKm||0); const r=await api(window.mkFoods.addRider,v); if(r?.ok===false){handleAuthError(r);return} await load(); window.mkFoodsUX.toast('Rider added');
  }

  async function editProductModern(id) {
    if(!canManage()){window.mkFoodsUX.toast('Admin or Owner permission required');return}
    const p=db.products.find(x=>x.id===id)||{};
    const v=await openForm(id?'Edit Menu Item':'Add Menu Item',[{type:'section',label:'Product'},{id:'name',label:'Item name',required:true,value:p.name||''},{id:'category',label:'Category',value:p.category||'General'},{id:'price',label:'Sale price',type:'number',min:'0',value:p.price||0},{id:'cost',label:'Cost',type:'number',min:'0',value:p.cost||0},{id:'stock',label:'Opening stock',type:'number',min:'0',value:p.stock||0},{id:'minStock',label:'Minimum stock',type:'number',min:'0',value:p.minStock??5},{id:'available',label:'Availability',type:'select',value:String(p.available!==false),options:[{value:'true',label:'Available'},{value:'false',label:'Sold out'}]},{id:'description',label:'Description',type:'textarea',wide:true,value:p.description||''}]);
    if(!v)return; const payload={...v,id:id||undefined,price:Number(v.price||0),cost:Number(v.cost||0),stock:Number(v.stock||0),minStock:Number(v.minStock||0),available:v.available==='true'}; const r=await api(window.mkFoods.saveProduct,payload); if(r?.ok===false){handleAuthError(r);return} await load(); window.mkFoodsUX.toast(id?'Menu item updated':'Menu item created');
  }

  function wireModernActions(){
    window.addCustomer=addCustomerModern;
    window.addRider=addRiderModern;
    window.editProduct=editProductModern;
  }

  window.addEventListener('DOMContentLoaded',()=>{ensureUi();wireModernActions();setTimeout(restoreSession,0);});
})();
