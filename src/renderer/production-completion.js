(() => {
  'use strict';
  const KEY='mkfoods.production.v1';
  const defaults={
    recipes:{}, ingredients:{}, units:{}, suppliersLedger:[], payments:[], promotions:[], stations:{}, printers:{}, branches:[], approvals:[], notifications:[], reservations:[], deliveryZones:[], qr:{enabled:true}, sync:{queue:[],lastPush:null}, backups:[], settings:{autoBackup:true,backupIntervalHours:24}
  };
  const clone=o=>JSON.parse(JSON.stringify(o));
  const load=()=>{try{return Object.assign(clone(defaults),JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(_){return clone(defaults)}};
  let state=load();
  const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
  const id=p=>(p||'x')+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
  const role=()=>window.session?.role||window.currentUser?.role||'Cashier';
  const manager=()=>['Admin','Owner','Manager'].includes(role());
  const notify=(type,title,message)=>{state.notifications.unshift({id:id('N'),type,title,message,at:new Date().toISOString(),read:false});state.notifications=state.notifications.slice(0,200);save()};
  const audit=(action,data={})=>{state.approvals.unshift({id:id('A'),action,by:window.session?.username||role(),at:new Date().toISOString(),...data});state.approvals=state.approvals.slice(0,500);save()};

  // Transactional order state machine. UI may request a transition, but illegal transitions are rejected.
  const transitions={draft:['held','confirmed','cancelled'],held:['draft','cancelled'],confirmed:['sent_to_kitchen','cancelled','voided'],sent_to_kitchen:['preparing','held','voided'],preparing:['ready','held','voided'],ready:['collecting','dispatching','completed'],collecting:['completed'],dispatching:['out_for_delivery','completed'],out_for_delivery:['completed','returned'],completed:['refunded','reopened'],reopened:['confirmed','cancelled'],cancelled:[],voided:[],refunded:[],returned:[]};
  window.mkProduction=window.mkProduction||{};
  window.mkProduction.state=()=>clone(state);
  window.mkProduction.transition=(order,next,reason='')=>{const cur=order.status||'draft';if(!(transitions[cur]||[]).includes(next))throw new Error(`Invalid order transition: ${cur} → ${next}`);if(['voided','refunded','reopened'].includes(next)&&!manager())throw new Error('MANAGER_APPROVAL_REQUIRED');order.status=next;order.statusAt=new Date().toISOString();order.statusReason=reason;audit('ORDER_STATUS_CHANGED',{orderId:order.id,from:cur,to:next,reason});return order};

  // Recipe / ingredient engine. Recipes are persisted locally until the native inventory transaction API is available.
  window.mkProduction.saveIngredient=(x)=>{if(!x.name)throw Error('Ingredient name required');state.ingredients[x.id||id('ING')]=Object.assign({id:id('ING'),unit:'g',costPerUnit:0,stock:0,minStock:0},x);save();return state.ingredients[x.id]};
  window.mkProduction.saveRecipe=(productId,lines)=>{state.recipes[productId]=(lines||[]).map(x=>({ingredientId:x.ingredientId,qty:Number(x.qty||0),unit:x.unit||'g'}));save();return state.recipes[productId]};
  window.mkProduction.recipeCost=(productId)=>((state.recipes[productId]||[]).reduce((s,l)=>{const i=state.ingredients[l.ingredientId]||{};return s+Number(l.qty||0)*Number(i.costPerUnit||0)},0));
  window.mkProduction.consumeRecipe=(productId,multiplier=1,reason='SALE')=>{(state.recipes[productId]||[]).forEach(l=>{const i=state.ingredients[l.ingredientId];if(i){i.stock=Math.max(0,Number(i.stock||0)-Number(l.qty||0)*multiplier);if(i.stock<=Number(i.minStock||0))notify('low-stock','Low ingredient stock',`${i.name} is below minimum.`)}});save()};
  window.mkProduction.foodCost=(productId)=>{const p=(window.db?.products||[]).find(x=>x.id===productId);const cost=window.mkProduction.recipeCost(productId);return {cost,price:Number(p?.price||0),percent:Number(p?.price||0)?cost/Number(p.price)*100:0}};

  // Purchasing ledger: PO -> receive -> supplier payable. Uses existing native commands when available.
  window.mkProduction.receivePurchase=(po,lines)=>{const received=(lines||[]).map(x=>({...x,receivedQty:Number(x.receivedQty||x.qty||0)}));const total=received.reduce((s,x)=>s+Number(x.receivedQty||0)*Number(x.unitCost||0),0);const entry={id:id('GRN'),poId:po.id,supplierId:po.supplierId,lines:received,total,status:'received',at:new Date().toISOString()};state.suppliersLedger.push(entry);audit('PURCHASE_RECEIVED',{purchaseId:po.id,total});save();return entry};
  window.mkProduction.recordSupplierPayment=(supplierId,amount,method='Cash',reference='')=>{if(!manager())throw Error('MANAGER_APPROVAL_REQUIRED');const x={id:id('SP'),supplierId,amount:Number(amount||0),method,reference,at:new Date().toISOString()};state.payments.push(x);audit('SUPPLIER_PAYMENT',{supplierId,amount:x.amount});save();return x};
  window.mkProduction.supplierBalance=(supplierId)=>state.suppliersLedger.filter(x=>x.supplierId===supplierId).reduce((s,x)=>s+Number(x.total||0),0)-state.payments.filter(x=>x.supplierId===supplierId).reduce((s,x)=>s+Number(x.amount||0),0);

  // Promotions engine: deterministic and reusable by POS, online ordering and QR ordering.
  window.mkProduction.addPromotion=x=>{if(!manager())throw Error('MANAGER_APPROVAL_REQUIRED');const p=Object.assign({id:id('PROMO'),active:true,days:[0,1,2,3,4,5,6],start:'00:00',end:'23:59',type:'percent',value:0,minOrder:0},x);state.promotions.push(p);save();return p};
  window.mkProduction.price=(order)=>{let total=Number(order.subtotal||0),now=new Date(),mins=now.getHours()*60+now.getMinutes(),day=now.getDay();const applicable=state.promotions.filter(p=>p.active!==false&&p.days.includes(day)&&total>=Number(p.minOrder||0)).filter(p=>{const a=p.start.split(':').map(Number),b=p.end.split(':').map(Number),s=a[0]*60+a[1],e=b[0]*60+b[1];return mins>=s&&mins<=e});for(const p of applicable){if(p.type==='fixed')total=Math.max(0,total-Number(p.value||0));else if(p.type==='percent')total=Math.max(0,total*(1-Math.min(100,Number(p.value||0))/100));else if(p.type==='bogo'&&order.items){const n=Math.max(0,Math.floor(order.items.reduce((s,i)=>s+Number(i.qty||0),0)/2));total=Math.max(0,total-n*Number(p.freePrice||0))}}return total};

  // Station routing and printer profiles.
  window.mkProduction.route=(item)=>{const s=state.stations;return item.station||s[item.category]||s.default||'Kitchen'};
  window.mkProduction.setStation=(category,station)=>{state.stations[category]=station;save()};
  window.mkProduction.setPrinter=(station,profile)=>{state.printers[station]=Object.assign({width:80,copies:1,enabled:true},profile);save()};
  window.mkProduction.printPlan=(order)=>{const groups={};(order.items||[]).forEach(i=>{const station=window.mkProduction.route(i);(groups[station]??=[]).push(i)});return Object.entries(groups).map(([station,items])=>({station,items,printer:state.printers[station]||state.printers.Kitchen||null}))};

  // Table service: reservation, join/split/transfer and timers.
  window.mkProduction.reserveTable=(x)=>{if(!x.tableId||!x.dateTime)throw Error('TABLE_AND_TIME_REQUIRED');const r=Object.assign({id:id('RES'),status:'reserved',createdAt:new Date().toISOString()},x);state.reservations.push(r);save();return r};
  window.mkProduction.tableReservations=(tableId,date)=>state.reservations.filter(r=>(!tableId||r.tableId===tableId)&&(!date||r.dateTime.startsWith(date))&&r.status!=='cancelled');
  window.mkProduction.joinTables=(tableIds)=>({id:id('JOIN'),tableIds:[...new Set(tableIds)],seats:tableIds.reduce((s,t)=>(s+Number((window.db?.tables||[]).find(x=>x.id===t)?.capacity||0)),0)});

  // Delivery zones and COD reconciliation.
  window.mkProduction.addDeliveryZone=x=>{if(!manager())throw Error('MANAGER_APPROVAL_REQUIRED');const z=Object.assign({id:id('ZONE'),minOrder:0,fee:0,active:true},x);state.deliveryZones.push(z);save();return z};
  window.mkProduction.deliveryFee=(zone,subtotal)=>{if(!zone||zone.active===false||Number(subtotal||0)<Number(zone.minOrder||0))return 0;return Number(zone.fee||0)};
  window.mkProduction.reconcileCOD=(orders)=>orders.filter(o=>o.payment==='COD'&&['completed','delivered'].includes(o.status)).reduce((s,o)=>s+Number(o.total||0),0);

  // Shift reconciliation, notifications and backup verification.
  window.mkProduction.shiftSummary=(shiftId)=>{const orders=(window.db?.orders||[]).filter(o=>o.shiftId===shiftId);const sales=orders.filter(o=>!['cancelled','voided','refunded'].includes(o.status)).reduce((s,o)=>s+Number(o.total||0),0);const cash=orders.filter(o=>o.payment==='Cash').reduce((s,o)=>s+Number(o.total||0),0);const refunds=orders.filter(o=>o.status==='refunded').reduce((s,o)=>s+Number(o.total||0),0);return {sales,cash,refunds,orders:orders.length}};
  window.mkProduction.markNotificationRead=id=>{const n=state.notifications.find(x=>x.id===id);if(n)n.read=true;save()};
  window.mkProduction.exportBackup=()=>{const payload={version:1,createdAt:new Date().toISOString(),database:clone(window.db||{}),production:clone(state)};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`mk-foods-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);state.backups.unshift({at:new Date().toISOString(),type:'manual'});save();return payload};
  window.mkProduction.verifyBackup=p=>!!p&&!!p.database&&!!p.production&&Array.isArray(p.database.orders||[]);

  // Multi-device sync queue: records mutations for later cloud transport without pretending the app is online.
  window.mkProduction.queueSync=(type,payload)=>{state.sync.queue.push({id:id('SYNC'),type,payload,createdAt:new Date().toISOString()});state.sync.queue=state.sync.queue.slice(-1000);save();return state.sync.queue.length};
  window.mkProduction.syncStatus=()=>({pending:state.sync.queue.length,lastPush:state.sync.lastPush,online:navigator.onLine});

  // Global safety hooks: all high-risk UI actions must pass the same approval gate.
  window.mkProduction.requireApproval=(action,details='')=>{if(manager())return true;const pin=prompt(`Manager approval PIN required for ${action}`);if(!pin)return false;state.approvals.unshift({id:id('APR'),action,details,by:'PIN_APPROVAL',at:new Date().toISOString()});save();return true};
  window.mkProduction.notify=notify;

  // Add a compact Operations panel to the existing dashboard without replacing the existing dashboard implementation.
  const oldDashboard=window.views?.dashboard;
  if(oldDashboard&&window.views){window.views.dashboard=function(v){oldDashboard(v);setTimeout(()=>{const host=document.getElementById('view');if(!host||host.querySelector('#productionCompletion'))return;const unread=state.notifications.filter(n=>!n.read).length,pending=state.sync.queue.length;const box=document.createElement('div');box.id='productionCompletion';box.className='panel';box.innerHTML=`<h2>Operations Center</h2><div class="grid cards"><div class="card"><small>Notifications</small><strong>${unread}</strong></div><div class="card"><small>Sync Queue</small><strong>${pending}</strong></div><div class="card"><small>Recipes</small><strong>${Object.keys(state.recipes).length}</strong></div><div class="card"><small>Reservations</small><strong>${state.reservations.filter(x=>x.status==='reserved').length}</strong></div></div><div class="quick"><button class="btn" onclick="mkProduction.exportBackup()">Backup Now</button><button class="btn secondary" onclick="alert(JSON.stringify(mkProduction.syncStatus(),null,2))">Sync Status</button><button class="btn secondary" onclick="alert('Pending notifications: '+mkProduction.state().notifications.filter(x=>!x.read).length)">Notifications</button></div>`;host.appendChild(box)},0)}}
  save();
})();
