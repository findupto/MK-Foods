const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'../src/renderer/finalization-suite.js'),'utf8');
const storage=new Map();
const context={window:{session:{username:'admin',role:'Admin'},db:{orders:[{id:'o1',total:100}],tables:[{id:'T1',status:'Open'},{id:'T2',status:'Open'}]},mkFoods:{}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},prompt:()=>null,console};
vm.createContext(context);vm.runInContext(src,context);const f=context.window.mkFinal;
assert.strictEqual(f.unitFactor('kg','g'),1000);
f.state().ingredients.a={name:'Cheese',unit:'g',costUnit:'g',costPerUnit:.5,stock:100,minStock:10};
// State is cloned externally; populate persisted state through a fresh storage payload.
const st=f.state();st.ingredients.a={name:'Cheese',unit:'g',costUnit:'g',costPerUnit:.5,stock:100,minStock:10};st.recipes.p1=[{ingredientId:'a',qty:100,unit:'g'}];
context.localStorage.setItem('mkfoods.final.v3',JSON.stringify(st));vm.runInContext(src,context);
const g=context.window.mkFinal;
assert.strictEqual(g.recipeCost('p1'),50);
const order={id:'o1',status:'draft',subtotal:100};g.transition(order,'confirmed');assert.strictEqual(order.status,'confirmed');
assert.strictEqual(g.addPayment('o1','Cash',40).due,60);assert.strictEqual(g.addPayment('o1','Card',60).status,'paid');
const sh=g.startShift('cashier',10000);g.shiftEntry('cashier','cashIn',500);g.shiftEntry('cashier','cashOut',200);const closed=g.closeShift('cashier',10200);assert.strictEqual(closed.expectedCash,10300);assert.strictEqual(closed.variance,100);
const promo=g.calculatePromotion({subtotal:100,items:[]},{type:'percent',value:20});assert.strictEqual(promo,80);
const b=g.backup();assert.strictEqual(g.verifyBackup(b),true);b.db.orders[0].total=999;assert.strictEqual(g.verifyBackup(b),false);
const ev=g.queueSync('TEST',{id:1});assert.ok(ev.eventId&&ev.originDeviceId);g.ackSync(ev.eventId);assert.strictEqual(g.state().sync.queue.length,0);
console.log('Finalization suite checks passed.');
