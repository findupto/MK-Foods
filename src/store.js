const fs=require('fs'),path=require('path'),crypto=require('crypto');
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
function createStore(baseDir){
 const dir=path.join(baseDir,'data'),file=path.join(dir,'store.json'); fs.mkdirSync(dir,{recursive:true});
 let db; try{db=JSON.parse(fs.readFileSync(file,'utf8'))}catch(_){db=seed();persist()}
 function persist(){fs.writeFileSync(file,JSON.stringify(db,null,2),'utf8')}
 function audit(action,data={}){db.audit.push({at:new Date().toISOString(),action,...data});persist()}
 function seed(){return{version:2,users:[
  {username:'admin',role:'Admin',passwordHash:hash('0099')},{username:'owner',role:'Owner',passwordHash:hash('0099')},{username:'cashier',role:'Cashier',passwordHash:hash('0099')},{username:'accountant',role:'Accountant',passwordHash:hash('0099')}],
  products:[{id:'p1',name:'Chicken Pizza',category:'Pizza',price:850,available:true},{id:'p2',name:'Cheese Pizza',category:'Pizza',price:750,available:true},{id:'p3',name:'Zinger Burger',category:'Burgers',price:550,available:true},{id:'p4',name:'Fries',category:'Sides',price:220,available:true},{id:'p5',name:'Soft Drink',category:'Drinks',price:120,available:true},{id:'p6',name:'Ice Cream',category:'Desserts',price:250,available:true}],
  orders:[],customers:[],riders:[],staff:[],tables:[{id:'T1',name:'T1',capacity:4,status:'Open'},{id:'T2',name:'T2',capacity:4,status:'Open'},{id:'T3',name:'T3',capacity:4,status:'Open'},{id:'T4',name:'T4',capacity:4,status:'Open'}],kitchenTickets:[],audit:[],settings:{business:'MK Pizza & Ice Bar',address:'Collage Road Abbas Chowk, Bhakkar, Pakistan',phone:'0316 9700025',currency:'Rs.',tax:0,printerMac:'',printerName:''}}}
 return{
  get:()=>db,
  authenticate(username,password){const u=db.users.find(x=>x.username===username&&x.passwordHash===hash(password));if(!u)return{ok:false};audit('LOGIN',{username:u.username});return{ok:true,user:{username:u.username,role:u.role}}},
  addOrder(o){db.orders.push(o);db.kitchenTickets.push({id:'K-'+o.id,orderId:o.id,status:'new',createdAt:o.createdAt,items:o.items});audit('ORDER_CREATED',{id:o.id});persist();return o},
  updateOrderStatus(id,status){const o=db.orders.find(x=>x.id===id);if(!o)return false;o.status=status;const k=db.kitchenTickets.find(x=>x.orderId===id);if(k)k.status=status==='completed'?'done':status;audit('ORDER_STATUS',{id,status});return true},
  saveProduct(p){const clean={...p,id:p.id||'p-'+Date.now(),name:String(p.name||'').trim(),category:String(p.category||'General').trim(),price:Number(p.price||0),available:p.available!==false};if(!clean.name)throw Error('Product name is required');const i=db.products.findIndex(x=>x.id===clean.id);if(i>=0)db.products[i]=clean;else db.products.push(clean);audit(i>=0?'MENU_UPDATED':'MENU_CREATED',{id:clean.id});return clean},
  deleteProduct(id){db.products=db.products.filter(x=>x.id!==id);audit('MENU_DELETED',{id});persist();return true},
  replaceProducts(products){db.products=products.map((p,i)=>({id:p.id||'p-'+Date.now()+'-'+i,name:String(p.name||'').trim(),category:String(p.category||'General').trim(),price:Number(p.price||0),available:String(p.available).toLowerCase()!=='false'})).filter(p=>p.name);audit('MENU_BULK_IMPORT',{count:db.products.length});persist();return db.products},
  addCustomer(c){const x={id:c.id||'c-'+Date.now(),name:c.name,phone:c.phone||'',email:c.email||'',birthday:c.birthday||'',points:Number(c.points||0)};db.customers.push(x);audit('CUSTOMER_CREATED',{id:x.id});persist();return x},
  addRider(r){const x={id:r.id||'r-'+Date.now(),name:r.name,phone:r.phone||'',zone:r.zone||'',status:r.status||'Available',cod:0};db.riders.push(x);audit('RIDER_CREATED',{id:x.id});persist();return x},
  assignOrder(orderId,riderId){const o=db.orders.find(x=>x.id===orderId),r=db.riders.find(x=>x.id===riderId);if(!o||!r)throw Error('Order or rider not found');o.riderId=riderId;o.status='dispatched';r.status='Assigned';audit('ORDER_DISPATCHED',{orderId,riderId});persist();return o},
  updateTable(id,status){const t=db.tables.find(x=>x.id===id);if(!t)return false;t.status=status;audit('TABLE_STATUS',{id,status});persist();return t},
  addAudit:e=>audit(e.action||'EVENT',e),
  updateSettings(s){db.settings={...db.settings,...s};persist();return db.settings}
 }
}
module.exports={createStore};
