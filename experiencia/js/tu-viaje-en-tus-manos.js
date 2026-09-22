/* ============================================================
   BITAN JOURNEYS — Sección "Tu viaje, en tus manos"
   Revela los bloques conforme entran en pantalla.
   Sin dependencias. Seguro si el script carga antes o después del HTML.
   ============================================================ */
(function () {
  'use strict';

  function init() {
    var seccion = document.querySelector('.bj-viaje');
    if (!seccion) return;

    var bloques = seccion.querySelectorAll('.bj-reveal');
    if (!bloques.length) return;

    var sinMovimiento =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Sin IntersectionObserver (o con movimiento reducido): se muestra todo.
    if (sinMovimiento || !('IntersectionObserver' in window)) {
      for (var i = 0; i < bloques.length; i++) bloques[i].classList.add('is-in');
      return;
    }

    var observer = new IntersectionObserver(
      function (entradas) {
        entradas.forEach(function (entrada) {
          if (!entrada.isIntersecting) return;
          entrada.target.classList.add('is-in');
          observer.unobserve(entrada.target); // se anima una sola vez
        });
      },
      {
        // Dispara cuando el bloque ya subió un poco desde el borde inferior.
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.12
      }
    );

    for (var j = 0; j < bloques.length; j++) observer.observe(bloques[j]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
