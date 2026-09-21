#!/usr/bin/env node
/* generar.mjs — Expande data/sitio.json a las paginas de la calculadora.
 *
 * Salida: index.html, las tres paginas legales, sitemap.xml, robots.txt,
 * manifest.webmanifest, favicon.svg y netlify.toml.
 *
 * No genera ads.txt: Google lo busca en el dominio raiz (microtools.lat) y,
 * con el mismo ID de editor, cubre este subdominio.
 *
 * El marcado del formulario y del resultado vive en data/aplicacion.html y se
 * inserta tal cual: js/app.js se engancha a esos id, asi que ese archivo y el
 * codigo de la aplicacion tienen que cambiar juntos.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const datos = JSON.parse(readFileSync(join(RAIZ, 'data', 'sitio.json'), 'utf8'));
const APLICACION = readFileSync(join(RAIZ, 'data', 'aplicacion.html'), 'utf8');

const configJs = readFileSync(join(RAIZ, 'js', 'config.js'), 'utf8');
const leerConfig = (clave) => (configJs.match(new RegExp(`${clave}:\\s*'([^']*)'`)) || [])[1] || '';
const DOMINIO = leerConfig('dominio').replace(/\/$/, '');
const MARCA = leerConfig('marca') || 'microtools';

/* El sitio raiz del portafolio. Esta herramienta es una de varias, y desde
   aqui se tiene que poder volver al indice: la marca de la cabecera lleva
   alli y el nombre de la app lleva a la portada de esta herramienta. */
const HUB = 'https://microtools.lat/';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (ruta) => (DOMINIO ? DOMINIO + ruta : ruta);
const avisos = [];

/* Las constantes legales se leen del propio motor: asi la pagina no puede
   anunciar una cifra distinta de la que usa para calcular. */
const engineJs = readFileSync(join(RAIZ, 'js', 'engine.js'), 'utf8');
const leerConstante = (clave) => {
  const m = engineJs.match(new RegExp(`${clave}:\\s*([0-9.]+)`));
  return m ? Number(m[1]) : null;
};
const RMV = leerConstante('RMV');
const ASIGNACION = leerConstante('ASIGNACION_FAMILIAR');

if (RMV === null || ASIGNACION === null) {
  console.error('ERROR: no se han podido leer las constantes legales de js/engine.js.');
  process.exit(1);
}
if (Math.round(RMV * 0.10) !== Math.round(ASIGNACION)) {
  avisos.push(`La asignación familiar (S/ ${ASIGNACION}) no es el 10 % de la RMV (S/ ${RMV}). `
    + 'La Ley 25129 la define como ese 10 %: al subir la RMV hay que actualizar las dos.');
}

/* ---------- iconos ---------- */

const ICONO_CANDADO = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"'
  + ' stroke="currentColor" stroke-width="1.6" stroke-linecap="round"'
  + ' stroke-linejoin="round" aria-hidden="true" focusable="false">'
  + '<rect x="3" y="7" width="10" height="6.6" rx="1.4"/>'
  + '<path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/></svg>';

/* ---------- piezas comunes ---------- */

const NAV = [
  ['/', 'Calculadora'],
  [HUB, 'Más herramientas'],
];

function cabecera(rutaActual) {
  const enlaces = NAV.map(([r, t]) => {
    const externo = r.startsWith('http');
    const actual = !externo && r === rutaActual ? ' aria-current="page"' : '';
    return `<a href="${r}"${actual}${externo ? ' rel="noopener"' : ''}>${esc(t)}</a>`;
  }).join('\n    ');

  return `<header class="cabecera"><div class="contenedor cabecera__fila">
  <div class="logo">
    <a class="logo__marca" href="${HUB}" data-pista="Ir a microtools, el sitio donde están todas las herramientas."><span data-marca>${esc(MARCA)}</span></a>
    <span class="logo__sep" aria-hidden="true">/</span>
    <a class="logo__app" href="/" data-pista="Volver a la portada de la calculadora de liquidación.">Liquidaci&oacute;n</a>
  </div>
  <nav class="nav" aria-label="Principal">
    ${enlaces}
  </nav>
</div></header>`;
}

function pie() {
  return `<footer class="pie"><div class="contenedor">
  <div class="pie__enlaces">
    <a href="${HUB}" rel="noopener">M&aacute;s herramientas</a>
    ${datos.legales.map((l) => `<a href="${l.ruta}">${esc(l.titulo)}</a>`).join('\n    ')}
  </div>
  <p>C&aacute;lculo referencial, no sustituye asesor&iacute;a legal. El c&aacute;lculo ocurre en tu navegador: nada de lo que escribes se env&iacute;a a ning&uacute;n servidor.</p>
  <p>&copy; ${new Date().getFullYear()} <span data-marca>${esc(MARCA)}</span> &middot; ${esc(datos.sitio.pais)}</p>
</div></footer>`;
}

function huecoAnuncio(clave) {
  return `<div class="ad-slot ad-slot--${clave}" data-slot="${clave}"></div>`;
}

/* ---------- datos estructurados ---------- */

function datosEstructurados() {
  const s = datos.sitio;
  const bloques = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: s.metaTitulo,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Cualquiera con navegador web',
      description: s.metaDescripcion,
      inLanguage: s.idioma,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'PEN' },
      ...(DOMINIO ? { url: abs('/') } : {}),
    },
  ];

  if (datos.faq?.length) {
    bloques.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: datos.faq.map(([p, r]) => ({
        '@type': 'Question',
        name: p,
        acceptedAnswer: { '@type': 'Answer', text: r },
      })),
    });
  }

  return bloques
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join('\n');
}

/* ---------- pagina principal ---------- */

function paginaIndice() {
  const s = datos.sitio;

  return `<!doctype html>
<html lang="${s.idioma}-PE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.metaTitulo)}</title>
<meta name="description" content="${esc(s.metaDescripcion)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
${DOMINIO ? `<link rel="canonical" href="${abs('/')}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(s.metaTitulo)}">
<meta property="og:description" content="${esc(s.metaDescripcion)}">
<meta property="og:locale" content="es_PE">
<meta property="og:site_name" content="${esc(MARCA)}">
${DOMINIO ? `<meta property="og:url" content="${abs('/')}">` : ''}
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
<link rel="stylesheet" href="/css/app.css">
${datosEstructurados()}
</head>
<body>
<a class="salto-contenido" href="#contenido">Ir al contenido</a>
${cabecera('/')}
<main id="contenido">
<div class="contenedor">

  <div class="entrada">
    <h1>${esc(s.h1)}</h1>
    ${s.entrada.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}
  </div>

  <p class="privacidad-nota">${ICONO_CANDADO}<span>Todo el c&aacute;lculo ocurre en tu navegador: tus fechas y tu sueldo no salen de tu dispositivo.</span></p>

  ${huecoAnuncio('top')}

${APLICACION}
  ${huecoAnuncio('mid')}

  <div class="articulo">
${datos.secciones.map((sec) => `    <h2>${esc(sec.h2)}</h2>\n`
    + sec.parrafos.map((p) => `    <p>${esc(p)}</p>`).join('\n')).join('\n')}
  </div>

  <section class="faq" aria-labelledby="preguntas">
    <h2 id="preguntas">Preguntas frecuentes</h2>
${datos.faq.map(([p, r]) => `    <details class="faq__item">
      <summary>${esc(p)}</summary>
      <p>${esc(r)}</p>
    </details>`).join('\n')}
  </section>

  ${huecoAnuncio('bottom')}

</div>
</main>
${pie()}

<script src="/js/vendor/jspdf.umd.min.js"></script>
<script src="/js/engine.js"></script>
<script src="/js/app.js"></script>
<script type="module">
  import { init } from '/js/pagina.js';
  init();
</script>
</body>
</html>
`;
}

/* ---------- paginas legales ---------- */

const TEXTOS_LEGALES = {
  'Aviso legal': `
<h2>Titular del sitio</h2>
<p>El titular de este sitio web y de los subdominios de <span data-marca></span> es una persona natural domiciliada en Lima, Per&uacute;.</p>
<p data-correo-bloque>Para cualquier comunicaci&oacute;n: <a data-correo href="#"></a>.</p>
<h2>Objeto</h2>
<p>Este sitio ofrece una calculadora gratuita de liquidaci&oacute;n de beneficios sociales conforme a la normativa laboral peruana. No requiere registro y se ejecuta &iacute;ntegramente en el navegador del usuario.</p>
<h2>Naturaleza del c&aacute;lculo: no es asesor&iacute;a legal</h2>
<p>El resultado que entrega esta herramienta es una <b>estimaci&oacute;n referencial</b> y no constituye asesor&iacute;a legal, laboral, contable ni tributaria, ni crea relaci&oacute;n profesional alguna entre el usuario y el titular.</p>
<p>El c&aacute;lculo depende por completo de los datos que introduce el usuario y de supuestos generales. No contempla todas las situaciones posibles —entre otras, r&eacute;cords vacacionales incompletos, personal de direcci&oacute;n y de confianza, reg&iacute;menes laborales especiales o convenios colectivos con condiciones propias— y no determina si un despido fue o no arbitrario, calificaci&oacute;n que corresponde exclusivamente a la autoridad competente.</p>
<p>Ante una decisi&oacute;n con consecuencias econ&oacute;micas o un conflicto laboral, consulte a un abogado laboralista. El titular no se responsabiliza de las decisiones que se tomen a partir de los resultados obtenidos.</p>
<h2>Vigencia de los valores legales</h2>
<p>La herramienta emplea las constantes legales vigentes a la fecha de su &uacute;ltima actualizaci&oacute;n, indicadas junto al resultado. La normativa laboral cambia; el titular procura mantenerlas al d&iacute;a pero no garantiza que reflejen en todo momento la &uacute;ltima modificaci&oacute;n publicada.</p>
<h2>Propiedad intelectual</h2>
<p>El c&oacute;digo fuente, los textos y el dise&ntilde;o de este sitio pertenecen al titular. Las librer&iacute;as de terceros incluidas conservan su propia licencia, indicada junto a sus archivos.</p>
<h2>Legislaci&oacute;n aplicable</h2>
<p>Este sitio se rige por la legislaci&oacute;n de la Rep&uacute;blica del Per&uacute;. Cualquier controversia derivada de su uso se someter&aacute; a los jueces y tribunales de Lima, Per&uacute;.</p>`,

  'Política de privacidad': `
<h2>Qu&eacute; datos tratamos</h2>
<p>Este sitio no tiene servidor de aplicaci&oacute;n propio ni base de datos. Las fechas, el sueldo y el resto de datos que introduces en la calculadora se procesan &iacute;ntegramente en tu navegador y <b>no se transmiten a ning&uacute;n servidor nuestro</b>.</p>
<p>Puedes comprobarlo de la forma m&aacute;s directa: carga la p&aacute;gina, desconecta internet y sigue us&aacute;ndola.</p>
<p>El PDF del resultado tambi&eacute;n se genera en tu equipo, con una librer&iacute;a alojada en este mismo sitio. Descargarlo no env&iacute;a tus datos a ninguna parte.</p>
<h2>Almacenamiento en tu navegador</h2>
<p>La calculadora no guarda tus datos entre visitas. Si cierras la pesta&ntilde;a sin descargar el PDF, el resultado se pierde.</p>
<h2>Publicidad</h2>
<p>Este sitio se financia con publicidad servida por Google AdSense. Google y sus proveedores pueden usar cookies e identificadores de publicidad para mostrar anuncios basados en tus visitas anteriores a este u otros sitios web. Los datos que introduces en la calculadora no se comparten con Google ni con nadie, porque no salen de tu navegador.</p>
<p>Puedes configurar o desactivar la publicidad personalizada en los <a href="https://myadcenter.google.com/" rel="nofollow noopener" target="_blank">ajustes de anuncios de Google</a>, y consultar c&oacute;mo Google trata estos datos en su <a href="https://policies.google.com/technologies/partner-sites" rel="nofollow noopener" target="_blank">p&aacute;gina de sitios asociados</a>. Si te encuentras en un pa&iacute;s cuya normativa lo exige, Google mostrar&aacute; su propio aviso de consentimiento antes de personalizar los anuncios.</p>
<h2>Anal&iacute;tica</h2>
<p>Usamos Google Analytics 4 para saber qu&eacute; p&aacute;ginas se visitan y en qu&eacute; proporci&oacute;n, de forma agregada. Esos datos no se cruzan con lo que calculas, porque ese contenido nunca llega a nosotros.</p>
<h2>Alojamiento</h2>
<p>El sitio est&aacute; alojado en Netlify, que como cualquier servidor web registra las peticiones que recibe —direcci&oacute;n IP, fecha, p&aacute;gina solicitada y navegador— con fines de seguridad y funcionamiento. Esos registros son de Netlify; nosotros no los explotamos.</p>
<h2>Tus derechos</h2>
<p>La Ley N.&deg; 29733 de Protecci&oacute;n de Datos Personales del Per&uacute; te reconoce los derechos de informaci&oacute;n, acceso, actualizaci&oacute;n, inclusi&oacute;n, rectificaci&oacute;n, supresi&oacute;n y oposici&oacute;n sobre tus datos personales. Como este sitio no recoge datos identificativos, en la pr&aacute;ctica el control se ejerce desde los ajustes de tu navegador y desde los ajustes de anuncios de Google.</p>
<p data-correo-bloque>Si crees que alguna funci&oacute;n del sitio trata datos tuyos y quieres ejercer alg&uacute;n derecho, escribe a <a data-correo href="#"></a>.</p>
<h2>Menores de edad</h2>
<p>Esta herramienta no est&aacute; dirigida a menores de 14 a&ntilde;os ni recoge deliberadamente informaci&oacute;n sobre ellos.</p>`,

  'Política de cookies': `
<h2>Qu&eacute; es una cookie</h2>
<p>Una cookie es un peque&ntilde;o archivo que un sitio web guarda en tu navegador para recordar informaci&oacute;n entre visitas.</p>
<h2>Qu&eacute; usa este sitio</h2>
<p><b>La calculadora, ninguna.</b> No necesita cookies para funcionar y no guarda tus datos entre visitas.</p>
<p><b>Cookies publicitarias.</b> Google AdSense instala cookies para mostrar anuncios y medir su rendimiento. Si no has dado tu consentimiento —en los pa&iacute;ses donde Google lo solicita mediante su propio aviso—, los anuncios que ver&aacute;s ser&aacute;n no personalizados.</p>
<p><b>Cookies anal&iacute;ticas.</b> Google Analytics 4 instala cookies para medir el tr&aacute;fico de forma agregada.</p>
<h2>Qui&eacute;n las instala y cu&aacute;nto duran</h2>
<p>Las cookies publicitarias y anal&iacute;ticas son <b>de terceros</b>: las instala Google desde sus propios dominios, no nosotros, y es Google quien fija su duraci&oacute;n y su finalidad. Nosotros no las leemos ni tenemos acceso a lo que contienen.</p>
<p>Puedes ver exactamente cu&aacute;les se han instalado en tu navegador y cu&aacute;ndo caducan: en Chrome o Edge, pulsa F12, abre la pesta&ntilde;a <i>Application</i> y busca <i>Cookies</i>; en Firefox, la pesta&ntilde;a <i>Almacenamiento</i>.</p>
<h2>C&oacute;mo gestionarlas</h2>
<p>Puedes revisar y cambiar tu configuraci&oacute;n de anuncios personalizados en los <a href="https://myadcenter.google.com/" rel="nofollow noopener" target="_blank">ajustes de anuncios de Google</a>, y bloquear o borrar cookies desde los ajustes de tu navegador.</p>
<p>Si usas un bloqueador de anuncios, este sitio seguir&aacute; funcionando igual. No hay muro, ni aviso pidi&eacute;ndote que lo desactives, ni funciones reservadas a quien acepta los anuncios: la calculadora es la misma en los dos casos.</p>
<p>Bloquearlas todas no afecta al funcionamiento de la calculadora: no las necesita para calcular.</p>`,
};

function paginaLegal(l) {
  return `<!doctype html>
<html lang="${datos.sitio.idioma}-PE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(l.titulo)} — ${esc(MARCA)}</title>
<meta name="description" content="${esc(l.titulo)} de la calculadora de liquidación de ${esc(MARCA)}.">
${DOMINIO ? `<link rel="canonical" href="${abs(l.ruta)}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/app.css">
</head>
<body>
<a class="salto-contenido" href="#contenido">Ir al contenido</a>
${cabecera(l.ruta)}
<main id="contenido"><div class="contenedor estrecho">
  <div class="entrada"><h1>${esc(l.titulo)}</h1></div>
  <div class="articulo">${TEXTOS_LEGALES[l.titulo]}</div>
</div></main>
${pie()}
<script type="module">
  import { aplicarMarca } from '/js/config.js';
  aplicarMarca();
</script>
</body>
</html>
`;
}

/* ---------- archivos de raiz ---------- */

function sitemap() {
  const hoy = new Date().toISOString().slice(0, 10);
  const entrada = (ruta, prioridad, frecuencia) => `  <url>
    <loc>${abs(ruta)}</loc>
    <lastmod>${hoy}</lastmod>
    <changefreq>${frecuencia}</changefreq>
    <priority>${prioridad}</priority>
  </url>`;

  // Las legales entran en el sitemap aunque nadie las busque. Quien revisa el
  // sitio —AdSense sobre todo— espera encontrar la politica de privacidad
  // indexada, no solo enlazada en el pie. Prioridad baja y cambio anual, que
  // es lo que de verdad son.
  const urls = [
    entrada('/', '1.0', 'monthly'),
    ...datos.legales.map((l) => entrada(l.ruta, '0.3', 'yearly')),
  ].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function robots() {
  return `User-agent: *
Allow: /

${DOMINIO ? `Sitemap: ${abs('/sitemap.xml')}` : '# Sitemap: se añade al fijar el dominio en js/config.js'}
`;
}

function manifest() {
  return JSON.stringify({
    name: 'Calculadora de liquidación — ' + MARCA,
    short_name: 'Liquidación',
    start_url: '/',
    display: 'browser',
    background_color: '#FFFFFF',
    theme_color: '#C2410C',
    lang: datos.sitio.idioma,
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }, null, 2) + '\n';
}

function favicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#C2410C"/>
  <g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
    <rect x="9" y="7" width="14" height="18" rx="2.5"/>
    <path d="M12.5 12h7"/>
    <path d="M12.5 17h0M16 17h0M19.5 17h0M12.5 21h0M16 21h0M19.5 21h0"/>
  </g>
</svg>
`;
}

function netlifyToml() {
  return `# Generado por build/generar.mjs

[build]
  command = "node build/generar.mjs"
  publish = "."

[[headers]]
  for = "/css/*"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
  for = "/js/*"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

# Libreria de terceros con version fija: puede cachearse sin miedo.
[[headers]]
  for = "/js/vendor/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
`;
}

/* ---------- escritura ---------- */

function escribir(ruta, contenido) {
  const destino = join(RAIZ, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, contenido, 'utf8');
  return ruta;
}

const escritos = [];

escritos.push(escribir('index.html', paginaIndice()));
for (const l of datos.legales) escritos.push(escribir(l.archivo, paginaLegal(l)));
escritos.push(escribir('sitemap.xml', sitemap()));
escritos.push(escribir('robots.txt', robots()));
escritos.push(escribir('manifest.webmanifest', manifest()));
escritos.push(escribir('favicon.svg', favicon()));
escritos.push(escribir('netlify.toml', netlifyToml()));

/* ---------- comprobaciones ---------- */

const palabras = [
  ...datos.sitio.entrada,
  ...datos.secciones.flatMap((s) => [s.h2, ...s.parrafos]),
  ...datos.faq.flat(),
].join(' ').trim().split(/\s+/).length;

if (palabras < 500) {
  avisos.push(`El contenido editorial tiene ${palabras} palabras: por debajo de 500 AdSense trata la página como una herramienta sin contenido.`);
}
if (!DOMINIO) avisos.push('No hay dominio en js/config.js: sin canonical, sin og:url y sin Sitemap en robots.txt.');
if (!leerConfig('cliente')) avisos.push('No hay ID de editor de AdSense en js/config.js: los huecos de anuncio se retiran solos.');
if (!leerConfig('ga4')) avisos.push('No hay ID de GA4 en js/config.js: no se carga analítica.');

console.log(`Generadas ${escritos.length} rutas:`);
for (const r of escritos) console.log('  ' + r);
console.log(`\nContenido editorial: ${palabras} palabras.`);
console.log(`Constantes legales del motor: RMV S/ ${RMV} · asignación familiar S/ ${ASIGNACION}.`);

if (avisos.length) {
  console.log('\nPendiente antes de publicar:');
  for (const a of avisos) console.log('  - ' + a);
}
