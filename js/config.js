/* config.js — Los valores que cambian al poner este sitio en produccion.
 *
 * Esta es la calculadora de liquidacion, en su propio subdominio y su propio
 * repositorio. El ads.txt NO vive aqui: Google lo busca en el dominio raiz
 * (microtools.lat) y, al vender con el mismo ID de editor, cubre tambien este
 * subdominio.
 *
 *  1. dominio    — el dominio de este sitio, sin barra final.
 *  2. marca      — el nombre que aparece en la cabecera, el pie y los textos.
 *  3. adsense    — el ID de editor (ca-pub-...) y el ID de cada bloque.
 *  4. analitica  — el ID de medicion de GA4 (G-...).
 */

export const CONFIG = {
  dominio: 'https://liquidacion.microtools.lat',
  marca: 'microtools',
  correo: 'soporte.microtools.lat@gmail.com',

  adsense: {
    cliente: 'ca-pub-4794558545797945',
    bloques: {
      top: '',              // ID del bloque display horizontal
      resultado: '',        // ID del bloque 300x250 junto al resultado
      mid: '',              // ID del bloque in-article
      bottom: '',           // ID del bloque display inferior
    },
  },

  analitica: {
    ga4: '',                // 'G-XXXXXXXXXX'
  },
};

export const listoAdSense = () => Boolean(CONFIG.adsense.cliente);
export const listoAnalitica = () => Boolean(CONFIG.analitica.ga4);

export function urlAbsoluta(ruta) {
  const base = CONFIG.dominio || (typeof location !== 'undefined' ? location.origin : '');
  return base.replace(/\/$/, '') + ruta;
}

/** Escribe la marca y el correo en los elementos marcados. */
export function aplicarMarca(raiz = document) {
  for (const el of raiz.querySelectorAll('[data-marca]')) el.textContent = CONFIG.marca;
  for (const el of raiz.querySelectorAll('[data-correo]')) {
    if (!CONFIG.correo) { el.closest('[data-correo-bloque]')?.remove(); continue; }
    el.textContent = CONFIG.correo;
    if (el.tagName === 'A') el.href = 'mailto:' + CONFIG.correo;
  }
}
