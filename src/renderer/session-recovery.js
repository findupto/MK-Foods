(() => {
  'use strict';
  async function recover(){
    try{
      const r=await window.mkFoods.session();
      if(!r?.ok||!r.user)return;
      window.mkFoodsSession=r;
      if(typeof session!=='undefined')session=r.user;
      const login=document.getElementById('login'),root=document.getElementById('appRoot'),label=document.getElementById('session');
      if(login)login.hidden=true;if(root)root.hidden=false;if(label)label.textContent=`${r.user.username} · ${r.user.role}`;
      if(typeof load==='function')await load();if(typeof scheduleSession==='function')scheduleSession();
    }catch(e){console.debug('POS session recovery unavailable',e)}
  }
  window.addEventListener('DOMContentLoaded',()=>setTimeout(recover,25));
})();
