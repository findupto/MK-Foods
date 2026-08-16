(() => {
  const originalCheckout = window.checkout;
  if (typeof originalCheckout !== 'function') return;
  window.checkout = async () => {
    const payment = String(document.getElementById('payment')?.value || '').toLowerCase();
    await originalCheckout();
    if (payment !== 'cash' || typeof window.printReceipt !== 'function') return;
    const latest = [...(db.orders || [])].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
    if (latest) window.printReceipt({...latest, printDocumentType:'Sale Receipt'});
  };
})();
