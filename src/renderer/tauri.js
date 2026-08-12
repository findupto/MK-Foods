(() => {
  const tauri=window.__TAURI__;
  if(!tauri?.core?.invoke) throw new Error('Tauri runtime is unavailable.');
  const invoke=(command,args={})=>tauri.core.invoke(command,args);
  const safe=async(command,args={})=>{try{return await invoke(command,args)}catch(error){const r=String(error?.message||error||'OPERATION_FAILED');if(/UNAUTHENTICATED|SESSION/i.test(r))return{ok:false,reason:'UNAUTHENTICATED'};if(/FORBIDDEN/i.test(r))return{ok:false,reason:'FORBIDDEN'};return{ok:false,reason:r}}};
  const action=(op,data={})=>safe('pos_action',{op,data}); const dialog=tauri.dialog;
  window.mkFoods={
    getAppInfo:()=>invoke('app_info'),login:(u,p)=>safe('login',{u,p}),pinLogin:(u,p)=>safe('pin_login',{u,p}),logout:()=>invoke('logout'),session:()=>invoke('session'),snapshot:()=>invoke('snapshot'),
    changePassword:(current,next)=>safe('change_password',{current,next}),resetPassword:(target,temp)=>safe('reset_password',{target,temp}),createOrder:order=>safe('create_order',{order}),orderStatus:(id,status)=>safe('order_status',{id,status}),assignOrder:(id,rider)=>safe('assign_order',{id,rider}),updateTable:(id,status)=>safe('update_table',{id,status}),
    addCustomer:c=>action('add_customer',c),addRider:r=>action('add_rider',r),saveRiderSettings:(base,perKm)=>action('rider_rate',{base,perKm}),calcDelivery:(distanceKm,riderId)=>action('calc_delivery',{distanceKm,riderId}),updateDelivery:(orderId,riderId,distanceKm,deliveryFee,riderPay,address,zone,status)=>action('delivery',{orderId,riderId,distanceKm,deliveryFee,riderPay,address,zone,status}),
    addStaff:data=>action('add_staff',data),updateStaff:(id,data)=>action('update_staff',{...data,id}),deleteStaff:id=>action('deactivate_staff',{id}),addCounter:data=>action('add_counter',data),updateCounter:(id,data)=>action('update_counter',{...data,id}),
    addExpense:data=>action('add_expense',data),deleteExpense:id=>action('delete_expense',{id}),stockAdjust:(productId,qty,reason)=>action('stock_adjust',{productId,qty,reason}),addSupplier:data=>action('add_supplier',data),addPurchase:data=>action('add_purchase',data),
    saveProduct:p=>safe('save_product',{p}),deleteProduct:id=>safe('delete_product',{id}),replaceProducts:p=>safe('replace_products',{products:p}),updateSettings:s=>safe('update_settings',{settings:s}),audit:e=>safe('add_audit',{e}),discoverPrinters:()=>safe('discover_printers'),connectPrinter:mac=>safe('connect_printer',{mac}),
    exportMenu:async()=>{const path=await dialog.save({defaultPath:'mk-foods-menu.csv',filters:[{name:'CSV',extensions:['csv']}]});return path?safe('export_menu',{path}):null},
    importMenu:async()=>{const path=await dialog.open({multiple:false,directory:false,filters:[{name:'CSV',extensions:['csv']}]});return path?safe('import_menu',{path}):null}
  };
})();