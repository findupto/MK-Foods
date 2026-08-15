(() => {
  try {
    Object.defineProperty(window, 'session', {
      configurable: true,
      get: () => window.mkFoodsSession?.user || null
    });
  } catch (_) {}
})();
