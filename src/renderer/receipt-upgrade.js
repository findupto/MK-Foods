(() => {
  'use strict';
  const n=v=>Math.max(0,Number(v||0));
  const clean=s=>String(s??'').replace(/[\r\n]+/g,' ').trim();
  const line=(label,value,w=42)=>{const a=clean(label),b=clean(value),spaces=Math.max(1,w-a.length-b.length);return a+' '.repeat(spaces)+b+'\n'};
  const center=(s,w=42)=>{s=clean(s);const left=Math.max(0,Math.floor((w-s.length)/2));return ' '.repeat(left)+s+'\n'};
  const moneyText=v=>`${db?.settings?.currency||'Rs.'} ${n(v).toLocaleString(undefined,{maximumFractionDigits:2})}`;
  const normalizeMac=value=>{const hex=String(value||'').replace(/[^0-9a-f]/gi,'').toUpperCase();return hex.length===12?hex.match(/.{2}/g).join(':'):''};

  window.discoverPrinters = async () => {
    try {
      if (!window.mkFoods?.printThermal) return [];
      const r = await window.mkFoods.printThermal('__DISCOVER__', new Uint8Array());
      const printers = Array.isArray(r?.printers) ? r.printers : [];
      window.mkFoodsPrinters = printers;
      return printers;
    } catch (e) {
      console.error('Printer discovery failed', e);
      window.mkFoodsPrinters = [];
      return [];
    }
  };

  const populatePrinterSelects = printers => {
    const selects = [...document.querySelectorAll('select')].filter(el => {
      const key = `${el.id} ${el.name} ${el.dataset?.setting||''}`.toLowerCase();
      return key.includes('printer');
    });
    for (const select of selects) {
      const current = select.value || db?.settings?.printerName || '';
      select.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = printers.length ? 'Select printer…' : 'No Windows printers found';
      select.appendChild(placeholder);
      for (const p of printers) {
        const option = document.createElement('option');
        option.value = p.name;
        option.textContent = `${p.name} — ${p.status}`;
        option.dataset.connection = p.connection || 'windows-raw';
        option.dataset.online = p.online ? 'true' : 'false';
        select.appendChild(option);
      }
      if ([...select.options].some(o=>o.value===current)) select.value=current;
    }
  };

  window.refreshPrinterDiscovery = async () => {
    const printers = await window.discoverPrinters();
    populatePrinterSelects(printers);
    return printers;
  };

  window.printReceipt=async order=>{
    try{
      const printer=db?.settings?.receiptPrinter||db?.settings?.printerName;
      const connection=db?.settings?.printerConnection||'windows-raw';
      const mac=normalizeMac(db?.settings?.printerMac);
      if(!printer && !window.printThermalBytes && !(connection==='bluetooth-spp'&&mac)) return window.mkFoodsUX?.toast('Select a receipt printer first.');
      const W=Number(db?.settings?.receiptWidth||42)>=48?48:42;
      let out='\x1b@\x1bE\x01'+center(db?.settings?.business||'MK FOODS POS',W)+'\x1bE\x00';
      if(db?.settings?.address)out+=center(db.settings.address,W);if(db?.settings?.phone)out+=center(db.settings.phone,W);
      out+='-'.repeat(W)+'\n'+line('Order',order?.id||'-',W)+line('Date',new Date(order?.createdAt||Date.now()).toLocaleString(),W);
      if(order?.cashCollectedBy)out+=line('Cashier',order.cashCollectedBy,W);if(order?.customerName)out+=line('Customer',order.customerName,W);
      out+='-'.repeat(W)+'\n';
      for(const i of Array.isArray(order?.items)?order.items:[]){
        const qty=n(i.qty),total=moneyText(n(i.price)*qty),prefix=`${qty} x `,avail=Math.max(1,W-prefix.length-total.length-1),name=clean(i.name||i.id||'Item');
        out+=prefix+name.slice(0,avail)+' '.repeat(Math.max(1,W-prefix.length-Math.min(avail,name.length)-total.length))+total+'\n';
        if(i.note)out+='  Note: '+clean(i.note).slice(0,W-8)+'\n';
      }
      out+='-'.repeat(W)+'\n'+line('Subtotal',moneyText(order?.subtotal),W);if(n(order?.discount))out+=line('Discount','-'+moneyText(order.discount),W);if(n(order?.tax))out+=line('Tax',moneyText(order.tax),W);if(n(order?.deliveryFee))out+=line('Delivery',moneyText(order.deliveryFee),W);
      out+='-'.repeat(W)+'\n\x1bE\x01'+line('TOTAL',moneyText(order?.total),W)+'\x1bE\x00-' .repeat(W)+'\n'+line('Payment',order?.payment||'-',W);if(order?.paymentStatus)out+=line('Status',order.paymentStatus,W);
      out+='\n'+center(db?.settings?.receiptFooter||'Thank you for visiting!',W)+'\n\n\n\x1dV\x42\x00';
      const bytes=new TextEncoder().encode(out);
      if(connection==='bluetooth-spp'&&mac){
        const r=await window.mkFoods.printThermal(`__BLUETOOTH_RAW__|${mac}`,bytes);
        if(r?.ok===false)throw Error(r.reason||'Bluetooth print failed');
      } else if(window.printThermalBytes) {
        await window.printThermalBytes(bytes);
      } else {
        const r=await window.mkFoods.printThermal(printer,bytes);
        if(r?.ok===false)throw Error(r.reason||'Print failed');
      }
      window.mkFoodsUX?.toast(`Receipt sent to ${printer||mac}`);
    }catch(e){console.error(e);window.mkFoodsUX?.toast(`Receipt failed: ${e.message||e}`)}
  };

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { window.refreshPrinterDiscovery?.(); }, 700);
  });
})();
