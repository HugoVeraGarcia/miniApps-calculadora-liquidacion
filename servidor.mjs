/* servidor.mjs — Servidor local para ver la calculadora mientras se desarrolla.
 *
 *   node servidor.mjs
 *
 * Hace falta porque el sitio usa rutas absolutas (/css/app.css) y módulos ES:
 * abriendo index.html con doble clic, el navegador busca el CSS en la raíz del
 * disco y bloquea los módulos por seguridad. En Netlify no pasa: allí la raíz
 * del sitio es esta misma carpeta.
 *
 * Sin dependencias: solo Node.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)));
const PUERTO = Number(process.env.PUERTO) || 4175;
const ABRIR = process.argv.includes('--abrir');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.3mf': 'model/3mf',
  '.stl': 'model/stl',
};

const servidor = createServer(async (req, res) => {
  const ruta = decodeURIComponent(req.url.split('?')[0]);

  // Nada fuera de la carpeta del proyecto.
  let archivo = join(RAIZ, normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
  if (!archivo.startsWith(RAIZ)) {
    res.writeHead(403).end('403');
    return;
  }

  try {
    const info = await stat(archivo).catch(() => null);
    if (!info || info.isDirectory()) archivo = join(archivo, 'index.html');
    const datos = await readFile(archivo);
    res.writeHead(200, {
      'content-type': TIPOS[extname(archivo)] || 'application/octet-stream',
      'cache-control': 'no-store',          // en desarrollo, siempre fresco
    });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><p>404 &mdash; no existe <code>'
      + ruta.replace(/[<>&]/g, '') + '</code>');
  }
});

/** Abre la URL en el navegador por defecto del sistema. */
function abrirNavegador(url) {
  const orden = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    spawn(orden[0], orden[1], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* si no se puede abrir, el enlace ya está impreso en pantalla */
  }
}

/* El aviso de arranque se registra UNA sola vez y lee el puerto real: si se
   pasara como callback de listen(), cada reintento dejaría un aviso viejo
   colgado y se anunciaría un puerto que no es el que quedó escuchando. */
servidor.on('listening', () => {
  const { port } = servidor.address();
  const url = `http://localhost:${port}/`;
  console.log(`\n  Sitio servido en  ${url}`);
  console.log(`  Carpeta           ${RAIZ}`);
  console.log('\n  Páginas:');
  console.log(`    ${url}`);
  console.log(`    ${url}qr-wifi/`);
  console.log(`    ${url}qr-3d/llavero/`);
  console.log('\n  Deja esta ventana abierta. Ctrl+C para parar.\n');
  if (ABRIR) abrirNavegador(url);
});

/** Si el puerto está ocupado, prueba el siguiente en vez de morir. */
function arrancar(puerto, intentos = 12) {
  servidor.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && intentos > 0) {
      console.log(`  El puerto ${puerto} está ocupado, probando el ${puerto + 1}…`);
      arrancar(puerto + 1, intentos - 1);
      return;
    }
    console.error('\n  No se ha podido arrancar el servidor:', e.message, '\n');
    process.exit(1);
  });
  servidor.listen(puerto, '127.0.0.1');
}

arrancar(PUERTO);
