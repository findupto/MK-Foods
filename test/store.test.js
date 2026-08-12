const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const{createStore}=require('../src/store');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mkfoods-'));const s=createStore(dir);
assert.equal(s.authenticate('cashier','0099').ok,true);assert.equal(s.authenticate('cashier','bad').ok,false);
const before=s.get().orders.length;s.addOrder({id:'TEST-1',total:100,status:'completed'});assert.equal(s.get().orders.length,before+1);
console.log('MK Foods offline store tests passed');
