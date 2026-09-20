# Calculadora de liquidación laboral — Perú

Calculadora de beneficios sociales al cese: CTS trunca, gratificación trunca,
vacaciones truncas y no gozadas, e indemnización por despido arbitrario.

Sitio estático, sin backend y sin build obligatorio: todo el cálculo ocurre en
el navegador del visitante. Va en `liquidacion.microtools.lat`, como sitio
independiente dentro del portafolio de [microtools.lat](https://microtools.lat).

## Poner en marcha

En Windows, doble clic en **`ver-sitio.bat`**. Desde la terminal:

```bash
node servidor.mjs --abrir  # sirve el sitio en :4175 y abre el navegador
node build/generar.mjs     # regenera HTML, sitemap, robots y netlify.toml
node test/engine.test.js   # los tres casos de cálculo resueltos a mano
```

El puerto es 4175: 4173 es el generador de QR y 4174 el sitio raíz, así que los
tres pueden estar levantados a la vez.

**No abras `index.html` con doble clic:** las rutas son absolutas y el navegador
bloquea los módulos ES sobre `file://`.

## Las constantes legales son el punto frágil

Están en `LEGAL_CONSTANTS_2026`, dentro de `js/engine.js`, cada una con su norma
anotada al lado. **Es el único sitio donde se tocan.** La página muestra los
valores que usó junto al resultado, y esa línea los lee del motor: no se puede
quedar anunciando una cifra distinta de la que calcula.

El build también lo vigila: si la asignación familiar deja de ser el 10 % de la
RMV, avisa. La Ley 25129 la define como ese 10 %, así que **al subir la RMV hay
que cambiar las dos**.

A septiembre de 2026 la RMV sigue en S/ 1 130 (D.S. N.° 006-2024-TR). Hay un alza
anunciada a S/ 1 300 sin decreto publicado: no se usa hasta que se oficialice.

## Estructura

```
index.html              la calculadora            (generada)
legal/                  aviso legal, privacidad, cookies (generadas)
sitemap.xml robots.txt manifest.webmanifest favicon.svg netlify.toml (generados)

data/sitio.json         textos editoriales y preguntas  ← se edita aquí
data/aplicacion.html    marcado del formulario y del resultado
build/generar.mjs       expande el JSON al sitio

css/app.css             sistema visual (tokens de microtools + componentes)

js/config.js            los valores de producción
js/engine.js            el cálculo: constantes legales y fórmulas
js/app.js               la interfaz del formulario y del resultado
js/pagina.js            marca, analítica, anuncios y la línea de valores usados
js/ads.js               carga diferida de los bloques de anuncio
js/vendor/              jsPDF (MIT, licencia incluida)

test/engine.test.js     tres casos resueltos a mano
docs/                   lógica de cálculo y especificación funcional
```

`data/aplicacion.html` y `js/app.js` **cambian juntos**: app.js se engancha por
`id` al marcado de ese archivo. Si renombras un campo en uno, hay que hacerlo en
el otro.

## Por qué el ads.txt no está aquí

Google lo busca en el **dominio raíz**. Como todos los subdominios de microtools
venden con el mismo ID de editor, el `ads.txt` de `microtools.lat` cubre también
a este. Vive en el repositorio `microtools-home`.

## Desplegar en Netlify

Sitio **nuevo**, distinto de los otros dos:

1. Sube esta carpeta a su propio repositorio.
2. Netlify: *Add new site → Import an existing project*.
3. Build command: `node build/generar.mjs` · Publish directory: `.`
4. *Domain management* → añade `liquidacion.microtools.lat`.

## Alcance: lo que no modela

Está documentado aquí a propósito, porque es lo que separa una estimación
honesta de una que aparenta más precisión de la que tiene:

- Récords vacacionales incompletos (reglas de días mínimos laborados).
- Personal de dirección y de confianza, en la indemnización vacacional.
- Regímenes laborales especiales y convenios colectivos con condiciones propias.
- Si un despido fue o no arbitrario: la herramienta calcula el monto suponiendo
  que lo fue, no lo califica.

`docs/logica-calculo-liquidacion.md` tiene el detalle de cada fórmula con su
base legal, y `docs/especificacion-funcional-calculadora-finiquito.md` el
alcance original.
