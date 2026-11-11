/* ════════════════════════════════════════════════════════════════
   OptiCore — Esquema claro/oscuro
   Sigue el modo del navegador (prefers-color-scheme) y permite
   forzarlo manualmente con el botón 🖥️ de la cabecera.

   · El atributo html[data-scheme="light"|"dark"] lo pinta el CSS
     (hay un script inline en <head> que lo fijan antes de pintar).
   · La preferencia del usuario se guarda en localStorage con la
     clave 'opticore-scheme': 'auto' | 'light' | 'dark'.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const KEY = 'opticore-scheme';
  const ORDER = ['auto', 'light', 'dark'];
  const ICONS = { auto: '🖥️', light: '☀️', dark: '🌙' };
  const mql = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')) || null;

  function readPref() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; }
  }

  /* Esquema efectivo: lo que diga el usuario, o lo que use el navegador */
  function effective(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    return (mql && mql.matches) ? 'dark' : 'light';
  }

  function apply() {
    const pref = readPref();
    const eff = effective(pref);
    document.documentElement.dataset.scheme = eff;

    const btn = document.getElementById('btn-scheme');
    if (btn) {
      btn.textContent = ICONS[pref] || ICONS.auto;
      btn.title = pref === 'auto'
        ? ('Tema automático (' + (eff === 'dark' ? 'oscuro' : 'claro') + '). Clic: forzar claro')
        : (pref === 'dark'
          ? 'Tema oscuro. Clic: volver al automático'
          : 'Tema claro. Clic: pasar al oscuro');
    }

    /* Avisar a las gráficas (canvas) para que redibujen con los
       nuevos colores del esquema */
    try {
      window.dispatchEvent(new CustomEvent('opticore:schemechange', { detail: { scheme: eff, pref: pref } }));
    } catch (e) { /* navegadores sin CustomEvent: el CSS ya cambió igual */ }
  }

  /* Botón 🖥️: auto → claro → oscuro → auto … */
  function cycle() {
    const cur = readPref();
    const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
    try { localStorage.setItem(KEY, next); } catch (e) { /* sin almacenamiento */ }
    apply();
    return next;
  }

  /* Seguir al navegador EN VIVO mientras la preferencia sea "auto" */
  if (mql) {
    const onChange = () => { if (readPref() === 'auto') apply(); };
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else if (mql.addListener) mql.addListener(onChange); /* Safari antiguo */
  }

  window.OptiCoreScheme = { cycle: cycle, apply: apply };
  apply();
})();
