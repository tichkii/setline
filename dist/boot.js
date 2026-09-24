// Keep a useful recovery screen if a module cannot load on an unreliable connection.
(() => {
  const showRecovery = () => {
    const app = document.getElementById('app');
    if (!app || app.dataset.ready === 'true') return;
    document.getElementById('boot-status').textContent = 'Setline could not finish loading. Reconnect and try again. If you have opened this app before, close and reopen it to use the saved offline version. Your saved workout data has not been cleared.';
    document.getElementById('boot-retry').hidden = false;
  };
  document.getElementById('boot-retry').addEventListener('click', () => location.reload());
  window.addEventListener('error', event => {
    if (event.target instanceof HTMLScriptElement) showRecovery();
  }, true);
  setTimeout(showRecovery, 8000);
})();
