(() => {
  'use strict';
  const once = new Set();
  const safeMessage = value => {
    const text = String(value?.message || value || 'Unexpected application error').trim();
    return text.length > 180 ? `${text.slice(0,177)}…` : text;
  };
  const notify = (message, error = true) => {
    try {
      if (typeof window.toast === 'function') window.toast(message, error);
      else if (window.mkFoodsUX?.toast) window.mkFoodsUX.toast(message, error);
    } catch (_) {}
  };
  const report = (value, key = '') => {
    const message = safeMessage(value);
    const fingerprint = `${key}:${message}`;
    if (once.has(fingerprint)) return;
    once.add(fingerprint);
    console.error('[MK Foods]', value);
    notify(message, true);
    setTimeout(() => once.delete(fingerprint), 10000);
  };
  window.addEventListener('error', event => {
    if (event?.filename && /chrome-extension:|extensions\//i.test(event.filename)) return;
    report(event?.error || event?.message, 'error');
  });
  window.addEventListener('unhandledrejection', event => report(event?.reason, 'rejection'));

  // Avoid repeated expensive layout work when a POS window is resized rapidly.
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      document.documentElement.style.setProperty('--mk-viewport-height', `${window.innerHeight}px`);
    });
  }, { passive: true });

  // Fast keyboard navigation without taking control away from form fields.
  window.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
    const target = event.target;
    if (target && /input|textarea|select/i.test(target.tagName)) return;
    event.preventDefault();
    const input = document.querySelector('.mk-enterprise-command input, #pcSearch, input[placeholder*="Search" i]');
    if (input) { input.focus(); input.select?.(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    try { window.refreshPrinterDiscovery?.(); } catch (_) {}
  }, { passive: true });
})();
