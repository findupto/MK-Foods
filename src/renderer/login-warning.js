(() => {
  const nativeAlert = window.alert.bind(window);
  window.alert = message => {
    const text = String(message ?? '');
    if (text === 'For security, change the default password before production use.') {
      const el = document.getElementById('loginError');
      if (el) {
        el.textContent = 'Default password detected. Sign in, then change the password in Settings.';
        el.className = 'error';
      }
      return;
    }
    nativeAlert(message);
  };
})();
