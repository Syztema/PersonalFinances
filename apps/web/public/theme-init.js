// Aplica el tema guardado antes del primer pintado (la CSP no permite scripts en línea).
(function () {
  var theme;
  try {
    theme = localStorage.getItem('fz:theme');
  } catch {
    // sin almacenamiento: se usa el tema por defecto
  }
  if (theme !== 'LIGHT' && theme !== 'SYSTEM') theme = 'DARK';
  var dark =
    theme === 'DARK' ||
    (theme === 'SYSTEM' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b1016' : '#f5f6f8');
})();
