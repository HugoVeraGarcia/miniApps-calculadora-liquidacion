# Especificación funcional — Calculadora de Liquidación Laboral (Perú)

## 1. Objetivo del producto

Herramienta web gratuita que permite a cualquier trabajador en Perú calcular, en menos de 2 minutos y sin registrarse, cuánto le corresponde recibir al terminar su relación laboral: CTS, gratificación trunca, vacaciones truncas e indemnización por despido arbitrario (si aplica). Genera un desglose claro y un PDF descargable con el resultado.

**Modelo de negocio:** tráfico orgánico (SEO) monetizado con Google AdSense, sin login ni backend con datos del usuario.

**Diferenciador:** no existe una calculadora de liquidación laboral peruana actualizada, gratuita y sin registro con esta cobertura completa (CTS + gratificación + vacaciones + indemnización en un solo flujo). Arquitectura pensada para replicarse luego a México y Colombia sin rehacer el producto desde cero.

---

## 2. Público objetivo

- Trabajador peruano en planilla (régimen general de la actividad privada) que renuncia, es despedido o negocia su salida.
- Áreas de RR.HH. de pequeñas empresas que quieren validar un cálculo rápido.
- Búsqueda típica en Google: "calculadora de liquidación Perú", "cuánto me corresponde de CTS", "cómo calcular mi gratificación trunca", "indemnización por despido arbitrario Perú calculadora".

No cubre (fuera de alcance v1): régimen agrario, construcción civil, microempresa (régimen MYPE con beneficios reducidos), trabajadores del hogar, sector público.

---

## 3. Alcance funcional — módulos de cálculo

### 3.1 Datos de entrada comunes (un solo formulario, sin pasos separados)
- Fecha de ingreso a la empresa
- Fecha de salida / cese (o fecha estimada, si aún no se define)
- Remuneración mensual bruta (sueldo básico)
- ¿Recibe asignación familiar? (S/ 102.50 vigente — configurable como constante)
- ¿Tiene comisiones o remuneración variable? → si sí, pedir promedio de los últimos 6 meses
- Motivo de cese: (a) renuncia voluntaria, (b) despido arbitrario, (c) mutuo disenso, (d) fin de contrato a plazo fijo, (e) despido justificado
- Tipo de contrato: indeterminado / plazo fijo

### 3.2 Cálculo de CTS (Compensación por Tiempo de Servicios)
- Fórmula: (Remuneración computable ÷ 12) × meses completos trabajados en el semestre + (Remuneración computable ÷ 360) × días trabajados en el semestre
- Remuneración computable = sueldo básico + 1/6 de gratificación (si corresponde) + asignación familiar
- Depositado en mayo y noviembre; si el cese es a mitad de semestre, calcular CTS trunca proporcional
- Mostrar el resultado separado: "CTS ya depositada" (informativo) vs "CTS trunca pendiente de pago"

### 3.3 Gratificación trunca
- Aplica si el trabajador cesa antes de julio o antes de diciembre (los meses en que se paga gratificación regular)
- Fórmula: (Remuneración computable ÷ 6) × meses completos trabajados en el semestre en curso
- Incluir bonificación extraordinaria del 9% (equivalente a la ex-EsSalud) sobre el monto de gratificación trunca

### 3.4 Vacaciones truncas
- Fórmula: (Remuneración ÷ 12) × meses completos trabajados desde el último periodo vacacional completo, + proporcional de días si aplica
- Diferenciar: vacaciones no gozadas del periodo ya cumplido (con doble remuneración si corresponde por ley) vs vacaciones truncas del periodo en curso

### 3.5 Indemnización por despido arbitrario (solo si motivo de cese = "despido arbitrario")
- Contrato indeterminado: 1.5 remuneraciones por año completo de servicios + fracción de meses (tope de 12 remuneraciones)
- Contrato a plazo fijo: 1.5 remuneraciones por cada mes que falte para concluir el contrato (tope de 12 remuneraciones)
- Mostrar advertencia legal: esto es un estimado, no reemplaza asesoría de un abogado laboralista

### 3.6 Resultado final
- Tabla resumen con cada concepto y su monto
- Total general
- Botón "Descargar PDF" con el desglose completo, fecha de cálculo y disclaimer legal
- Sección "¿Qué significa cada concepto?" (acordeón/colapsable, contenido educativo para SEO)

---

## 4. Estructura de páginas (SEO programático)

Cada calculadora vive en su propia URL para captar búsquedas específicas, todas reutilizando el mismo componente de cálculo con distinta configuración de "qué mostrar primero":

- `/calculadora-liquidacion-peru` → página principal, las 4 en una
- `/calculadora-cts-peru` → enfocada solo en CTS (mismo motor, oculta lo demás por defecto)
- `/calculadora-gratificacion-peru`
- `/calculadora-vacaciones-truncas-peru`
- `/calculadora-indemnizacion-despido-arbitrario-peru`
- `/blog/como-se-calcula-la-cts-en-peru-2026` (contenido de soporte SEO, opcional v2)

Cada página con: título H1 único, meta description única, texto explicativo de 300-500 palabras antes o después de la calculadora (para no ser "thin content" ante Google), y misma calculadora embebida.

---

## 5. Requisitos no funcionales

- **100% client-side**: todo el cálculo ocurre en el navegador del usuario (JavaScript puro o framework ligero), sin backend ni base de datos, sin envío de datos personales a ningún servidor.
- **Sin login, sin cookies de tracking propias** (solo las que ponga AdSense).
- **Generación de PDF en el cliente** (librería tipo jsPDF), sin pasar por servidor.
- **Responsive**, mobile-first (la mayoría del tráfico de búsquedas legales en Perú es móvil).
- **Velocidad de carga**: Core Web Vitals en verde (afecta directamente el SEO y por ende el modelo de ingresos).
- **Constantes legales centralizadas** en un único archivo de configuración (sueldo mínimo, asignación familiar, topes) para poder actualizarlas cada año sin tocar la lógica de cálculo.
- **Disclaimer legal visible** en cada página: "Esta herramienta ofrece un cálculo referencial y no constituye asesoría legal."

---

## 6. Monetización

- Google AdSense: banner superior, banner lateral (desktop) o intersticial entre el formulario y el resultado (mobile), y un bloque al final de la página junto al contenido educativo.
- v2 (no en el MVP): afiliación con estudios de abogados laboralistas o gestores de trámites ("¿Necesitas ayuda para reclamar tu liquidación? Habla con un especialista").

---

## 7. Roadmap sugerido

1. **MVP**: página única `/calculadora-liquidacion-peru` con los 4 módulos de cálculo + PDF.
2. **v1.1**: separar en URLs individuales por concepto (CTS, gratificación, vacaciones, indemnización) para capturar más búsquedas long-tail.
3. **v1.2**: contenido de blog de soporte SEO.
4. **v2**: replicar la misma arquitectura para México (finiquito, prima de antigüedad, indemnización según LFT) y Colombia (liquidación, cesantías, prima de servicios).

---

## 8. Fuera de alcance (explícitamente, para no scope-creep en v1)

- Cuentas de usuario / historial de cálculos guardados
- Cálculo de impuesto a la renta de 5ta categoría sobre la liquidación
- Regímenes laborales especiales (agrario, MYPE, construcción civil, trabajo del hogar)
- Versión en otros idiomas
- App móvil nativa
