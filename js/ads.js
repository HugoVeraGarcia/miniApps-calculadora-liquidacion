/* ads.js — Carga de la publicidad.
 *
 * Reglas que este módulo garantiza:
 *  - El script de AdSense se inyecta en el evento load, nunca bloqueando.
 *  - Cada hueco reserva su altura por CSS antes de que llegue el anuncio,
 *    así el CLS no se mueve.
 *  - Un bloque se rellena una sola vez. No hay refresco por temporizador.
 *  - Si no hay ID de editor configurado, los huecos se retiran del DOM.
 */

import { CONFIG, listoAdSense } from './config.js';

let scriptPedido = false;
const rellenados = new WeakSet();

function inyectarScript() {
  if (scriptPedido || !listoAdSense()) return;
  scriptPedido = true;
  // El HTML generado ya trae el script en la cabecera, para que el robot de
  // verificacion de AdSense lo vea sin ejecutar JavaScript. Si esta, no se
  // duplica: dos cargas del mismo script dan errores en consola.
  if (document.querySelector('script[src*="adsbygoogle.js"]')) return;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CONFIG.adsense.cliente}`;
  document.head.appendChild(s);
}

/**
 * Rellena un hueco. El elemento debe tener data-slot con la clave del bloque
 * (top, mid, bottom, descarga).
 */
export function montarBloque(hueco) {
  if (!hueco || rellenados.has(hueco)) return;
  const clave = hueco.dataset.slot;
  const idBloque = CONFIG.adsense.bloques[clave];

  if (!listoAdSense() || !idBloque) {
    hueco.remove();                       // sin ID no dejamos un hueco vacío
    return;
  }

  rellenados.add(hueco);
  inyectarScript();

  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.dataset.adClient = CONFIG.adsense.cliente;
  ins.dataset.adSlot = idBloque;

  if (clave === 'descarga') {
    ins.style.width = '300px';
    ins.style.height = '250px';
    ins.style.margin = '0 auto';
  } else if (clave === 'mid') {
    ins.dataset.adFormat = 'fluid';
    ins.dataset.adLayout = 'in-article';
  } else {
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'true';
  }

  hueco.appendChild(ins);
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) {
    hueco.remove();
  }
}

/** Monta todos los huecos presentes en el documento (o en un subárbol). */
export function montarBloques(raiz = document) {
  for (const hueco of raiz.querySelectorAll('.ad-slot')) montarBloque(hueco);
}

/** Arranca la publicidad una vez la página ya es usable. */
export function iniciarPublicidad() {
  const arrancar = () => montarBloques();
  if (document.readyState === 'complete') setTimeout(arrancar, 0);
  else window.addEventListener('load', arrancar, { once: true });
}
