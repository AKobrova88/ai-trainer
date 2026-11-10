'use strict';

const Startup = (() => {
  const fonts = document.getElementById?.('web-fonts');
  if (fonts?.media === 'print') {
    const applyFonts = () => { fonts.media = 'all'; };
    if (fonts.sheet) applyFonts();
    else fonts.addEventListener('load', applyFonts, { once: true });
  }

  function telegram(enabled) {
    if (!enabled) return Promise.resolve(null);
    if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-web-app.js';
      script.onload = () => resolve(window.Telegram?.WebApp || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    }).catch(() => null);
  }

  return { telegram };
})();
