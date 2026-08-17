(() => {
  'use strict';
  if (window.__mkProductionPrintFix) return;
  window.__mkProductionPrintFix = true;

  const QUEUE_KEY = 'mk-foods-print-queue-v4';
  const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (_) { return []; } };
  const writeQueue = rows => localStorage.setItem(QUEUE_KEY, JSON.stringify(rows));
  const orderExists = id => (window.db?.orders || []).find(o => o.id === id);
  const printerName = () => String(window.db?.settings?.printerName || '').trim();
  const isNiimbot = name => /^B11(?:[-_ ]|$)/i.test(String(name || '').trim());

  function enqueue(order, type = 'Sale Receipt') {
    if (!order?.id) return false;
    const rows = readQueue();
    const value = { ...JSON.parse(JSON.stringify(order)), printDocumentType: type, printStatus: 'queued', printError: '', queuedAt: new Date().toISOString(), receiptPrintConfirmed: true };
    const index = rows.findIndex(x => x.id === order.id && x.printDocumentType === type);
    if (index >= 0) rows[index] = { ...rows[index], ...value };
    else rows.unshift(value);
    writeQueue(rows);
    return true;
  }

  async function printSale(order) {
    if (!order?.id) return false;
    enqueue(order, 'Sale Receipt');
    try {
      if (typeof window.passPrintJob === 'function') {
        await window.passPrintJob(order.id);
        return true;
      }
      throw new Error('PRINT_ENGINE_UNAVAILABLE');
    } catch (error) {
      const message = String(error?.message || error || 'PRINT_FAILED');
      const rows = readQueue().map(x => x.id === order.id ? { ...x, printStatus: 'error', printError: message } : x);
      writeQueue(rows);
      if (typeof window.toast === 'function') window.toast(`Receipt ${order.id}: ${message}`, true);
      return false;
    }
  }

  const originalQueue = window.queueOrderForPrint;
  window.queueOrderForPrint = order => {
    if (order?.printDocumentType === 'Sale Receipt') {
      void printSale(order);
      return true;
    }
    return originalQueue?.(order);
  };

  function newestCompleted(beforeIds) {
    return (window.db?.orders || [])
      .filter(o => !beforeIds.has(o.id) && ['completed', 'delivered'].includes(String(o.status || '').toLowerCase()))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
  }

  function wrapCompletion(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__mkReceiptWrapped) return;
    const wrapped = async function (...args) {
      const before = new Set((window.db?.orders || []).map(o => o.id));
      const result = await original.apply(this, args);
      const order = newestCompleted(before);
      if (order) await printSale(order);
      return result;
    };
    wrapped.__mkReceiptWrapped = true;
    window[name] = wrapped;
  }

  wrapCompletion('posCoreComplete');
  wrapCompletion('checkout');

  const originalGo = window.go;
  if (typeof originalGo === 'function') {
    window.go = function (next) {
      window.closeDetail?.();
      document.getElementById('detailModal')?.classList.remove('open');
      const workflowModal = document.getElementById('workflowModal');
      if (workflowModal) { workflowModal.hidden = true; workflowModal.innerHTML = ''; }
      return originalGo.apply(this, arguments);
    };
  }

  window.mkFoodsAutoPrint = { printSale, enqueue, isNiimbot };
  console.info('[MK Foods] Production print fix active: automatic sale receipts + modal-safe navigation.');
})();
