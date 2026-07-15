(() => {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.info('ParkEyeRay PWA service worker active:', registration.scope);
    } catch (error) {
      console.warn('ParkEyeRay PWA service worker registration failed:', error);
    }
  });
})();
