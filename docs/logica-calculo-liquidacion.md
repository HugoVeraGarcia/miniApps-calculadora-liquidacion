# Lógica de cálculo — Calculadora de Liquidación Laboral Perú
Documento de validación previo a implementación. Fecha: 2026-09-18.

## 0. Función común: conteo de período (base 30/360)

Todos los módulos (CTS, gratificación, vacaciones, indemnización) usan la misma
función determinística para descomponer un rango de fechas en meses completos +
días sueltos, siguiendo el método comercial 30/360 que usan las planillas peruanas
(cada mes = 30 días, cada año = 360 días).

```
function contarPeriodo(fechaInicio, fechaFin):
    // fechaFin es inclusiva (el día de cese cuenta como día trabajado)
    diaInicio = min(fechaInicio.day, 30)   // día 31 se trata como 30
    diaFin    = min(fechaFin.day, 30)

    y = fechaFin.year  - fechaInicio.year
    m = fechaFin.month - fechaInicio.month
    d = diaFin - diaInicio

    if d < 0:
        d += 30
        m -= 1
    if m < 0:
        m += 12
        y -= 1

    mesesCompletos = y * 12 + m
    diasSueltos    = d   // rango 0..29

    return { mesesCompletos, diasSueltos }
```

Este es el único punto donde vive la regla de redondeo de fechas. Todo lo demás
son fórmulas sobre `mesesCompletos` y `diasSueltos`.

---

## 1. CTS (Compensación por Tiempo de Servicios)

### Pseudocódigo
```
function calcularCTS(fechaIngreso, fechaCese, remComputableCTS):
    inicioSemestre = inicioUltimoSemestreCTS(fechaCese)   // 1-mayo o 1-nov, el más reciente <= cese
    if fechaIngreso > inicioSemestre:
        inicioSemestre = fechaIngreso   // truncó a mitad de semestre por ingreso reciente

    if mesesEntre(fechaIngreso, fechaCese) < 1 mes completo AND diasSueltos == 0:
        return 0   // no genera derecho: se requiere al menos 1 mes completo de servicios

    {mesesCompletos, diasSueltos} = contarPeriodo(inicioSemestre, fechaCese)

    ctsTrunca = (remComputableCTS / 12) * mesesCompletos
              + (remComputableCTS / 360) * diasSueltos

    return ctsTrunca
```

### Remuneración computable CTS
```
remComputableCTS = sueldoBasico
                  + (gratificacionMasRecienteOTrunca / 6)   // "1/6 de gratificación"
                  + (recibeAsignacionFamiliar ? asignacionFamiliar : 0)
                  + comisionOVariablePromedio6Meses          // si aplica, ver regla abajo
                  + horasExtraHabituales                     // si aplica (fuera de MVP, dejar en 0)
```
- El 1/6 de gratificación usa el monto de la última gratificación **percibida o
  devengada** (regular o trunca) al momento de calcular cada depósito de CTS.
- Se excluyen: gratificación completa (solo cuenta 1/6), utilidades, bonificación
  extraordinaria 9%/6.75%, CTS de periodos anteriores, condiciones de trabajo
  (movilidad, viáticos no remunerativos).

### Semestres CTS
- Semestre 1: 1-nov a 30-abr → depósito 15 de mayo.
- Semestre 2: 1-mayo a 31-oct → depósito 15 de noviembre.
- Al cesar, todo lo depositado en semestres ya cerrados es "CTS ya depositada"
  (informativo, el trabajador ya la tiene en su cuenta). Solo el tramo desde el
  inicio del semestre en curso hasta el cese es "CTS trunca pendiente de pago"
  (la paga el empleador directamente en la liquidación).

### Casos borde
| Caso | Regla |
|---|---|
| Menos de 1 mes trabajado | No genera derecho a CTS (se requiere mínimo 1 mes completo de servicios). |
| Ingreso y cese en el mismo mes calendario | Igual que el caso anterior si no completa 1 mes; si completa 1 mes exacto, se calcula solo por días con divisor 360. |
| Remuneración variable/comisiones | Se usa el promedio de lo percibido en los últimos 6 meses completos anteriores al cálculo; si tiene menos de 6 meses de antigüedad, se promedia sobre los meses efectivamente trabajados. |
| Menos de 6 meses de antigüedad | Aplica igual la fórmula general; no hay tope mínimo de antigüedad para CTS (solo el mínimo de 1 mes). |
| Tope legal | No existe tope legal para CTS. |

---

## 2. Gratificación trunca

### Pseudocódigo
```
function calcularGratificacionTrunca(fechaIngreso, fechaCese, remComputableGrat, regimenSalud):
    inicioSemestre = fechaCese.month <= 6 ? 1-enero-mismoAño : 1-julio-mismoAño
    if fechaIngreso > inicioSemestre:
        inicioSemestre = fechaIngreso

    {mesesCompletos, diasSueltos} = contarPeriodo(inicioSemestre, fechaCese)

    if mesesCompletos == 0 AND diasSueltos == 0:
        return 0   // ingresó el mismo día del cese, o cesó el día de corte del semestre anterior

    if mesesCompletos < 1:
        return 0   // se requiere al menos 1 mes calendario completo trabajado en el semestre

    gratTrunca = (remComputableGrat / 6) * mesesCompletos
               + (remComputableGrat / 180) * diasSueltos   // 180 = 6 meses x 30 días

    bonoExtraordinario = gratTrunca * (regimenSalud == "EPS" ? 0.0675 : 0.09)

    return gratTrunca + bonoExtraordinario
```

### Remuneración computable gratificación
```
remComputableGrat = sueldoBasico
                   + (recibeAsignacionFamiliar ? asignacionFamiliar : 0)
                   + comisionOVariablePromedio6Meses
```
No incluye el 1/6 de gratificación (obviamente) ni la bonificación extraordinaria.

### Casos borde
| Caso | Regla |
|---|---|
| Cese antes de completar 1 mes en el semestre en curso | No genera gratificación trunca (S/ 0). |
| Cese exactamente el día de corte de un semestre (30-jun o 31-dic) | La gratificación de ese semestre se considera **regular, no trunca** (se le paga completa junto con la liquidación si aún no se ha pagado); la trunca del semestre siguiente es 0. |
| Remuneración variable | Mismo criterio que CTS: promedio de los últimos 6 meses (o los meses disponibles si antigüedad < 6 meses). |
| Antigüedad menor a 6 meses | Aplica igual; solo se exige 1 mes completo en el semestre en curso. |
| Tope legal | No existe tope legal para gratificación trunca. |
| Bono 9% vs 6.75% | 9% si el trabajador está afiliado solo a EsSalud; 6.75% si está afiliado a una EPS (el empleador retiene 2.25% para la EPS). Para el MVP, se puede asumir 9% por defecto y dejar el 6.75% como opción avanzada, dado que la gran mayoría de trabajadores en planilla están en EsSalud. |

---

## 3. Vacaciones truncas + vacaciones no gozadas

Este módulo tiene **dos componentes independientes** que hay que sumar. Para
calcular correctamente el segundo componente, la especificación actual necesita
un campo adicional que no está pedido hoy — lo señalo en la sección 6.

### 3.1 Vacaciones truncas del récord en curso (siempre se calcula)
```
function calcularVacacionesTruncas(inicioRecordActual, fechaCese, remComputableVacacional):
    {mesesCompletos, diasSueltos} = contarPeriodo(inicioRecordActual, fechaCese)

    if mesesCompletos == 0 AND diasSueltos == 0:
        return 0

    return (remComputableVacacional / 12) * mesesCompletos
         + (remComputableVacacional / 360) * diasSueltos
```
`inicioRecordActual` = fecha de ingreso si nunca completó un año, o la fecha en
que se cerró el último récord anual completo (ingreso + N años).

### 3.2 Vacaciones no gozadas de récords ya cumplidos (condicional)
Por cada récord anual **completo** (12 meses de servicios) que el trabajador no
haya gozado a la fecha de cese:
```
function calcularVacacionesNoGozadas(fechaCierreRecord, fechaCese, remComputableVacacional, yaGozadas):
    if yaGozadas:
        return 0

    plazoVencido = fechaCese > (fechaCierreRecord + 12 meses)

    pagoSimple = remComputableVacacional          // 1 remuneración: el descanso que se debía haber pagado
    indemnizacionPorNoDescanso = plazoVencido ? remComputableVacacional : 0
                                  // 1 remuneración adicional SOLO si pasaron más de 12 meses
                                  // desde que se generó el derecho sin que gozara el descanso

    return pagoSimple + indemnizacionPorNoDescanso
```
- Esto es lo que coloquialmente se llama "doble remuneración vacacional": ocurre
  solo cuando el récord está vencido (más de 12 meses sin descanso), no siempre.
- No aplica la indemnización adicional a personal de dirección/gerencial (fuera
  de alcance v1, se puede ignorar en el MVP).

### Remuneración computable vacacional
```
remComputableVacacional = sueldoBasico
                         + (recibeAsignacionFamiliar ? asignacionFamiliar : 0)
                         + comisionOVariablePromedio6Meses
```
No incluye 1/6 de gratificación.

### Casos borde
| Caso | Regla |
|---|---|
| Menos de 1 mes trabajado | No genera vacaciones truncas del récord en curso. |
| Nunca completó un año | Solo aplica 3.1 (truncas), 3.2 = 0. |
| Completó 1+ años pero ya gozó todo | 3.2 = 0 para esos récords. |
| Récord completo no gozado, dentro de los 12 meses de plazo | 3.2 = 1 remuneración (sin indemnización adicional). |
| Récord completo no gozado, plazo vencido (>12 meses) | 3.2 = 2 remuneraciones (pago simple + indemnización). |
| Tope legal | No existe tope legal para vacaciones. |

---

## 4. Indemnización por despido arbitrario

Solo se calcula si `motivoCese == "despido_arbitrario"`.

### Pseudocódigo — contrato indeterminado
```
function calcularIndemnizacionIndeterminado(fechaIngreso, fechaCese, remComputableIndem):
    if contarPeriodo(fechaIngreso, fechaCese).mesesCompletos < 3:
        return { monto: 0, advertencia: "No superó el período de prueba (3 meses); no aplica protección contra despido arbitrario." }

    {mesesCompletos, diasSueltos} = contarPeriodo(fechaIngreso, fechaCese)
    añosCompletos = floor(mesesCompletos / 12)
    mesesRestantes = mesesCompletos % 12

    monto = 1.5 * remComputableIndem * añosCompletos
          + (1.5 * remComputableIndem / 12) * mesesRestantes
          + (1.5 * remComputableIndem / 360) * diasSueltos

    tope = 12 * remComputableIndem
    return min(monto, tope)
```

### Pseudocódigo — contrato a plazo fijo
```
function calcularIndemnizacionPlazoFijo(fechaCese, fechaFinContrato, remComputableIndem):
    if fechaCese >= fechaFinContrato:
        return 0   // el contrato ya culminó normalmente, no hay despido arbitrario que indemnizar

    {mesesCompletos, diasSueltos} = contarPeriodo(fechaCese, fechaFinContrato)

    monto = (1.5 * remComputableIndem) * mesesCompletos
          + (1.5 * remComputableIndem / 30) * diasSueltos

    tope = 12 * remComputableIndem
    return min(monto, tope)
```

### Remuneración computable indemnización
```
remComputableIndem = sueldoBasico
                    + (recibeAsignacionFamiliar ? asignacionFamiliar : 0)
                    + comisionOVariablePromedio6Meses
```
No incluye 1/6 de gratificación, CTS ni utilidades.

### Casos borde
| Caso | Regla |
|---|---|
| Menos de 3 meses de antigüedad (período de prueba) | No hay derecho a indemnización por despido arbitrario; mostrar advertencia, monto = 0. |
| Renuncia voluntaria / mutuo disenso / despido justificado | Módulo no se calcula (monto = 0, oculto o marcado "no aplica"). |
| Fin de contrato a plazo fijo por vencimiento normal | No aplica (no es despido arbitrario). |
| Antigüedad ≥ 8 años (indeterminado) | El cálculo sin tope ya supera 12 remuneraciones (1.5 × 8 = 12); se aplica el tope. |
| Remuneración variable | Promedio de los últimos 6 meses, igual que los otros módulos. |
| Tope legal | 12 remuneraciones computables, para ambos tipos de contrato. |

---

## 5. Tres casos de prueba resueltos a mano

### Caso 1 — Renuncia voluntaria, antigüedad menor a 1 año
- Ingreso: 01/01/2026 · Cese: 30/06/2026 (renuncia voluntaria)
- Sueldo básico: S/ 2,500 · Sin asignación familiar · Sin comisiones

| Concepto | Cálculo | Resultado |
|---|---|---|
| Gratificación trunca (ene-jun, 5m 29d) | (2500/6)×5 + (2500/180)×29, +9% | S/ 2,709.86 |
| CTS trunca (may-jun, 1m 29d; rem. computable 2,914.35) | (2914.35/12)×1 + (2914.35/360)×29 | S/ 477.58 |
| Vacaciones truncas (récord único, 5m 29d) | (2500/12)×5 + (2500/360)×29 | S/ 1,243.06 |
| Indemnización | No aplica (renuncia) | S/ 0.00 |
| **Total** | | **S/ 4,430.50** |

### Caso 2 — Despido arbitrario, contrato indeterminado, con asignación familiar y comisiones
- Ingreso: 15/02/2023 · Cese: 10/09/2026 (despido arbitrario)
- Sueldo básico: S/ 4,000 · Asignación familiar: S/ 113 · Comisiones (prom. 6m): S/ 800
- Remuneración computable base (sin 1/6 grat): S/ 4,913

| Concepto | Cálculo | Resultado |
|---|---|---|
| Gratificación trunca (jul-sep, 2m 9d) | (4913/6)×2 + (4913/180)×9, +9% | S/ 2,052.82 |
| CTS trunca (may-sep, 4m 9d; rem. computable 5,255.14) | (5255.14/12)×4 + (5255.14/360)×9 | S/ 1,883.09 |
| Vacaciones no gozadas (récord 15/02/25-14/02/26, dentro de plazo) | 1 × 4,913 | S/ 4,913.00 |
| Vacaciones truncas (récord en curso, 6m 25d) | (4913/12)×6 + (4913/360)×25 | S/ 2,797.68 |
| Indemnización (3a 6m 25d, sin tope) | 1.5×3×4913 + (1.5×4913/12)×6 + (1.5×4913/360)×25 | S/ 26,305.02 |
| **Total** | | **S/ 37,951.61** |

### Caso 3 — Despido arbitrario, antigüedad alta: se activa el tope de 12 remuneraciones
- Ingreso: 01/01/2016 · Cese: 01/01/2027 (despido arbitrario, 11 años exactos)
- Sueldo básico: S/ 5,000 · Sin asignación · Sin comisiones

| Concepto | Cálculo | Resultado |
|---|---|---|
| Gratificación trunca (ene-ene, 0 días) | Cesa el día de corte del semestre anterior | S/ 0.00 |
| CTS trunca (nov-ene, 2m 0d; rem. computable 5,908.33) | (5908.33/12)×2 | S/ 984.72 |
| Vacaciones no gozadas (récord 2026, recién generado, dentro de plazo) | 1 × 5,000 | S/ 5,000.00 |
| Vacaciones truncas (récord en curso, 0 días) | — | S/ 0.00 |
| Indemnización sin tope: 1.5×11×5000 = 82,500 → **excede el tope** | min(82,500; 12×5,000) | S/ 60,000.00 (tope aplicado) |
| **Total** | | **S/ 65,984.72** |

---

## 6. Constantes legales a parametrizar

| Constante | Valor 2026 | Base legal / fuente | Notas |
|---|---|---|---|
| RMV (Remuneración Mínima Vital) | S/ 1,130 | D.S. N.° 006-2024-TR, vigente desde 01/01/2025 | Hay anuncio de alza a S/ 1,300 pero sin decreto supremo publicado a set-2026; no usar hasta que se oficialice. |
| Asignación familiar | S/ 113 | Ley 25129 (10% de la RMV) | El valor de S/ 102.50 que trae la especificación actual está desactualizado (correspondía a la RMV anterior de S/ 1,025); debe recalcularse como 10% de la RMV vigente. |
| Bonificación extraordinaria (EsSalud) | 9% | Ley 30334 / Ley 29351 | Sobre el monto de gratificación (regular o trunca). |
| Bonificación extraordinaria (EPS) | 6.75% | Ley 30334 / Ley 29351 | Alternativa si el trabajador está afiliado a una EPS. |
| Días de vacaciones por año | 30 días calendario | D. Leg. 713 | Sujeto a cumplir el récord vacacional (fuera de alcance v1: reglas de días mínimos laborados). |
| Tope indemnización despido arbitrario | 12 remuneraciones | D.S. 003-97-TR, art. 38 | Aplica tanto a plazo indeterminado como a plazo fijo. |
| Factor indemnización | 1.5 remuneraciones | D.S. 003-97-TR, art. 38 | Por año completo (indeterminado) o por mes faltante (plazo fijo). |
| Período de prueba estándar | 3 meses | D.S. 003-97-TR, art. 10 | Ampliable a 6 o 12 meses para ciertos cargos (fuera de alcance v1). |
| Plazo para gozar vacaciones sin penalidad | 12 meses desde que se generó el derecho | D.S. 012-92-TR, art. 23 | Vencido ese plazo sin descanso, corresponde indemnización adicional de 1 remuneración. |
| Divisor mensual/diario CTS, vacaciones, indemnización | 12 y 360 | Uso estándar planillas Perú | Método comercial 30/360. |
| Divisor mensual/diario gratificación | 6 y 180 | Uso estándar planillas Perú | 180 = 6 meses × 30 días. |
| Semestres CTS | 1-nov a 30-abr (depósito 15-may) / 1-may a 31-oct (depósito 15-nov) | TUO D. Leg. 650 | |
| Semestres gratificación | 1-ene a 30-jun (pago julio) / 1-jul a 31-dic (pago diciembre) | Ley 27735 | |

---

## 7. Gaps detectados en la especificación funcional (para decidir antes de codear)

1. **Falta un input para "vacaciones no gozadas"**: la especificación no pide si
   el trabajador ya gozó su récord vacacional anterior, ni la fecha en que se
   cerró ese récord. Sin este dato no se puede calcular el componente 3.2. Propongo
   agregar al formulario: "¿Tiene vacaciones ya ganadas (de un año completo) que
   no ha gozado?" (sí/no) → si sí: fecha en que cumplió ese año de servicios.
2. **Régimen de salud (EsSalud vs EPS)**: para decidir 9% vs 6.75% en la
   bonificación extraordinaria. Propongo asumir EsSalud (9%) por defecto en el
   MVP y no pedir este campo todavía (simplifica el formulario, cubre a la
   mayoría de casos).
3. **Fecha de fin de contrato** (solo si tipo de contrato = plazo fijo): necesaria
   para calcular la indemnización de plazo fijo. No está en la lista de inputs
   actual.
4. **Período de prueba**: si la antigüedad es menor a 3 meses y el motivo es
   despido arbitrario, el sistema debe mostrar advertencia y monto S/ 0 en vez de
   calcular indemnización.

Quedo a la espera de tu validación de la lógica (incluyendo estos 4 puntos) antes
de empezar a programar.

---

## 8. Addenda — decisiones confirmadas y correcciones tras implementar

Validado por Hugo el 18-09-2026. Cambios respecto a la versión original de este
documento, aplicados en `engine.js`:

### 8.1 Decisiones sobre los 4 gaps
- **Vacaciones no gozadas**: se agregó una sola pregunta sí/no ("¿Ya gozaste tus
  vacaciones del último período completo que trabajaste?"), sin pedir fecha
  adicional — se deduce del campo "fecha de ingreso" ya existente. Solo se
  muestra si la antigüedad total es ≥ 1 año. Cubre el récord más reciente
  cerrado; múltiples récords vencidos sin gozar queda fuera del MVP.
- **Régimen de salud**: se agregó como campo del formulario (EsSalud/EPS, no
  hay valor por defecto oculto), porque define si el bono extraordinario de
  gratificación es 9% o 6.75%.
- **Fecha de fin de contrato**: se agregó como campo condicional, visible solo
  si el tipo de contrato es "plazo fijo".
- **Período de prueba**: el sistema calcula automáticamente la antigüedad y la
  compara contra 3 meses estándar; si el motivo es despido arbitrario se
  pregunta además si el contrato pacta un período de prueba distinto (con su
  duración en meses). Si no se superó el período de prueba, se informa con una
  advertencia visible y la indemnización se muestra en S/ 0.

### 8.2 Corrección de fórmula — 1/6 de gratificación para CTS
La especificación original no dejaba explícito qué pasa cuando el cese ocurre
justo el primer día de un semestre de gratificación (0 meses acumulados en el
semestre en curso). Se agregó la regla: en ese caso, el 1/6 se calcula sobre
la gratificación (regular o trunca) del semestre INMEDIATAMENTE ANTERIOR, no
sobre 0. Ver función `obtenerGratificacionBaseParaSexto` en `engine.js`.

### 8.3 Corrección de los casos de prueba (errores en el cálculo a mano)
Al verificar el motor contra los 3 casos de la sección 5, aparecieron dos
errores aritméticos en el cálculo manual original: en ambos casos usé por
error la gratificación **con** el bono extraordinario del 9% ya sumado para
sacar el 1/6 de CTS, en vez de usar solo el monto base (sin bono), que es lo
que exige la norma (el bono no es remunerativo y no forma parte de la base de
cálculo de CTS). Valores corregidos, ya verificados en `engine.test.mjs`
contra el motor implementado:

| Caso | CTS trunca (antes → corregido) | Total (antes → corregido) |
|---|---|---|
| Caso 2 (despido arbitrario, con variable) | S/ 1,883.09 → **S/ 1,872.97** | S/ 37,951.61 → **S/ 37,941.49** |
| Caso 3 (tope de 12 remuneraciones) | S/ 984.72 → **S/ 972.22** | S/ 65,984.72 → **S/ 65,972.22** |

El Caso 1 no cambia (el fragmento del semestre de gratificación en curso ya
tenía ≥1 mes completo, por lo que no dispara la regla del punto 8.2).

### 8.4 Estado
Motor de cálculo (`engine.js`) implementado como funciones puras y verificado
contra los 3 casos corregidos (`engine.test.mjs`, `node engine.test.mjs` →
todos OK). Página MVP `/calculadora-liquidacion-peru` (`index.html`, `app.js`,
`styles.css`) implementada y probada en navegador headless con los mismos
casos, con resultados idénticos al motor.
