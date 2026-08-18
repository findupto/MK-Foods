/*
 * MK Foods POS — Unified Domain Engine
 * Pure JavaScript domain layer. No DOM, printer, Tauri, or network dependencies.
 * UI/native adapters should call these functions rather than mutate financial state directly.
 */
'use strict';

const VERSION = 1;
const TERMINAL_STAGES = new Set(['completed','cancelled','refunded']);
const STAGES = ['draft','confirmed','routed','preparing','ready','counter','delivery','settled','completed','cancelled','refunded'];
const TRANSITIONS = {
  draft:['confirmed','cancelled'],
  confirmed:['routed','cancelled'],
  routed:['preparing','cancelled'],
  preparing:['ready','cancelled'],
  ready:['counter','delivery','cancelled'],
  counter:['settled','delivery','cancelled'],
  delivery:['settled','cancelled'],
  settled:['completed','refunded'],
  completed:['refunded'],
  cancelled:[],
  refunded:[]
};

const clone = value => JSON.parse(JSON.stringify(value));
const id = (prefix='ID') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`.toUpperCase();
const now = () => new Date().toISOString();
const money = value => Math.round((Number(value)||0) * 100);
const fromMoney = cents => Math.round(Number(cents)||0) / 100;
const assert = (condition, message, code='DOMAIN_ERROR') => { if (!condition) { const e=new Error(message); e.code=code; throw e; } };

function createOrder(input, actor='system') {
  const items=(input.items||[]).map(i=>({
    id:i.id || id('LINE'), productId:i.productId || i.id, name:String(i.name||'Item'),
    qty:Number(i.qty||0), unitPrice:money(i.unitPrice ?? i.price), modifiers:clone(i.modifiers||[]),
    notes:String(i.notes||''), category:i.category||null
  }));
  assert(items.length>0,'An order requires at least one item.','EMPTY_ORDER');
  items.forEach(i=>assert(i.qty>0,'Item quantity must be greater than zero.','INVALID_QTY'));
  const subtotal=items.reduce((s,i)=>s+i.qty*i.unitPrice,0);
  const discount=Math.max(0,Math.min(subtotal,money(input.discount||0)));
  const taxable=Math.max(0,subtotal-discount);
  const tax=Math.max(0,money(input.tax||0));
  const deliveryFee=Math.max(0,money(input.deliveryFee||0));
  const total=taxable+tax+deliveryFee;
  if(input.orderType==='Delivery') assert(String(input.deliveryAddress||input.address||'').trim().length>0,'Delivery address is required.','DELIVERY_ADDRESS_REQUIRED');
  const order={
    schemaVersion:VERSION,id:input.id||id('ORD'),createdAt:now(),createdBy:actor,
    orderType:input.orderType||'Takeaway',stage:'draft',status:'open',
    customerId:input.customerId||null,customerName:input.customerName||'',customerPhone:input.customerPhone||'',
    deliveryAddress:input.deliveryAddress||input.address||'',deliveryInstructions:input.deliveryInstructions||'',
    tableId:input.tableId||null,registerId:input.registerId||null,items,
    subtotalCents:subtotal,discountCents:discount,taxCents:tax,deliveryFeeCents:deliveryFee,totalCents:total,
    payments:[],events:[{id:id('EVT'),at:now(),type:'ORDER_CREATED',actor}],version:1
  };
  return order;
}

function transition(order,next,actor='system',meta={}) {
  assert(order && typeof order==='object','Order is required.','ORDER_REQUIRED');
  const allowed=TRANSITIONS[order.stage]||[];
  assert(allowed.includes(next),`Cannot move order from ${order.stage} to ${next}.`,'INVALID_TRANSITION');
  const previous=order.stage; order.stage=next;
  order.events.push({id:id('EVT'),at:now(),type:'ORDER_STAGE_CHANGED',actor,from:previous,to:next,meta:clone(meta)});
  order.version=(order.version||0)+1;
  if(TERMINAL_STAGES.has(next)) order.status=next;
  return order;
}

function addPayment(order,payment,actor='system') {
  assert(order.stage==='counter'||order.stage==='delivery'||order.stage==='settled','Order is not ready for payment.','PAYMENT_STAGE_INVALID');
  const amount=money(payment.amount);
  assert(amount>0,'Payment amount must be greater than zero.','INVALID_PAYMENT');
  const paid=order.payments.reduce((s,p)=>s+p.amountCents,0);
  assert(paid+amount<=order.totalCents,'Payment exceeds amount due.','OVERPAYMENT');
  const record={id:id('PAY'),at:now(),method:payment.method||'Cash',amountCents:amount,reference:payment.reference||null,actor};
  order.payments.push(record); order.version=(order.version||0)+1;
  const remaining=order.totalCents-(paid+amount);
  if(remaining===0 && order.stage!=='settled') transition(order,'settled',actor,{paymentId:record.id});
  return {payment:record,remainingCents:remaining,order};
}

function refund(order,amount,actor='system',reason='') {
  assert(order.stage==='completed'||order.stage==='settled','Only settled orders can be refunded.','REFUND_STAGE_INVALID');
  const paid=order.payments.reduce((s,p)=>s+p.amountCents,0);
  const refunded=order.refunds?.reduce((s,r)=>s+r.amountCents,0)||0;
  const cents=money(amount);
  assert(cents>0 && cents<=paid-refunded,'Refund exceeds refundable amount.','REFUND_EXCEEDS_PAYMENT');
  order.refunds=order.refunds||[]; order.refunds.push({id:id('REF'),at:now(),amountCents:cents,actor,reason});
  order.events.push({id:id('EVT'),at:now(),type:'REFUND_CREATED',actor,amountCents:cents,reason});
  order.version=(order.version||0)+1;
  if(cents===paid-refunded) order.stage='refunded';
  return order;
}

function allocateInventory(order,products) {
  const next=clone(products||[]); const byId=new Map(next.map(p=>[p.id,p]));
  for(const line of order.items){const p=byId.get(line.productId); if(!p) continue; const qty=Number(line.qty); assert(Number(p.stock||0)>=qty,`Insufficient stock for ${line.name}.`,'INSUFFICIENT_STOCK');}
  for(const line of order.items){const p=byId.get(line.productId); if(p){p.stock=Number(p.stock||0)-Number(line.qty); p.updatedAt=now();}}
  return next;
}

function createPrintJob(order,type,printer='Thermal Printer') {
  assert(order && order.id,'Order is required.','ORDER_REQUIRED');
  const valid=['customer','sale','kitchen','delivery','refund','label'];
  assert(valid.includes(type),'Unsupported print document type.','PRINT_TYPE_INVALID');
  return {id:id('PRINT'),orderId:order.id,type,status:'queued',printer,attempts:0,createdAt:now(),payload:{order:clone(order)}};
}

function createReceiptTemplate(input={}) {
  return {
    id:input.id||id('TPL'),name:input.name||'Default Thermal Receipt',paperWidth:Number(input.paperWidth||80),
    mode:input.mode||'graphics',theme:input.theme||'modern',fontSize:Number(input.fontSize||22),padding:Number(input.padding||16),
    show:{logo:true,address:true,phone:true,customer:true,orderType:true,date:true,payment:true,tax:true,discount:true,delivery:true,...(input.show||{})},
    blocks:input.blocks||[
      {type:'business',align:'center',bold:true},{type:'address',align:'center'},{type:'phone',align:'center'},
      {type:'separator'},{type:'orderMeta'},{type:'items'},{type:'totals'},{type:'payment'},{type:'footer',align:'center'}
    ],footer:input.footer||'Thank you for visiting!'
  };
}

function renderTemplate(template,order,settings={}) {
  const values={business:settings.business||'MK FOODS',address:settings.address||'',phone:settings.phone||'',order_id:order.id,
    customer:order.customerName||'Walk-in',customer_phone:order.customerPhone||'',order_type:order.orderType||'Takeaway',
    delivery_address:order.deliveryAddress||'',delivery_instructions:order.deliveryInstructions||'',date:new Date(order.createdAt||Date.now()).toLocaleString(),
    subtotal:fromMoney(order.subtotalCents),discount:fromMoney(order.discountCents),tax:fromMoney(order.taxCents),delivery:fromMoney(order.deliveryFeeCents),total:fromMoney(order.totalCents),
    payment:(order.payments||[]).map(p=>p.method).join(', ')||'Unpaid',footer:settings.footer||'Thank you for visiting!'};
  const items=(order.items||[]).map(i=>`${i.qty} x ${i.name}  ${fromMoney(i.qty*i.unitPrice).toFixed(2)}`).join('\n');
  return String(template||'').replace(/\{\{([a-z0-9_]+)\}\}/gi,(_,key)=>key.toLowerCase()==='items'?items:String(values[key.toLowerCase()]??''));
}

function summarize(order) {
  const paid=(order.payments||[]).reduce((s,p)=>s+p.amountCents,0); const refunded=(order.refunds||[]).reduce((s,r)=>s+r.amountCents,0);
  return {id:order.id,stage:order.stage,total:fromMoney(order.totalCents),paid:fromMoney(paid),due:fromMoney(Math.max(0,order.totalCents-paid)),refunded:fromMoney(refunded),items:order.items.length,version:order.version};
}

module.exports={VERSION,STAGES,TRANSITIONS,money,fromMoney,createOrder,transition,addPayment,refund,allocateInventory,createPrintJob,createReceiptTemplate,renderTemplate,summarize};
if(typeof window!=='undefined') window.MKFoodsDomain={VERSION,STAGES,TRANSITIONS,money,fromMoney,createOrder,transition,addPayment,refund,allocateInventory,createPrintJob,createReceiptTemplate,renderTemplate,summarize};
