/* pagina.js — Lo que rodea a la calculadora.
 *
 * El calculo vive en engine.js y la interfaz en app.js, que son scripts
 * clasicos y no saben nada del sitio. Aqui va lo del sitio: la marca, la
 * analitica, los anuncios y la linea de valores legales bajo el resultado.
 */

import { CONFIG, listoAnalitica, aplicarMarca } from './config.js';
import { iniciarPublicidad, montarBloque } from './ads.js';

function cargarAnalitica() {
  if (!listoAnalitica()) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', CONFIG.analitica.ga4);

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${CONFIG.analitica.ga4}`;
  document.head.appendChild(s);
}

/* Con que cifras se calculo. Se lee del motor, no se escribe a mano: si manana
   sube la RMV y solo se toca engine.js, esta linea cambia sola y no puede
   quedarse anunciando un valor que ya no se usa. */
function pintarValoresUsados() {
  const c = window.LiquidacionEngine?.LEGAL_CONSTANTS_2026 || null;
  const resultado = document.getElementById('resultado');
  if (!resultado || !c || !c.RMV) return;

  const disclaimer = resultado.querySelector('.disclaimer');
  if (!disclaimer || resultado.querySelector('.valores-usados')) return;

  const p = document.createElement('p');
  p.className = 'valores-usados';
  p.innerHTML = 'Calculado con los valores vigentes: RMV <b>S/ '
    + c.RMV.toLocaleString('es-PE') + '</b>, asignación familiar <b>S/ '
    + c.ASIGNACION_FAMILIAR.toLocaleString('es-PE') + '</b>, bonificación extraordinaria <b>'
    + (c.BONO_EXTRAORDINARIO_ESSALUD * 100).toFixed(0) + ' %</b> (EsSalud) o <b>'
    + (c.BONO_EXTRAORDINARIO_EPS * 100).toFixed(2).replace('.', ',') + ' %</b> (EPS).';
  disclaimer.before(p);
}

/* El bloque junto al resultado no existe hasta que hay resultado: se monta
   cuando la seccion deja de estar oculta, no al cargar la pagina. */
function publicidadDelResultado() {
  const resultado = document.getElementById('resultado');
  if (!resultado) return;

  const observador = new MutationObserver(() => {
    if (resultado.hasAttribute('hidden')) return;
    pintarValoresUsados();

    if (!resultado.querySelector('[data-slot="resultado"]')) {
      const hueco = document.createElement('div');
      hueco.className = 'ad-slot ad-slot--resultado';
      hueco.dataset.slot = 'resultado';
      resultado.querySelector('.disclaimer')?.before(hueco);
      montarBloque(hueco);
    }

    window.gtag?.('event', 'liquidacion_calculada');
  });

  observador.observe(resultado, { attributes: true, attributeFilter: ['hidden'] });
}

export function init() {
  aplicarMarca();
  cargarAnalitica();
  publicidadDelResultado();
  iniciarPublicidad();
}
