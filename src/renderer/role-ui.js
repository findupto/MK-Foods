(() => {
  'use strict';
  const role = () => window.mkFoodsSession?.user?.role || window.session?.role || '';
  const permissions = {
    Owner: ['*'], Admin: ['*'], Manager: ['pos','orderflow','tables','kds','delivery','customers','menu','inventory','suppliers','expenses','staff','counters','printmanager','banking','reports','history','transactions','accounts','settings','cleaning'],
    'Counter Person': ['pos','orderflow','customers','printmanager','history'], Cashier: ['pos','orderflow','tables','customers','printmanager','history'],
    Waiter: ['pos','orderflow','tables','kds','customers','printmanager'], 'Kitchen Staff': ['kds','printmanager','cleaning'], Kitchen: ['kds','printmanager','cleaning'],
    Rider: ['delivery','orderflow','printmanager'], Dishwasher: ['cleaning'], Accountant: ['dashboard','banking','reports','history','transactions','expenses','inventory'],
  };
  const can = v => (permissions[role()] || []).includes('*') || (permissions[role()] || []).includes(v);
  const navView = b => b.dataset.view;
  function applyNav(){ document.querySelectorAll('#nav button').forEach(b => { const allowed=can(navView(b)); b.hidden=!allowed; }); }
  function currentUser(){ const u=window.mkFoodsSession?.user||{}; return u.username || 'User'; }
  const cleanKey='mk-foods-cleaning-v1';
  const defaultTasks={Dishwasher:['Wash and sanitize dish pit','Clean filters and screens','Check drain flow','Check wash/rinse temperatures','Refill detergent and rinse aid','Sweep and mop dish area','Sanitize sinks and work surfaces','Report equipment issue'],Manager:['Opening walk-through','Verify cash drawer and staff','Check printer and KDS status','Review open orders','Approve pending exceptions','Closing sign-off'],Waiter:['Check tables','Restock service station','Confirm specials','Review open tables'],Kitchen:['Sanitize prep surfaces','Check prep stock','Review KDS queue','Clean station between rushes'],'Kitchen Staff':['Sanitize prep surfaces','Check prep stock','Review KDS queue','Clean station between rushes'],'Rider':['Check delivery bag','Check phone and route','Confirm assigned orders','Handoff and collect payment when required']};
  function renderCleaning(v){ const r=role(), tasks=defaultTasks[r]||defaultTasks.Dishwasher, state=JSON.parse(localStorage.getItem(cleanKey)||'{}'), day=new Date().toISOString().slice(0,10), done=state[day]||{}; v.innerHTML=shell('Shift Tasks','Short role-based checklist · tracked locally on this device',`<div class="task-hero"><div><span class="eyebrow">${esc(r||'Staff')}</span><h2>${esc(currentUser())}</h2><p class="muted">Complete only the tasks assigned to your role. ${Object.values(done).filter(Boolean).length}/${tasks.length} done today.</p></div><button class="btn secondary" onclick="resetRoleTasks()">Reset today</button></div><div class="task-grid">${tasks.map((t,i)=>`<button class="task-card ${done[i]?'done':''}" onclick="toggleRoleTask(${i})"><span class="task-check">${done[i]?'✓':'○'}</span><span><b>${esc(t)}</b><small>${done[i]?'Completed':'Pending'}</small></span></button>`).join('')}</div>`); }
  window.toggleRoleTask=i=>{ const day=new Date().toISOString().slice(0,10),s=JSON.parse(localStorage.getItem(cleanKey)||'{}');s[day]=s[day]||{};s[day][i]=!s[day][i];localStorage.setItem(cleanKey,JSON.stringify(s));render(); };
  window.resetRoleTasks=()=>{ const day=new Date().toISOString().slice(0,10),s=JSON.parse(localStorage.getItem(cleanKey)||'{}');delete s[day];localStorage.setItem(cleanKey,JSON.stringify(s));render(); };
  views.cleaning=renderCleaning;
  const originalRender=window.render;
  window.render=()=>{ if(typeof originalRender==='function') originalRender(); applyNav(); if(!can(view)){ const fallback=(permissions[role()]||[]).find(x=>x!=='dashboard')||'dashboard'; if(view!==fallback){view=fallback; originalRender();applyNav();} } };
  const oldLoad=window.load;
  if(typeof oldLoad==='function') window.load=async()=>{ const r=await oldLoad(); applyNav(); return r; };
  window.roleCan=can;
  window.addEventListener('DOMContentLoaded',()=>setTimeout(applyNav,100));
  setInterval(applyNav,1500);

  views.staff=v=>{
    if(!['Admin','Owner'].includes(role())) { v.innerHTML=shell('Team','Staff administration is restricted to Owner/Admin.','<div class="panel"><b>Access restricted</b><p class="muted">Ask an Owner or Admin to manage staff accounts and roles.</p></div>'); return; }
    const users=db.users||[], staff=db.staff||[];
    v.innerHTML=shell('Team & Accounts','One staff profile → one login → one role → one audit trail',`<div class="role-banner"><div><b>Role-based access is active</b><span class="muted">Every staff member uses an individual POS account. Avoid shared PINs.</span></div><button class="btn" onclick="addStaff()">Add Staff + Account</button></div><div class="role-grid">${['Owner','Admin','Manager','Counter Person','Cashier','Waiter','Kitchen Staff','Rider','Dishwasher','Accountant'].map(r=>`<div class="role-chip"><b>${esc(r)}</b><span>${staff.filter(s=>s.role===r&&s.active!==false).length} staff</span></div>`).join('')}</div><div class="panel"><div class="section-head"><div><h2>Linked Staff Accounts</h2><p class="muted">The username shown here is the POS login linked to the staff profile.</p></div></div><div class="staff-table">${staff.map(s=>{const u=users.find(x=>x.username===s.username);return `<div class="staff-row"><div><b>${esc(s.name||s.username)}</b><span>${esc(s.phone||'')}</span></div><span class="role-pill">${esc(s.role)}</span><span class="account-state ${u?.active!==false?'ok':''}">${u?.active!==false?'Login Active':'Login Disabled'}</span><span class="muted">@${esc(s.username)}</span></div>`}).join('')||'<div class="empty-state"><b>No staff accounts yet.</b><span class="muted">Create a staff member and account together.</span></div>'}</div></div>`);
  };
})();