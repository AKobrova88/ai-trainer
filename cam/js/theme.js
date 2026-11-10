'use strict';
const cameraThemePreference = new URLSearchParams(location.search).get('theme');
const cameraColorScheme = window.matchMedia('(prefers-color-scheme: dark)');
function syncCameraTheme(telegram) {
  const light = cameraThemePreference === 'bento' || (cameraThemePreference !== 'dusk' &&
    (telegram ? telegram.colorScheme === 'light' : !cameraColorScheme.matches));
  document.documentElement.setAttribute('data-theme', light ? 'bento' : 'dusk');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = light ? '#f1e8dc' : '#12151f';
}
syncCameraTheme();
