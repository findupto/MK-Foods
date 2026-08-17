(() => {
  'use strict';
  const KEY = 'mkfoods.operational.v1';
  const now = () => new Date().toISOString();
  const uid = p => `${p}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const clone = x => JSON.parse(JSON.stringify(x));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const state = Object.assign({ schema:1, payments:{}, shifts:{}, audit:[], stockMovements:[], printJobs:{} }, read());
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const user = () => window.session?.username || window.currentUser?.username || 'system';
  const role = () => window.session?.role || window.currentUser?.role || 'Cashier';
  const privileged = () => ['Admin','Owner','Manager'].includes(role());
  const audit = (action, data={}) => { state.audit.unshift({id:uid('AUD'), action, by:user(), role:role(), at:now(), ...data}); state.audit = state.audit.slice(0,3000); save(); };

  const allowed = {
    new:['confirmed','cancelled'], draft:['confirmed','held','cancelled'], held:['draft','confirmed','cancelled'],
    confirmed:['sent_to_kitchen','cancelled','voided'], sent_to_kitchen:['preparing','held','voided'],
    preparing:['ready','held','voided'], ready:['collecting','dispatching','completed'], collecting:['completed'],
    dispatching:['out_for_delivery','completed','cancelled'], out_for_delivery:['completed','returned'],
    completed:['refunded','reopened'], reopened:['confirmed','cancelled'], cancelled:[], voided:[], refunded:[], returned:[]
  };
  function transition(order, next, reason='') {
    if (!order?.id) throw Error('ORDER_REQUIRED');
    const current = order.status || 'new';
    if (!(allowed[current] || []).includes(next)) throw Error(`INVALID_TRANSITION:${current}->${next}`);
    if (['voided','refunded','reopened'].includes(next) && !privileged()) throw Error('MANAGER_APPROVAL_REQUIRED');
    order.status = next; order.statusAt = now(); order.statusReason = String(reason || ''); order.updatedAt = now();
    audit('ORDER_TRANSITION',{orderId:order.id,from:current,to:next,reason});
    return order;
  }

  function addPayment(order, method, amount, reference='') {
    if (!order?.id) throw Error('ORDER_REQUIRED');
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) throw Error('INVALID_PAYMENT_AMOUNT');
    state.payments[order.id] ||= [];
    const paid = state.payments[order.id].reduce((s,p)=>s+Number(p.amount||0),0);
    const total = Number(order.total||0);
    const due = Math.max(0,total-paid);
    if (value > due + 0.005) throw Error('PAYMENT_EXCEEDS_DUE');
    const entry = {id:uid('PAY'), method:String(method||'cash'), amount:value, reference:String(reference||''), by:user(), at:now()};
    state.payments[order.id].push(entry);
    const newPaid = paid + value;
    order.amountPaid = newPaid; order.amountDue = Math.max(0,total-newPaid); order.paymentStatus = order.amountDue <= 0.005 ? 'paid' : 'partial';
    audit('PAYMENT_RECORDED',{orderId:order.id,method:entry.method,amount:value,amountPaid:newPaid,amountDue:order.amountDue});
    save(); return clone(entry);
  }

  function openShift(cashier, openingCash=0) {
    const key=String(cashier||user());
    if (state.shifts[key]?.status === 'open') throw Error('SHIFT_ALREADY_OPEN');
    const shift={id:uid('SHIFT'),cashier:key,openingCash:Math.max(0,Number(openingCash)||0),cashIn:0,cashOut:0,refunds:0,status:'open',openedAt:now(),entries:[]};
    state.shifts[key]=shift; audit('SHIFT_OPENED',{cashier:key,openingCash:shift.openingCash,shiftId:shift.id}); save(); return clone(shift);
  }
  function shiftEntry(cashier,type,amount,reason='') {
    const key=String(cashier||user()), shift=state.shifts[key];
    if (!shift || shift.status!=='open') throw Error('SHIFT_NOT_OPEN');
    const value=Number(amount); if (!Number.isFinite(value)||value<=0) throw Error('INVALID_SHIFT_AMOUNT');
    if (!['cashIn','cashOut','refund'].includes(type)) throw Error('INVALID_SHIFT_ENTRY');
    shift[type] = Number(shift[type]||0)+value;
    const entry={id:uid('SHIFT-E'),type,amount:value,reason:String(reason||''),by:user(),at:now()}; shift.entries.push(entry);
    audit('SHIFT_ENTRY',{shiftId:shift.id,...entry}); save(); return clone(entry);
  }
  function closeShift(cashier, actualCash) {
    const key=String(cashier||user()), shift=state.shifts[key];
    if (!shift || shift.status!=='open') throw Error('SHIFT_NOT_OPEN');
    const actual=Number(actualCash); if (!Number.isFinite(actual)||actual<0) throw Error('INVALID_ACTUAL_CASH');
    const expected=Number(shift.openingCash||0)+Number(shift.cashIn||0)-Number(shift.cashOut||0)-Number(shift.refunds||0);
    shift.expectedCash=expected; shift.actualCash=actual; shift.variance=Number((expected-actual).toFixed(2)); shift.status='closed'; shift.closedAt=now();
    audit('SHIFT_CLOSED',{shiftId:shift.id,cashier:key,expected,actual,variance:shift.variance}); save(); return clone(shift);
  }

  function recordStock(productId, quantity, reason, reference='') {
    const q=Number(quantity); if (!productId || !Number.isFinite(q) || q===0) throw Error('INVALID_STOCK_MOVEMENT');
    const movement={id:uid('STK'),productId,quantity:q,reason:String(reason||'adjustment'),reference:String(reference||''),by:user(),at:now()};
    state.stockMovements.unshift(movement); state.stockMovements=state.stockMovements.slice(0,5000); audit('STOCK_MOVEMENT',movement); save(); return clone(movement);
  }

  function printOnce(orderId, documentType, fn) {
    const key=`${orderId}:${documentType}`; const existing=state.printJobs[key];
    if (existing?.status==='completed') return {ok:false,duplicate:true,job:clone(existing)};
    const job={id:uid('PRINT'),orderId,documentType,status:'queued',queuedAt:now(),attempts:0}; state.printJobs[key]=job; save();
    try { const result=typeof fn==='function' ? fn() : null; job.status='completed'; job.completedAt=now(); job.result=result; save(); return {ok:true,job:clone(job)}; }
    catch(error) { job.status='failed'; job.failedAt=now(); job.error=String(error?.message||error); job.attempts++; save(); audit('PRINT_FAILED',{orderId,documentType,error:job.error}); throw error; }
  }

  function snapshot() { return clone({schema:1,createdAt:now(),state}); }
  function health() {
    const orders=Array.isArray(window.db?.orders)?window.db.orders:[];
    const openShifts=Object.values(state.shifts).filter(x=>x.status==='open').length;
    const invalid=orders.reduce((n,o)=>n+(!o.id||!Number.isFinite(Number(o.total))?1:0),0);
    return {ok:invalid===0,orders:orders.length,invalidOrders:invalid,openShifts,pendingPrints:Object.values(state.printJobs).filter(x=>x.status==='queued').length,auditEvents:state.audit.length,stockMovements:state.stockMovements.length};
  }
  window.mkFoodsOps={state:()=>snapshot(),audit,transition,addPayment,openShift,shiftEntry,closeShift,recordStock,printOnce,health};
  save();
})();
