document.addEventListener('DOMContentLoaded', async () => {
  const info = await window.mkFoods.getAppInfo();
  document.title = info.name;
  const mode = document.getElementById('mode');
  if (mode) mode.textContent = 'Offline Ready';
});
