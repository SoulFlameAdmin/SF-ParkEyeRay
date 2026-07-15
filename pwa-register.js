(() => {
  const state = {
    deferredPrompt: null,
    registration: null,
  };

  const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function exposeStatus(status, detail = {}) {
    document.documentElement.dataset.pwaStatus = status;
    emit('parkeyeray:pwa-status', { status, ...detail });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredPrompt = event;
    exposeStatus('installable');
  });

  window.addEventListener('appinstalled', () => {
    state.deferredPrompt = null;
    exposeStatus('installed');
  });

  window.ParkEyeRayPWA = {
    isStandalone,
    getStatus() {
      return document.documentElement.dataset.pwaStatus || 'unknown';
    },
    async install() {
      if (isStandalone()) return { outcome: 'already-installed' };
      if (!state.deferredPrompt) return { outcome: 'unavailable' };

      const prompt = state.deferredPrompt;
      state.deferredPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      exposeStatus(choice.outcome === 'accepted' ? 'installing' : 'dismissed');
      return choice;
    },
    async activateUpdate() {
      const waiting = state.registration?.waiting;
      if (!waiting) return false;
      waiting.postMessage({ type: 'SKIP_WAITING' });
      return true;
    },
  };

  if (!('serviceWorker' in navigator)) {
    exposeStatus('unsupported');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      state.registration = registration;
      exposeStatus(isStandalone() ? 'installed' : 'registered', { scope: registration.scope });

      if (registration.waiting) emit('parkeyeray:pwa-update', { waiting: true });
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            emit('parkeyeray:pwa-update', { waiting: true });
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        emit('parkeyeray:pwa-update', { activated: true });
      });
    } catch (error) {
      exposeStatus('registration-failed', { message: error?.message || String(error) });
      console.warn('ParkEyeRay PWA service worker registration failed:', error);
    }
  });
})();