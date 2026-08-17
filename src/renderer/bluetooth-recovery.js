(() => {
  'use strict';

  // Windows Bluetooth thermal printers can expose several usable routes.
  // Prefer SPP COM, then direct SPP, then the Windows printer queue. Never
  // surface an intermediate transport failure if a later route succeeds.
  const mac = v => { const h=String(v||'').replace(/[^0-9a-f]/gi,'').toUpperCase(); return h.length===12?h.match(/.{2}/g).join(':'):''; };
  const com = v => { const x=String(v||'').trim().toUpperCase(); return /^COM\d+$/.test(x)?x:''; };
  const bytes = () => new TextEncoder().encode('\x1b@MK FOODS POS\nBluetooth printer connection test\n\x1b\x64\x04\x1dV\x42\x14');
  const toast = (message,error=false) => { let b=document.getElementById('printerToast'); if(!b){b=document.createElement('div');b.id='printerToast';b.className='workflow-toast';document.body.appendChild(b);} b.textContent=message;b.className=`workflow-toast ${error?'error':'success'}`;b.hidden=false;clearTimeout(b._timer);b._timer=setTimeout(()=>b.hidden=true,5000); };
  const isNiimbot = name => /b11|niimbot/i.test(String(name || ''));

  let recovering = false;
  let recoveryTimer = null;
  let recoveryDone = false;

  async function discoverBluetooth() {
    try { const r=await window.mkFoods?.discoverBluetooth?.(); return Array.isArray(r?.devices)?r.devices:[]; }
    catch { return []; }
  }
  async function discoverWindows() {
    try { const r=await window.mkFoods?.discoverPrinters?.(); return Array.isArray(r)?r:(Array.isArray(r?.printers)?r.printers:[]); }
    catch { return []; }
  }
  const exactBluetooth = (list,target) => list.find(d => {
    const dm=mac(d?.mac), dc=com(d?.comPort), dn=String(d?.name||'').trim().toLowerCase();
    return (target.mac&&dm===target.mac)||(target.com&&dc===target.com)||(target.name&&dn===target.name.toLowerCase());
  });
  const exactWindows = (list,name) => list.find(p=>String(p?.name||'').trim().toLowerCase()===name.toLowerCase()) ||
    list.find(p=>String(p?.name||'').toLowerCase().includes(name.toLowerCase())||name.toLowerCase().includes(String(p?.name||'').toLowerCase()));

  async function restoreSavedPrinter() {
    if (recovering || recoveryDone || !window.mkFoods?.snapshot) return false;
    recovering=true;
    try {
      const snapshot=await window.mkFoods.snapshot();
      const s=snapshot?.settings||{};
      const name=String(s.printerName||'').trim();
      if(!name){recoveryDone=true;return false;}
      if(isNiimbot(name)) return false; // niimbot-bridge owns BLE auto-reconnect
      const route=String(s.printerConnection||'windows-raw');
      const target={name,mac:mac(s.printerMac),com:com(s.printerComPort)};

      if(route==='windows-raw'||route==='network-raw'){
        const match=exactWindows(await discoverWindows(),name);
        if(match?.name){
          await window.mkFoods.connectPrinter(match.name).catch(()=>null);
          recoveryDone=true;
          return true;
        }
      }

      const device=exactBluetooth(await discoverBluetooth(),target);
      if(!device) return false;
      const dm=mac(device.mac)||target.mac;
      const dc=com(device.comPort)||target.com;
      const nextRoute=dc?'bluetooth-com':(dm?'bluetooth-spp':route);
      if(nextRoute==='bluetooth-com'||nextRoute==='bluetooth-spp'){
        await window.mkFoods.updateSettings({printerName:name,printerMac:dm,printerComPort:dc,printerConnection:nextRoute,receiptPrinter:name});
        recoveryDone=true;
        return true;
      }
      return false;
    } catch { return false; }
    finally { recovering=false; }
  }

  function scheduleRecovery(){
    clearTimeout(recoveryTimer);
    recoveryTimer=setTimeout(async()=>{const ok=await restoreSavedPrinter();if(!ok&&!recoveryDone)scheduleRecovery();},1200);
  }

  const discoverComForMac=async target=>{
    const wanted=mac(target);if(!wanted)return '';
    const exact=(await discoverBluetooth()).find(d=>mac(d?.mac)===wanted&&com(d?.comPort));
    return exact?com(exact.comPort):'';
  };

  window.selectBluetoothPrinter=async device=>{
    const name=String(device?.name||'Bluetooth thermal printer').trim();
    const m=mac(device?.mac);
    let port=com(device?.comPort);
    if(!port&&m)port=await discoverComForMac(m);

    // Dedicated Niimbot BLE path. Do not force B11 through SPP/RFCOMM.
    if(isNiimbot(name)&&window.mkFoodsNiimbot?.connectAndSave){
      try{
        const r=await window.mkFoodsNiimbot.connectAndSave(name,m);
        if(r!==false){recoveryDone=true;toast(`${name} connected through Bluetooth LE.`);return true;}
      }catch(e){toast(`${name}: ${e?.message||e}`,true);return false;}
    }

    const failures=[];
    const save=async(route,comPort='')=>{
      const r=await window.mkFoods.updateSettings({printerName:name,printerMac:m,printerComPort:comPort,printerConnection:route,receiptPrinter:name});
      if(r?.ok===false)throw new Error(r.reason||'Could not save printer selection.');
    };

    // 1) Windows Bluetooth SPP virtual COM: most reliable Windows fallback.
    if(port&&window.mkFoods?.printThermal){
      try{
        const r=await window.mkFoods.printThermal(`__BLUETOOTH_COM__|${port}`,bytes());
        if(r?.ok!==false){await save('bluetooth-com',port);recoveryDone=true;toast(`${name} connected through Bluetooth SPP ${port}.`);return true;}
        failures.push(`SPP COM ${port}: ${r?.reason||'failed'}`);
      }catch(e){failures.push(`SPP COM ${port}: ${e?.message||e}`);}
    }

    // 2) Direct RFCOMM/SPP by MAC. This is a fallback, not the first route.
    if(m&&window.mkFoods?.printThermal){
      try{
        const r=await window.mkFoods.printThermal(`__BLUETOOTH_RAW__|${m}`,bytes());
        if(r?.ok!==false){await save('bluetooth-spp','');recoveryDone=true;toast(`${name} connected through direct Bluetooth SPP.`);return true;}
        failures.push(`Direct SPP: ${r?.reason||'failed'}`);
      }catch(e){failures.push(`Direct SPP: ${e?.message||e}`);}
    }

    // 3) Windows printer queue. This is useful when Bluetooth is paired as a
    // normal Windows printer and avoids direct RFCOMM entirely.
    try{
      const match=exactWindows(await discoverWindows(),name);
      if(match?.name&&window.mkFoods?.printThermal){
        const r=await window.mkFoods.printThermal(match.name,bytes());
        if(r?.ok!==false){await save('windows-raw',port);recoveryDone=true;toast(`${name} connected through Windows printer queue.`);return true;}
        failures.push(`Windows Queue: ${r?.reason||'failed'}`);
      }else failures.push('Windows Queue: printer not found');
    }catch(e){failures.push(`Windows Queue: ${e?.message||e}`);}

    toast(`${name} could not connect. ${failures.join(' | ')}`,true);
    return false;
  };

  window.bluetoothRecovery={discoverComForMac,restoreSavedPrinter};

  // Restore the saved route after the authenticated POS session becomes
  // available. This is deliberately silent when the printer is powered off.
  const boot=()=>scheduleRecovery();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  setInterval(()=>{if(!recoveryDone)scheduleRecovery();},10000);
})();
