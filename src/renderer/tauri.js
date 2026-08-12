(() => {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) {
    throw new Error('Tauri runtime is unavailable.');
  }

  const invoke = (command, args = {}) => tauri.core.invoke(command, args);
  const dialog = tauri.dialog;

  window.mkFoods = {
    getAppInfo: () => invoke('app_info'),
    login: (u, p) => invoke('login', { u, p }),
    pinLogin: (u, p) => invoke('pin_login', { u, p }),
    logout: () => invoke('logout'),
    changePassword: (current, next) => invoke('change_password', { current, next }),
    resetPassword: (user, temp) => invoke('reset_password', { target: user, temp }),
    session: () => invoke('session'),
    snapshot: () => invoke('snapshot'),
    createOrder: order => invoke('create_order', { order }),
    orderStatus: (id, status) => invoke('order_status', { id, status }),
    assignOrder: (id, rider) => invoke('assign_order', { id, rider }),
    updateTable: (id, status) => invoke('update_table', { id, status }),
    addCustomer: c => invoke('add_customer', { c }),
    addRider: r => invoke('add_rider', { r }),
    saveProduct: p => invoke('save_product', { p }),
    deleteProduct: id => invoke('delete_product', { id }),
    replaceProducts: p => invoke('replace_products', { products: p }),
    audit: e => invoke('add_audit', { e }),
    updateSettings: s => invoke('update_settings', { settings: s }),
    discoverPrinters: () => invoke('discover_printers'),
    connectPrinter: mac => invoke('connect_printer', { mac }),
    exportMenu: async () => {
      const path = await dialog.save({
        defaultPath: 'mk-foods-menu.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });
      return path ? invoke('export_menu', { path }) : null;
    },
    importMenu: async () => {
      const path = await dialog.open({
        multiple: false,
        directory: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });
      return path ? invoke('import_menu', { path }) : null;
    }
  };
})();
