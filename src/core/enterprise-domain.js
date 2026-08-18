/* MK Foods Enterprise Domain — inventory, purchasing, CRM, loyalty, cash, accounting, workforce and reporting. */
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v));
const id=(p='ID')=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`.toUpperCase();
const now=()=>new Date().toISOString();
const cents=v=>Math.round((Number(v)||0)*100);
const amount=v=>cents(v)/100;
const assert=(ok,msg,code='ENTERPRISE_ERROR')=>{if(!ok){const e=new Error(msg);e.code=code;throw e;}};

function stockMovement(stock,{productId,quantity,type,reference,unitCost=0,actor='system'}){
  const p=stock.find(x=>x.id===productId); assert(p,'Product not found.','PRODUCT_NOT_FOUND');
  const q=Number(quantity); assert(q>0,'Quantity must be positive.','INVALID_QUANTITY');
  if(['sale','waste','adjustment-out'].includes(type)) assert(Number(p.stock||0)>=q,'Insufficient stock.','INSUFFICIENT_STOCK');
  p.stock=Number(p.stock||0)+(['purchase','return','adjustment-in'].includes(type)?q:-q); p.updatedAt=now();
  p.movements=p.movements||[]; p.movements.push({id:id('MOV'),at:now(),type,quantity:q,reference:reference||null,unitCost:cents(unitCost),actor});
  return clone(p);
}
function receivePurchase(stock,purchase,actor='system'){
  assert(purchase&&purchase.status!=='received','Purchase already received.','PURCHASE_ALREADY_RECEIVED');
  for(const line of purchase.items||[]) stockMovement(stock,{productId:line.productId,quantity:line.qty,type:'purchase',reference:purchase.id,unitCost:line.unitCost,actor});
  purchase.status='received'; purchase.receivedAt=now(); purchase.receivedBy=actor; return purchase;
}
function createPurchase(input,actor='system'){
  assert((input.items||[]).length>0,'Purchase requires items.','EMPTY_PURCHASE');
  const items=input.items.map(i=>({productId:i.productId,qty:Number(i.qty),unitCost:amount(i.unitCost),name:i.name||''}));
  items.forEach(i=>assert(i.productId&&i.qty>0,'Invalid purchase item.','INVALID_PURCHASE_ITEM'));
  const total=items.reduce((s,i)=>s+cents(i.qty*i.unitCost),0);
  return {id:input.id||id('PO'),supplierId:input.supplierId||null,status:'draft',createdAt:now(),createdBy:actor,items,totalCents:total};
}
function createCustomer(input={}){return {id:input.id||id('CUS'),name:String(input.name||''),phone:String(input.phone||''),email:String(input.email||''),addresses:clone(input.addresses||[]),notes:String(input.notes||''),loyaltyPoints:Number(input.loyaltyPoints||0),storeCreditCents:cents(input.storeCredit||0),createdAt:now(),updatedAt:now()};}
function addLoyalty(customer,points,reason,actor='system'){const p=Math.trunc(Number(points)||0);assert(p!==0,'Points cannot be zero.','INVALID_POINTS');assert(customer.loyaltyPoints+p>=0,'Insufficient loyalty points.','LOYALTY_NEGATIVE');customer.loyaltyPoints+=p;customer.loyaltyEvents=customer.loyaltyEvents||[];customer.loyaltyEvents.push({id:id('LOY'),at:now(),points:p,reason,actor});return customer;}
function openShift(input,actor='system'){return {id:input.id||id('SHIFT'),registerId:input.registerId,employeeId:input.employeeId,openedAt:now(),openingCashCents:cents(input.openingCash),cashSalesCents:0,paidOutCents:0,paidInCents:0,status:'open',openedBy:actor,events:[]};}
function recordShiftCash(shift,{type,amount,reference,actor='system'}){assert(shift.status==='open','Shift is not open.','SHIFT_CLOSED');const v=cents(amount);assert(v>0,'Amount must be positive.','INVALID_CASH');const map={sale:'cashSalesCents',paidIn:'paidInCents',paidOut:'paidOutCents'};assert(map[type],'Invalid cash event.','INVALID_CASH_EVENT');if(type==='paidOut')assert(v<=shift.openingCashCents+shift.cashSalesCents+shift.paidInCents-shift.paidOutCents,'Cash drawer cannot go below zero.','CASH_SHORTAGE');shift[map[type]]+=v;shift.events.push({id:id('CASH'),at:now(),type,amountCents:v,reference:reference||null,actor});return shift;}
function closeShift(shift,actualCash,actor='system'){assert(shift.status==='open','Shift already closed.','SHIFT_CLOSED');const expected=shift.openingCashCents+shift.cashSalesCents+shift.paidInCents-shift.paidOutCents;const actual=cents(actualCash);shift.expectedCashCents=expected;shift.actualCashCents=actual;shift.varianceCents=actual-expected;shift.closedAt=now();shift.closedBy=actor;shift.status='closed';return shift;}
function postJournal(entry,ledger,actor='system'){assert(entry&&entry.lines&&entry.lines.length>=2,'Journal needs at least two lines.','INVALID_JOURNAL');const total=entry.lines.reduce((s,l)=>s+cents(l.amount),0);assert(total>0,'Journal amount must be positive.','INVALID_JOURNAL');const debit=entry.lines.filter(l=>l.type==='debit').reduce((s,l)=>s+cents(l.amount),0);const credit=entry.lines.filter(l=>l.type==='credit').reduce((s,l)=>s+cents(l.amount),0);assert(debit===credit,'Journal is not balanced.','UNBALANCED_JOURNAL');const j={id:entry.id||id('JE'),at:now(),reference:entry.reference||null,memo:entry.memo||'',lines:clone(entry.lines),actor};ledger.push(j);return j;}
function salesJournal(order,ledger,accounts,actor='system'){return postJournal({reference:order.id,memo:'POS sale',lines:[{account:accounts.cash,type:'debit',amount:amount(order.totalCents/100)},{account:accounts.sales,type:'credit',amount:amount(order.totalCents/100)}]},ledger,actor);}
function dashboard({orders=[],products=[],customers=[],shifts=[],ledger=[]}={}){const sales=orders.filter(o=>o.stage==='completed').reduce((s,o)=>s+Number(o.totalCents||0),0);const openOrders=orders.filter(o=>!['completed','cancelled','refunded'].includes(o.stage)).length;const lowStock=products.filter(p=>Number(p.stock||0)<=Number(p.reorderLevel||0)).length;const activeCustomers=customers.length;const openShifts=shifts.filter(s=>s.status==='open').length;return {sales:amount(sales/100),openOrders,lowStock,customers:activeCustomers,openShifts,journalEntries:ledger.length};}
function auditEvent(audit,{actor,action,entity,entityId,before,after,reason=''}){const e={id:id('AUD'),at:now(),actor:actor||'system',action,entity,entityId:entityId||null,reason,before:clone(before),after:clone(after)};audit.push(e);return e;}
module.exports={cents,amount,stockMovement,receivePurchase,createPurchase,createCustomer,addLoyalty,openShift,recordShiftCash,closeShift,postJournal,salesJournal,dashboard,auditEvent};
if(typeof window!=='undefined') window.MKFoodsEnterpriseDomain=module.exports;
