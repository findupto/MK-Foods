(() => {
  'use strict';
  // Windows often exposes Bluetooth thermal printers as a paired SPP COM port.
  // Direct RFCOMM can legitimately fail with WSA 10049 when the printer does not
  // advertise the SPP service for raw socket discovery. Prefer the Windows SPP
  // COM transport when it is available, and only fall back to direct SPP.
  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const mac = v => { const h=String(v||'').replace(/[^0-9a-f]/gi,'').toUpperCase(); return h.length===12?h.match(/.{2}/g).join(':'):''; };
  const com = v => { const x=String(v||'').trim().toUpperCase(); return /^COM\d+$/.test(x)?x:''; };
  const bytes = () => new TextEncoder().encode('\x1b@MK FOODS POS\nBluetooth printer connection test\n\x1b\x64\x04\x1dV\x42\x14');
  const toast = (message,error=false) => { let b=document.getElementById('printerToast'); if(!b){b=document.createElement('div');b.id='printerToast';b.className='workflow-toast';document.body.appendChild(b);} b.textContent=message;b.className=`workflow-toast ${error?'error':'success'}`;b.hidden=false;clearTimeout(b._timer);b._timer=setTimeout(()=>b.hidden=true,5000); };
  const discoverComForMac = async target => {
    const wanted=mac(target); if(!wanted || !window.mkFoods?.discoverBluetooth) return '';
    try {
      const r=await window.mkFoods.discoverBluetooth();
      const list=Array.isArray(r?.devices)?r.devices:[];
      const exact=list.find(d=>mac(d?.mac)===wanted && com(d?.comPort));
      return exact ? com(exact.comPort) : '';
    } catch { return ''; }
  };
  const original = window.selectBluetoothPrinter;
  window.selectBluetoothPrinter = async device => {
    const name=String(device?.name||'Bluetooth thermal printer').trim();
    const m=mac(device?.mac);
    let port=com(device?.comPort);
    if(!port && m) port=await discoverComForMac(m);
    // If Windows supplied an SPP COM port, test that transport first. This
    // bypasses the raw RFCOMM path that commonly returns WSA 10049.
    if(port && window.mkFoods?.printThermal){
      try {
        const r=await window.mkFoods.printThermal(`__BLUETOOTH_COM__|${port}`,bytes());
        if(r?.ok!==false){
          const saved=await window.mkFoods.updateSettings({printerName:name,printerMac:m,printerComPort:port,printerConnection:'bluetooth-com',receiptPrinter:name});
          if(saved?.ok===false) throw new Error(saved.reason||'Could not save Bluetooth printer.');
          toast(`${name} connected through Windows Bluetooth SPP ${port}. Direct RFCOMM was bypassed.`);
          return true;
        }
      } catch(err) {
        // Continue into the existing multi-method connector. It can still try
        // direct SPP and Windows spooler when COM is unavailable/unusable.
      }
    }
    if(typeof original==='function') return original({...device,mac:m,comPort:port});
    toast(`${name}: Bluetooth connection handler is unavailable.`,true);
    return false;
  };
  window.bluetoothRecovery={discoverComForMac};
})();
