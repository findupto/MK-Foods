const fs = require('fs');
const path = require('path');

function createStore(baseDir) {
  const dir = path.join(baseDir, 'data');
  const file = path.join(dir, 'store.json');
  fs.mkdirSync(dir, { recursive: true });
  let db;
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { db = seed(); persist(); }

  function persist() { fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8'); }
  function seed() {
    return { version: 1, products: [
      {id:'p1',name:'Chicken Pizza',category:'Pizza',price:850,available:true},
      {id:'p2',name:'Cheese Pizza',category:'Pizza',price:750,available:true},
      {id:'p3',name:'Zinger Burger',category:'Burgers',price:550,available:true},
      {id:'p4',name:'Fries',category:'Sides',price:220,available:true},
      {id:'p5',name:'Soft Drink',category:'Drinks',price:120,available:true},
      {id:'p6',name:'Ice Cream',category:'Desserts',price:250,available:true}
    ], orders: [], customers: [], riders: [], staff: [], audit: [], settings: {business:'MK Pizza & Ice Bar',address:'Collage Road Abbas Chowk, Bhakkar, Pakistan',phone:'0316 9700025',currency:'Rs.',tax:0,printerMac:''} };
  }
  return {
    get: () => db,
    save: persist,
    addOrder(order) { db.orders.push(order); db.audit.push({at:new Date().toISOString(),action:'ORDER_CREATED',id:order.id}); persist(); return order; },
    addAudit(event) { db.audit.push({...event,at:new Date().toISOString()}); persist(); },
    updateSettings(settings) { db.settings = {...db.settings,...settings}; persist(); return db.settings; }
  };
}
module.exports = { createStore };
