(() => {
  'use strict';
  const n=v=>Math.max(0,Number(v||0));
  const clean=s=>String(s??'').replace(/[\r\n]+/g,' ').trim();
  const pad=(s,w)=>{s=clean(s);return s.length>=w?s.slice(0,w):s+' '.repeat(w-s.length)};
  const moneyText=v=>`${db?.settings?.currency||'Rs.'} ${n(v).toLocaleString(undefined,{maximumFractionDigits:2})}`;
  const line=(label,value,w=42)=>{const a=clean(label),b=clean(value),spaces=Math.max(1,w-a.length-b.length);return a+' '.repeat(spaces)+b+'\n'};
  const center=(s,w=42)=>{s=clean(s);const left=Math.max(0,Math.floor((w-s.length)/2));return ' '.repeat(left)+s+'\n'};
  const wrap=(s,w=42)=>{s=clean(s);const out=[];while(s.length>w){let p=s.lastIndexOf(' ',w);if(p<1)p=w;out.push(s.slice(0,p));s=s.slice(p).trim()}if(s)out.push(s);return out.join('\n')+'\n'};
  window.printReceipt=async order=>{
    try{
      const printer=db?.settings?.receiptPrinter||db?.settings?.printerName;
      if(!printer && !window.printThermalBytes) return window.mkFoodsUX?.toast('Select a receipt printer first.');
      const W=Number(db?.settings?.receiptWidth||42)>=48?48:42;
      let out='\x1b@';
      out+='\x1bE\x01'+center(db?.settings?.business||'MK FOODS POS',W)+'\x1bE\x00';
      if(db?.settings?.address)out+=center(db.settings.address,W);
      if(db?.settings?.phone)out+=center(db.settings.phone,W);
      out+='-'.repeat(W)+'\n';
      out+=line('Order',order?.id||'-',W);
      out+=line('Date',new Date(order?.createdAt||Date.now()).toLocaleString(),W);
      if(order?.cashCollectedBy)out+=line('Cashier',order.cashCollectedBy,W);
      if(order?.customerName)out+=line('Customer',order.customerName,W);
      out+='-'.repeat(W)+'\n';
      for(const i of Array.isArray(order?.items)?order.items:[]){
        const name=clean(i.name||i.id||'Item'); const qty=n(i.qty); const total=moneyText(n(i.price)*qty);
        out+=wrap(name,W-total.length-qty.toString().length-2,W);
        const first=pad(`${qty} x`,6); out+=first+name.slice(0,Math.max(1,W-6-total.length))+ ' '.repeat(Math.max(1,W-6-total.length-name.slice(0,Math.max(1,W-6-total.length)).length))+total+'\n';
      }
      out+='-'.repeat(W)+'\n';
      out+=line('Subtotal',moneyText(order?.subtotal),W);
      if(n(order?.discount))out+=line('Discount','-'+moneyText(order.discount),W);
      if(n(order?.tax))out+=line('Tax',moneyText(order.tax),W);
      if(n(order?.deliveryFee))out+=line('Delivery',moneyText(order.deliveryFee),W);
      out+='-'.repeat(W)+'\n';
      out+='\x1bE\x01'+line('TOTAL',moneyText(order?.total),W)+'\x1bE\x00';
      out+='-'.repeat(W)+'\n';
      out+=line('Payment',order?.payment||'-',W);
      if(order?.paymentStatus)out+=line('Status',order.paymentStatus,W);
      out+='\n'+center(db?.settings?.receiptFooter||'Thank you for visiting!',W)+'\n\n\n\x1dV\x42\x00';
      const bytes=new TextEncoder().encode(out);
      if(window.printThermalBytes){await window.printThermalBytes(bytes)}else{const r=await window.mkFoods.printThermal(printer,bytes);if(r?.ok===false)throw Error(r.reason||'Print failed')}
      window.mkFoodsUX?.toast('Receipt sent to printer');
    }catch(e){console.error(e);window.mkFoodsUX?.toast(`Receipt failed: ${e.message||e}`)}
  };
})();
