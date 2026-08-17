(() => {
  'use strict';

  // Bluetooth thermal printers on Windows can expose several usable routes.
  // Prefer an already assigned SPP COM port, then direct SPP, while keeping
  // the Windows queue as the final fallback. The saved route is restored after
  // every POS relaunch without sending a test receipt to the printer.
  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const mac = v => { const h=String(v||'').replace(/[^0-9a-f]/gi,'').toUpperCase(); return h.length===12?h.match(/.{2}/g).join(':'):''; };
  const com = v => { const x=String(v||'').trim().toUpperCase(); return /^COM\d+$/.test(x)?x:''; };
  const bytes = () => new TextEncoder().encode('\x1b@MK FOODS POS\nBluetooth printer connection test\n\x1b\x64\x04\x1dV\x42\x14');
  const toast = (message,error=false) => { let b=document.getElementById('printerToast'); if(!b){b=document.createElement('div');b.id='printerToast';b.className='workflow-toast';document.body.appendChild(b);} b.textContent=message;b.className=`workflow-toast ${error?'error':'success'}`;b.hidden=false;clearTimeout(b._timer);b._timer=setTimeout(()=>b.hidden=true,5000); };

  let recovering = false;
  let recoveryTimer = null;
  let recoveryDone = false;

  const isNiimbot = name => /b11|niimbot/i.test(String(name || ''));
  const saved = settings => ({
    name: String(settings?.printerName || '').trim(),
    route: String(settings?.printerConnection || 'windows-raw'),
    mac: mac(settings?.printerMac),
    com: com(settings?.printerComPort)
  });

  async function discoverBluetooth() {
    try {
      const r = await window.mkFoods?.discoverBluetooth?.();
      return Array.isArray(r?.devices) ? r.devices : [];
    } catch { return []; }
  }

  async function discoverWindows() {
    try {
      const r = await window.mkFoods?.discoverPrinters?.();
      return Array.isArray(r) ? r : (Array.isArray(r?.printers) ? r.printers : []);
    } catch { return []; }
  }

  const exactBluetooth = (list, target) => list.find(d => {
    const dm = mac(d?.mac);
    const dc = com(d?.comPort);
    return (target.mac && dm === target.mac) || (target.com && dc === target.com) ||
      (target.name && String(d?.name || '').trim().toLowerCase() === target.name.toLowerCase());
  });

  const exactWindows = (list, name) => list.find(p => String(p?.name || '').trim().toLowerCase() === name.toLowerCase()) ||
    list.find(p => String(p?.name || '').toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(String(p?.name || '').toLowerCase()));

  async function restoreSavedPrinter() {
    if (recovering || recoveryDone || !window.mkFoods?.snapshot) return false;
    recovering = true;
    try {
      const snapshot = await window.mkFoods.snapshot();
      const target = saved(snapshot?.settings || {});
      if (!target.name || isNiimbot(target.name)) { recoveryDone = true; return false; }

      if (target.route === 'windows-raw' || target.route === 'network-raw') {
        const printers = await discoverWindows();
        const match = exactWindows(printers, target.name);
        if (match?.name) {
          await window.mkFoods.connectPrinter(match.name).catch(() => null);
          recoveryDone = true;
          return true;
        }
      }

      const devices = await discoverBluetooth();
      const device = exactBluetooth(devices, target);
      if (!device) return false;

      const dm = mac(device.mac) || target.mac;
      const dc = com(device.comPort) || target.com;
      const preferred = target.route === 'bluetooth-com' && dc ? 'bluetooth-com' :
        (dc ? 'bluetooth-com' : (dm ? 'bluetooth-spp' : 'windows-spooler'));

      if (preferred === 'bluetooth-com') {
        await window.mkFoods.updateSettings({
          printerName: target.name,
          printerMac: dm,
          printerComPort: dc,
          printerConnection: 'bluetooth-com',
          receiptPrinter: target.name
        });
      } else if (preferred === 'bluetooth-spp') {
        await window.mkFoods.updateSettings({
          printerName: target.name,
          printerMac: dm,
          printerComPort: dc,
          printerConnection: 'bluetooth-spp',
          receiptPrinter: target.name
        });
      }
      recoveryDone = true;
      return true;
    } catch {
      return false;
    } finally {
      recovering = false;
    }
  }

  function scheduleRecovery() {
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(async () => {
      const ok = await restoreSavedPrinter();
      if (!ok && !recoveryDone) scheduleRecovery();
    }, 1200);
  }

  const discoverComForMac = async target => {
    const wanted=mac(target); if(!wanted || !window.mkFoods?.discoverBluetooth) return '';
    const list=await discoverBluetooth();
    const exact=list.find(d=>mac(d?.mac)===wanted && com(d?.comPort));
    return exact ? com(exact.comPort) : '';
  };

  const original = window.selectBluetoothPrinter;
  window.selectBluetoothPrinter = async device => {
    const name=String(device?.name||'Bluetooth thermal printer').trim();
    const m=mac(device?.mac);
    let port=com(device?.comPort);
    if(!port && m) port=await discoverComForMac(m);

    // COM is the preferred Windows transport when SPP exposes it. This avoids
    // the common RFCOMM 10049 failure while preserving the existing fallback.
    if(port && window.mkFoods?.printThermal){
      try {
        const r=await window.mkFoods.printThermal(`__BLUETOOTH_COM__|${port}`,bytes());
        if(r?.ok!==false){
          const saved=await window.mkFoods.updateSettings({printerName:name,printerMac:m,printerComPort:port,printerConnection:'bluetooth-com',receiptPrinter:name});
          if(saved?.ok===false) throw new Error(saved.reason||'Could not save Bluetooth printer.');
          toast(`${name} connected through Windows Bluetooth SPP ${port}. Direct RFCOMM was bypassed.`);
          recoveryDone = true;
          return true;
        }
      } catch (_) {}
    }
    if(typeof original==='function') {
      const ok = await original({...device,mac:m,comPort:port});
      if (ok) recoveryDone = true;
      return ok;
    }
    toast(`${name}: Bluetooth connection handler is unavailable.`,true);
    return false;
  };

  window.bluetoothRecovery={discoverComForMac, restoreSavedPrinter};

  // Restore the saved printer after the authenticated POS session becomes
  // available. Retry quietly so a powered-off printer never creates a red
  // error toast on launch; printing itself still reports real failures.
  const boot = () => scheduleRecovery();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
  setInterval(() => { if (!recoveryDone) scheduleRecovery(); }, 10000);
})();
