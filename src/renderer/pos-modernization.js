(() => {
  'use strict';
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = (message, error = false) => {
    let n = document.getElementById('mkModernToast');
    if (!n) { n = document.createElement('div'); n.id = 'mkModernToast'; document.body.appendChild(n); }
    n.textContent = message; n.className = `mk-modern-toast ${error ? 'error' : ''}`; n.hidden = false;
    clearTimeout(n._t); n._t = setTimeout(() => n.hidden = true, 3200);
  };
  function closeWindow(){ document.getElementById('mkFormWindow')?.remove(); }
  window.closeModernWindow = closeWindow;
  window.openModernWindow = (title, subtitle, body, saveLabel = 'Save', onSave = null) => {
    closeWindow();
    const n = document.createElement('div'); n.id='mkFormWindow'; n.className='mk-window-layer';
    n.innerHTML = `<section class="mk-form-window" role="dialog" aria-modal="true"><header><div><h2>${E(title)}</h2><p>${E(subtitle||'')}</p></div><button class="mk-window-close" onclick="closeModernWindow()">×</button></header><div class="mk-window-body">${body}</div><footer><button class="btn secondary" onclick="closeModernWindow()">Cancel</button><button id="mkWindowSave" class="btn">${E(saveLabel)}</button></footer></section>`;
    document.body.appendChild(n);
    n.querySelector('#mkWindowSave').onclick = async () => { try { const r = await onSave?.(n); if (r !== false) closeWindow(); } catch(err){ toast(err?.message||String(err), true); } };
    n.querySelector('input,select,textarea')?.focus();
  };
  const field = (label, id, value='', type='text', extra='') => `<label class="mk-field"><span>${E(label)}</span><input id="${id}" class="field" type="${type}" value="${E(value)}" ${extra}></label>`;
  const select = (label,id,options,value='') => `<label class="mk-field"><span>${E(label)}</span><select id="${id}" class="field">${options.map(x=>`<option value="${E(x)}" ${x===value?'selected':''}>${E(x)}</option>`).join('')}</select></label>`;
  const val = (root,id) => root.querySelector('#'+id)?.value?.trim() || '';
  const num = (root,id) => Number(val(root,id)||0);

  function formFor(type, existing={}) {
    if(type==='customer') return {title:existing.id?'Edit Customer':'New Customer', subtitle:'Customer profile, contact and loyalty-ready data', body:`<div class="mk-form-grid">${field('Full name','name',existing.name)}${field('Phone','phone',existing.phone)}${field('Email','email',existing.email,'email')}${field('Birthday','birthday',existing.birthday,'date')}<label class="mk-field wide"><span>Address</span><textarea id="address" class="field" rows="3">${E(existing.address||'')}</textarea></label></div>`, save:async root=>{const r=await api(window.mkFoods.addCustomer,{name:val(root,'name'),phone:val(root,'phone'),email:val(root,'email'),birthday:val(root,'birthday'),address:val(root,'address')});if(r?.ok===false){handleAuthError(r);return false}await load();toast('Customer saved.')}};
    if(type==='rider') return {title:existing.id?'Edit Rider':'Add Rider', subtitle:'Delivery rider profile and payment settings', body:`<div class="mk-form-grid">${field('Full name','name',existing.name)}${field('Phone','phone',existing.phone)}${field('Zone','zone',existing.zone)}${field('Custom per KM','customPerKm',existing.customPerKm||0,'number','min="0" step="0.01"')}${select('Status','status',['Available','Busy','Offline'],existing.status||'Available')}</div>`, save:async root=>{const data={name:val(root,'name'),phone:val(root,'phone'),zone:val(root,'zone'),customPerKm:num(root,'customPerKm'),status:val(root,'status')};const r=existing.id?await api(window.mkFoods.updateStaff,existing.id,data):await api(window.mkFoods.addRider,data);if(r?.ok===false){handleAuthError(r);return false}await load();toast('Rider saved.')}};
    if(type==='product') return {title:existing.id?'Edit Menu Item':'Add Menu Item', subtitle:'Menu, pricing, stock and availability', body:`<div class="mk-form-grid">${field('Item name','name',existing.name)}${field('Category','category',existing.category||'General')}${field('Sale price','price',existing.price||0,'number','min="0" step="0.01"')}${field('Cost','cost',existing.cost||0,'number','min="0" step="0.01"')}${field('Stock','stock',existing.stock||0,'number','min="0" step="1"')}${field('Minimum stock','minStock',existing.minStock||5,'number','min="0" step="1"')}${select('Availability','available',['true','false'],String(existing.available!==false))}</div>`, save:async root=>{if(!canManage()){toast('Admin/Owner only',true);return false}const r=await api(window.mkFoods.saveProduct,{id:existing.id,name:val(root,'name'),category:val(root,'category')||'General',price:num(root,'price'),cost:num(root,'cost'),stock:num(root,'stock'),minStock:num(root,'minStock'),available:val(root,'available')==='true'});if(r?.ok===false){handleAuthError(r);return false}await load();toast('Menu item saved.')}};
    if(type==='staff') return {title:existing.username?'Edit Staff Member':'Add Staff Member', subtitle:'User access, role and secure POS credentials', body:`<div class="mk-form-grid">${field('Display name','name',existing.name)}${field('Username','username',existing.username,'text',existing.username?'readonly':'required')}${field('Phone','phone',existing.phone)}${select('Role','role',['Cashier','Counter Person','Waiter','Kitchen Staff','Kitchen','Rider','Dispatcher','Accountant','Manager','Owner','Admin'],existing.role||'Cashier')}${field('Password','password','','password',existing.username?'':'required minlength="8"')}${field('PIN','pin','','password','inputmode="numeric" maxlength="8" pattern="[0-9]{4,8}"')}${select('Status','active',['true','false'],String(existing.active!==false))}</div><div class="mk-form-note">Passwords are handled by the secure POS backend. Use at least 8 characters.</div>`, save:async root=>{if(!canManage()){toast('Admin/Owner only',true);return false}const data={name:val(root,'name'),username:val(root,'username'),phone:val(root,'phone'),role:val(root,'role'),active:val(root,'active')==='true'};if(val(root,'password'))data.password=val(root,'password');if(val(root,'pin'))data.pin=val(root,'pin');const r=existing.username?await api(window.mkFoods.updateStaff,existing.username,data):await api(window.mkFoods.addStaff,data);if(r?.ok===false){handleAuthError(r);return false}await load();toast('Staff member saved.')}};
  }
  window.modernCustomer=existing=>{const f=formFor('customer',existing||{});openModernWindow(f.title,f.subtitle,f.body,'Save',f.save)};
  window.modernRider=existing=>{const f=formFor('rider',existing||{});openModernWindow(f.title,f.subtitle,f.body,'Save',f.save)};
  window.modernProduct=existing=>{const f=formFor('product',existing||{});openModernWindow(f.title,f.subtitle,f.body,'Save',f.save)};
  window.modernStaff=existing=>{const f=formFor('staff',existing||{});openModernWindow(f.title,f.subtitle,f.body,'Save',f.save)};

  window.addCustomer=()=>modernCustomer();
  window.addRider=()=>modernRider();
  window.editProduct=id=>modernProduct(db.products.find(x=>x.id===id)||{});

  views.staff = v => {
    const rows=(db.staff||[]).filter(x=>x.active!==false || canManage());
    v.innerHTML=shell('Staff & Team','Employees, roles, access and POS security',`<div class="mk-toolbar"><div class="mk-search-wrap"><input id="staffSearch" class="field" placeholder="Search staff, username or role…" oninput="renderModernStaff()"></div><button class="btn" onclick="modernStaff()">+ Add Staff</button></div><div class="mk-staff-summary"><div><b>${rows.filter(x=>x.active!==false).length}</b><span>Active staff</span></div><div><b>${rows.filter(x=>['Manager','Owner','Admin'].includes(x.role)).length}</b><span>Management</span></div><div><b>${rows.filter(x=>['Kitchen','Kitchen Staff'].includes(x.role)).length}</b><span>Kitchen</span></div><div><b>${rows.filter(x=>x.role==='Cashier'||x.role==='Counter Person').length}</b><span>Front counter</span></div></div><div class="panel"><div id="modernStaffTable"></div></div>`);renderModernStaff()};
  window.renderModernStaff=()=>{const box=document.getElementById('modernStaffTable');if(!box)return;const q=(document.getElementById('staffSearch')?.value||'').toLowerCase();const rows=(db.staff||[]).filter(x=>`${x.name||''} ${x.username||''} ${x.role||''}`.toLowerCase().includes(q));box.innerHTML=`<table class="list"><thead><tr><th>Staff</th><th>Username</th><th>Role</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(s=>`<tr><td><b>${E(s.name||s.username||'-')}</b></td><td>${E(s.username||'-')}</td><td><span class="tag">${E(s.role||'-')}</span></td><td>${E(s.phone||'-')}</td><td><span class="mk-status ${s.active!==false?'on':'off'}">${s.active!==false?'Active':'Inactive'}</span></td><td><button class="mini" onclick='modernStaff(${JSON.stringify(s).replace(/'/g,"&#39;")})'>Edit</button> ${s.active!==false?`<button class="mini danger" onclick="deactivateModernStaff('${E(s.username||s.id)}')">Deactivate</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty-state">No staff match your search.</div></td></tr>'}</tbody></table>`};
  window.deactivateModernStaff=async id=>{if(!canManage()){toast('Admin/Owner only',true);return}const r=await api(window.mkFoods.deleteStaff,id);if(r?.ok===false){handleAuthError(r);return}await load();toast('Staff member deactivated.')};

  const oldPrinters = views.printers;
  views.printers = v => {
    oldPrinters(v);
    setTimeout(()=>{
      const panel=v.querySelector('.printer-discovery-window');
      if(!panel)return;
      const title=panel.querySelector('.printer-window-title'); if(title) title.querySelector('p').textContent='Live Windows printer + previously paired Bluetooth/COM discovery. Search and choose the printer used by this POS.';
      let bt=document.getElementById('mkBluetoothLive');
      if(!bt){bt=document.createElement('div');bt.id='mkBluetoothLive';bt.className='panel mk-bt-window';panel.parentElement.insertBefore(bt,panel.parentElement.children[1]);}
      bt.innerHTML=`<div class="printer-window-title"><div><h2>Bluetooth Thermal Discovery</h2><p class="muted">No MAC address entry. Previously paired Bluetooth/COM devices are detected automatically.</p></div><span class="live-indicator"><i></i>LIVE</span></div><div class="printer-searchbar"><input id="btLiveSearch" class="field" placeholder="Search Bluetooth device…" oninput="renderBluetoothLive()"><button class="btn secondary" onclick="scanBluetoothLive()">Refresh</button></div><div id="btLiveResults" class="mk-bt-results"><div class="empty-state">Scanning paired Bluetooth / serial devices…</div></div><div class="mk-form-note">For a brand-new unpaired Bluetooth printer, Windows must pair it first. The POS does not ask for a MAC address; once Windows exposes it as a printer or serial device, it appears here automatically.</div>`;
      scanBluetoothLive();
    },50);
  };
  let btDevices=[];
  window.scanBluetoothLive=async()=>{
    const box=document.getElementById('btLiveResults');if(!box)return;box.innerHTML='<div class="empty-state">Scanning…</div>';
    const found=[];
    try{const ps=navigator.serial?.getPorts?await navigator.serial.getPorts():[];ps.forEach((p,i)=>{const info=p.getInfo?.()||{};found.push({id:`serial-${i}`,name:`Bluetooth / Serial Port ${i+1}`,kind:'Bluetooth / COM',status:p.connected?'Connected':'Available',port:p,info})})}catch(_){ }
    (window.mkFoodsPrinters||[]).filter(p=>/bluetooth|bth|thermal|pos|receipt|printer/i.test(`${p.name||''}`)).forEach(p=>found.push({id:`win-${p.name}`,name:p.name,kind:'Windows Printer',status:p.status||'Available',windows:true}));
    btDevices=found.filter((x,i,a)=>a.findIndex(y=>y.name===x.name)===i);renderBluetoothLive();
  };
  window.renderBluetoothLive=()=>{const box=document.getElementById('btLiveResults');if(!box)return;const q=(document.getElementById('btLiveSearch')?.value||'').toLowerCase();const rows=btDevices.filter(x=>`${x.name} ${x.kind} ${x.status}`.toLowerCase().includes(q));box.innerHTML=rows.length?rows.map(x=>`<div class="mk-bt-card"><div class="mk-bt-icon">▣</div><div class="mk-bt-main"><b>${E(x.name)}</b><span>${E(x.kind)} · ${E(x.status)}</span></div><button class="mini primary-mini" onclick="chooseBluetoothPrinter('${E(x.name).replace(/'/g,'&#39;')}')">Use as Thermal</button></div>`).join(''):'<div class="empty-state"><b>No Bluetooth/COM printer visible</b><span class="muted">Pair the thermal printer in Windows, then keep this window open and refresh.</span></div>'};
  window.chooseBluetoothPrinter=async name=>{const p=btDevices.find(x=>x.name===name);if(p?.windows){const r=await window.mkFoods.connectPrinter(name);if(r?.ok===false){toast(r.reason||'Could not select printer.',true);return}await load();go('printers');toast(`${name} selected as Thermal Receipt printer.`);return}toast(`${name} is detected. Use the existing COM connection to send thermal data.`)};
  if(navigator.serial){navigator.serial.addEventListener?.('connect',()=>{if(document.getElementById('btLiveResults'))scanBluetoothLive()});navigator.serial.addEventListener?.('disconnect',()=>{if(document.getElementById('btLiveResults'))scanBluetoothLive()})}
})();
