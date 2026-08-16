(() => {
  const byId = id => document.getElementById(id);
  const error = msg => { const el = byId('loginError'); if (el) el.textContent = msg || ''; };
  const setBusy = busy => { const a=document.querySelector('#loginForm .btn'),b=byId('pinLoginBtn'); if(a){a.disabled=busy;a.textContent=busy?'Signing in…':'Sign In'} if(b)b.disabled=busy; };
  const reasonText = r => ({INVALID:'Invalid username or password.',LOCKED:`Account locked until ${r.retryAt?new Date(r.retryAt).toLocaleTimeString():'later'}.`,WEAK:'Password does not meet the required policy.',SESSION_EXPIRED:'Session expired. Please sign in again.',UNAUTHENTICATED:'Please sign in first.',FORBIDDEN:'You do not have permission for this action.'}[r?.reason]||'Sign-in failed.');
  async function completeLogin(r){
    if(!r||!r.ok){error(reasonText(r));return}
    window.mkFoodsSession=r;
    if(typeof session!=='undefined')session=r.user;
    byId('login').hidden=true;byId('appRoot').hidden=false;
    const s=byId('session');if(s)s.textContent=`${r.user.username} · ${r.user.role}`;error('');
    if(typeof load==='function')await load();if(typeof scheduleSession==='function')scheduleSession();
  }
  async function login(type){
    const username=(byId('username')?.value||'').trim(),secret=byId(type==='pin'?'pin':'password')?.value||'';
    if(!username||!secret){error(type==='pin'?'Enter username and PIN.':'Enter username and password.');return}setBusy(true);
    try{const r=type==='pin'?await window.mkFoods.pinLogin(username,secret):await window.mkFoods.login(username,secret);await completeLogin(r)}
    catch(e){console.error('POS authentication error',e);error('Authentication service is unavailable. Restart the POS and try again.')}
    finally{setBusy(false)}
  }
  window.addEventListener('DOMContentLoaded',()=>{
    const form=byId('loginForm'),pinButton=byId('pinLoginBtn');if(form)form.addEventListener('submit',e=>{e.preventDefault();login('password')});if(pinButton)pinButton.addEventListener('click',()=>login('pin'));
    const password=byId('password');if(password)password.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();login('password')}});const pin=byId('pin');if(pin)pin.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();login('pin')}});
  });
})();
