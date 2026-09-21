/**
 * Motor de cálculo — Calculadora de Liquidación Laboral Perú
 * Funciones puras, sin dependencias de DOM. Reutilizable en las 5 páginas
 * del roadmap (liquidación general, CTS, gratificación, vacaciones, indemnización).
 *
 * Normativa base: D. Leg. 650 (CTS), Ley 27735 (gratificación), Ley 30334/29351
 * (bonificación extraordinaria), D. Leg. 713 y D.S. 012-92-TR (vacaciones),
 * D.S. 003-97-TR (indemnización por despido arbitrario y período de prueba).
 *
 * Ver logica-calculo-liquidacion.md para el detalle de cada fórmula y los
 * casos de prueba resueltos a mano que este motor debe reproducir.
 */

// ---------------------------------------------------------------------------
// Constantes legales (parametrizables) — actualizar cuando cambie la norma.
// ---------------------------------------------------------------------------
const LEGAL_CONSTANTS_2026 = {
  anio: 2026,
  RMV: 1130, // D.S. N.° 006-2024-TR, vigente desde 01/01/2025
  ASIGNACION_FAMILIAR: 113, // Ley 25129: 10% de la RMV vigente
  BONO_EXTRAORDINARIO_ESSALUD: 0.09, // Ley 30334 / Ley 29351
  BONO_EXTRAORDINARIO_EPS: 0.0675, // Ley 30334 / Ley 29351
  TOPE_INDEMNIZACION_REMUNERACIONES: 12, // D.S. 003-97-TR, art. 38
  FACTOR_INDEMNIZACION: 1.5, // D.S. 003-97-TR, art. 38
  PERIODO_PRUEBA_MESES_ESTANDAR: 3, // D.S. 003-97-TR, art. 10
  DIAS_VACACIONES_ANUALES: 30, // D. Leg. 713
  PLAZO_GOCE_VACACIONES_MESES: 12, // D.S. 012-92-TR, art. 23
  fuente: 'Ver logica-calculo-liquidacion.md — constantes verificadas set-2026',
};

// ---------------------------------------------------------------------------
// Utilidades de fecha. Se evita el objeto Date para no arrastrar problemas de
// zona horaria: las fechas se manejan como {y, m, d} enteros.
// ---------------------------------------------------------------------------

/** Convierte un string "YYYY-MM-DD" (el formato de <input type="date">) a {y,m,d}. */
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function toISO({ y, m, d }) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function compareDate(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function maxDate(a, b) {
  return compareDate(a, b) >= 0 ? a : b;
}

function minDate(a, b) {
  return compareDate(a, b) <= 0 ? a : b;
}

/** Suma n meses a una fecha, conservando el día (usado solo con día=1 en este motor). */
function addMonths(date, n) {
  const totalMonths = date.y * 12 + (date.m - 1) + n;
  const y = Math.floor(totalMonths / 12);
  const m = (((totalMonths % 12) + 12) % 12) + 1;
  return { y, m, d: date.d };
}

/**
 * Descompone el rango [inicio, fin] (fin inclusivo) en meses completos + días
 * sueltos, con el método comercial 30/360 usado en las planillas peruanas:
 * cada mes tiene 30 días y el día 31 se trata como 30.
 */
function contarPeriodo(inicio, fin) {
  const di = Math.min(inicio.d, 30);
  const df = Math.min(fin.d, 30);

  let y = fin.y - inicio.y;
  let m = fin.m - inicio.m;
  let d = df - di;

  if (d < 0) {
    d += 30;
    m -= 1;
  }
  if (m < 0) {
    m += 12;
    y -= 1;
  }

  return { mesesCompletos: y * 12 + m, diasSueltos: d };
}

// ---------------------------------------------------------------------------
// Remuneración computable común (sueldo + asignación familiar + variable)
// ---------------------------------------------------------------------------
function remuneracionBase({ sueldoBasico, recibeAsignacionFamiliar, variablePromedio = 0, constants = LEGAL_CONSTANTS_2026 }) {
  return sueldoBasico + (recibeAsignacionFamiliar ? constants.ASIGNACION_FAMILIAR : 0) + variablePromedio;
}

// ---------------------------------------------------------------------------
// 1. Gratificación trunca
// ---------------------------------------------------------------------------
function calcularGratificacion({ fechaIngreso, fechaCese, sueldoBasico, recibeAsignacionFamiliar, variablePromedio = 0, regimenSalud = 'EsSalud', constants = LEGAL_CONSTANTS_2026 }) {
  const inicioSemestre = fechaCese.m <= 6 ? { y: fechaCese.y, m: 1, d: 1 } : { y: fechaCese.y, m: 7, d: 1 };
  const inicioEfectivo = maxDate(inicioSemestre, fechaIngreso);
  const { mesesCompletos, diasSueltos } = contarPeriodo(inicioEfectivo, fechaCese);
  const remComputable = remuneracionBase({ sueldoBasico, recibeAsignacionFamiliar, variablePromedio, constants });

  if (mesesCompletos < 1) {
    return { aplica: false, mesesCompletos, diasSueltos, remComputable, montoBase: 0, bono: 0, total: 0, inicioSemestre };
  }

  const montoBase = (remComputable / 6) * mesesCompletos + (remComputable / 180) * diasSueltos;
  const tasaBono = regimenSalud === 'EPS' ? constants.BONO_EXTRAORDINARIO_EPS : constants.BONO_EXTRAORDINARIO_ESSALUD;
  const bono = montoBase * tasaBono;

  return { aplica: true, mesesCompletos, diasSueltos, remComputable, montoBase, bono, total: montoBase + bono, inicioSemestre };
}

// ---------------------------------------------------------------------------
// 2. CTS (Compensación por Tiempo de Servicios)
// ---------------------------------------------------------------------------

/**
 * El 1/6 que integra la remuneración computable de CTS corresponde a la
 * última gratificación percibida o devengada. Normalmente es la trunca del
 * semestre de gratificación en curso; pero si el cese ocurre justo en el
 * primer día de un semestre nuevo (0 meses acumulados todavía), se usa la
 * gratificación (regular o trunca) del semestre inmediatamente anterior.
 */
function obtenerGratificacionBaseParaSexto({ fechaIngreso, fechaCese, remComputableGrat }) {
  const inicioSemestreActual = fechaCese.m <= 6 ? { y: fechaCese.y, m: 1, d: 1 } : { y: fechaCese.y, m: 7, d: 1 };
  const inicioEfectivoActual = maxDate(inicioSemestreActual, fechaIngreso);
  const fragActual = contarPeriodo(inicioEfectivoActual, fechaCese);

  if (fragActual.mesesCompletos >= 1) {
    return (remComputableGrat / 6) * fragActual.mesesCompletos + (remComputableGrat / 180) * fragActual.diasSueltos;
  }

  const inicioSemestreAnterior = addMonths(inicioSemestreActual, -6);
  const inicioEfectivoAnterior = maxDate(inicioSemestreAnterior, fechaIngreso);
  if (compareDate(inicioEfectivoAnterior, inicioSemestreActual) >= 0) return 0;

  const fragAnterior = contarPeriodo(inicioEfectivoAnterior, inicioSemestreActual);
  return (remComputableGrat / 6) * fragAnterior.mesesCompletos + (remComputableGrat / 180) * fragAnterior.diasSueltos;
}

function calcularCTS({ fechaIngreso, fechaCese, sueldoBasico, recibeAsignacionFamiliar, variablePromedio = 0, constants = LEGAL_CONSTANTS_2026 }) {
  // Elegibilidad: se requiere al menos 1 mes completo de servicios (antigüedad
  // total), independientemente de qué tan reciente haya empezado el semestre.
  const antiguedadTotal = contarPeriodo(fechaIngreso, fechaCese);
  if (antiguedadTotal.mesesCompletos < 1) {
    return { aplica: false, mesesCompletos: 0, diasSueltos: 0, remComputable: 0, total: 0 };
  }

  const m = fechaCese.m;
  let inicioSemestre;
  if (m >= 5 && m <= 10) inicioSemestre = { y: fechaCese.y, m: 5, d: 1 };
  else if (m === 11 || m === 12) inicioSemestre = { y: fechaCese.y, m: 11, d: 1 };
  else inicioSemestre = { y: fechaCese.y - 1, m: 11, d: 1 };

  const inicioEfectivo = maxDate(inicioSemestre, fechaIngreso);
  const { mesesCompletos, diasSueltos } = contarPeriodo(inicioEfectivo, fechaCese);

  const remComputableSinGrat = remuneracionBase({ sueldoBasico, recibeAsignacionFamiliar, variablePromedio, constants });
  const gratificacionBaseParaSexto = obtenerGratificacionBaseParaSexto({ fechaIngreso, fechaCese, remComputableGrat: remComputableSinGrat });
  const remComputable = remComputableSinGrat + gratificacionBaseParaSexto / 6;

  const total = (remComputable / 12) * mesesCompletos + (remComputable / 360) * diasSueltos;

  return { aplica: true, mesesCompletos, diasSueltos, remComputable, gratificacionBaseParaSexto, total, inicioSemestre };
}

// ---------------------------------------------------------------------------
// 3. Vacaciones: truncas del récord en curso + días pendientes no gozados
// ---------------------------------------------------------------------------

/**
 * Días de vacaciones GANADOS desde el ingreso hasta el cese.
 *
 * Es el techo de lo que se puede cobrar, no lo que se cobra: cada récord anual
 * cerrado gana 30 días, y el récord en curso gana la parte proporcional —2,5
 * días por mes completo y 1/12 de día por cada día suelto—. De estos días, el
 * trabajador habrá descansado algunos y otros no; cuáles, solo lo sabe él.
 *
 * Por eso esta función NO decide el pago. Devuelve el total ganado para
 * mostrarlo como referencia, y es el usuario quien declara cuántos de esos
 * días quedaron sin gozar. Antes se asumía que no había descansado nunca en el
 * récord en curso, y eso pagaba de más a quien sí había salido de vacaciones.
 */
function calcularDiasVacacionesGanados({ fechaIngreso, fechaCese, constants = LEGAL_CONSTANTS_2026 }) {
  const antiguedadTotal = contarPeriodo(fechaIngreso, fechaCese);
  const añosCompletos = Math.floor(antiguedadTotal.mesesCompletos / 12);
  const inicioRecordActual = addMonths(fechaIngreso, añosCompletos * 12);
  const { mesesCompletos, diasSueltos } = contarPeriodo(inicioRecordActual, fechaCese);

  const porRecordsCerrados = añosCompletos * constants.DIAS_VACACIONES_ANUALES;
  const porRecordEnCurso = (constants.DIAS_VACACIONES_ANUALES / 12) * mesesCompletos
    + (constants.DIAS_VACACIONES_ANUALES / 360) * diasSueltos;

  return {
    añosCompletos,
    inicioRecordActual: toISO(inicioRecordActual),
    mesesRecordActual: mesesCompletos,
    diasSueltosRecordActual: diasSueltos,
    porRecordsCerrados,
    porRecordEnCurso,
    total: porRecordsCerrados + porRecordEnCurso,
  };
}

/**
 * ¿Venció el plazo para gozar el último récord cerrado? D.S. 012-92-TR art. 23
 * añade una indemnización cuando se pasa el año sin descansar. La calculadora
 * no la computa todavía; se devuelve el dato para poder avisar.
 */
function plazoGoceVencido({ fechaIngreso, fechaCese, constants = LEGAL_CONSTANTS_2026 }) {
  const { mesesCompletos } = contarPeriodo(fechaIngreso, fechaCese);
  const añosCompletos = Math.floor(mesesCompletos / 12);
  if (añosCompletos < 1) return false;
  const cierreUltimoRecord = addMonths(fechaIngreso, añosCompletos * 12);
  const limite = addMonths(cierreUltimoRecord, constants.PLAZO_GOCE_VACACIONES_MESES);
  return compareDate(fechaCese, limite) > 0;
}

/**
 * Pago de vacaciones: un solo número, los días que el trabajador declara no
 * haber gozado, a razón de un treintavo de la remuneración computable por día.
 *
 * El cálculo no separa "truncas" de "récords cerrados" porque un día vale lo
 * mismo venga de donde venga: (rem/12) × mes es idéntico a (rem/30) × 2,5
 * días. Separarlos obligaba a suponer que el récord en curso no se había
 * descansado nunca, que es exactamente lo que no se puede suponer.
 */
function calcularVacaciones({ fechaIngreso, fechaCese, sueldoBasico, recibeAsignacionFamiliar, variablePromedio = 0, diasNoGozados = null, diasPendientesNoGozados = null, constants = LEGAL_CONSTANTS_2026 }) {
  const remComputable = remuneracionBase({ sueldoBasico, recibeAsignacionFamiliar, variablePromedio, constants });
  const ganados = calcularDiasVacacionesGanados({ fechaIngreso, fechaCese, constants });

  // diasPendientesNoGozados es el nombre antiguo del mismo dato: se acepta
  // para no romper a quien llame al motor con la firma de antes.
  const declarado = diasNoGozados !== null && diasNoGozados !== undefined
    ? diasNoGozados : diasPendientesNoGozados;

  const dias = declarado === null || declarado === undefined || declarado === ''
    ? 0 : Math.max(0, Number(declarado) || 0);

  const valorDia = remComputable / 30;
  const total = valorDia * dias;

  return {
    remComputable,
    valorDia,
    ganados,
    diasNoGozados: dias,
    // Declarar más días de los ganados es casi siempre un error de tecleo, y
    // vale dinero: se avisa en vez de corregirlo por su cuenta.
    excedeGanados: dias > ganados.total + 1e-9,
    plazoGoceVencido: plazoGoceVencido({ fechaIngreso, fechaCese, constants }),
    total,
  };
}

// ---------------------------------------------------------------------------
// 4. Indemnización por despido arbitrario
// ---------------------------------------------------------------------------
function calcularIndemnizacion({
  motivoCese,
  tipoContrato,
  fechaIngreso,
  fechaCese,
  fechaFinContrato = null,
  periodoPruebaMeses = null,
  sueldoBasico,
  recibeAsignacionFamiliar,
  variablePromedio = 0,
  constants = LEGAL_CONSTANTS_2026,
}) {
  if (motivoCese !== 'despido_arbitrario') {
    return { aplica: false, motivo: 'motivo_no_aplica', total: 0 };
  }

  const remComputable = remuneracionBase({ sueldoBasico, recibeAsignacionFamiliar, variablePromedio, constants });
  const antiguedadTotal = contarPeriodo(fechaIngreso, fechaCese);
  const pp = periodoPruebaMeses ?? constants.PERIODO_PRUEBA_MESES_ESTANDAR;

  if (antiguedadTotal.mesesCompletos < pp) {
    return {
      aplica: false,
      motivo: 'periodo_prueba',
      mesesServicio: antiguedadTotal.mesesCompletos,
      periodoPruebaMeses: pp,
      total: 0,
      advertencia: `No superaste el período de prueba (${pp} ${pp === 1 ? 'mes' : 'meses'}); la ley no protege contra despido arbitrario antes de superarlo.`,
    };
  }

  let montoSinTope;
  let detalle;

  if (tipoContrato === 'plazo_fijo') {
    if (!fechaFinContrato || compareDate(fechaCese, fechaFinContrato) >= 0) {
      return { aplica: false, motivo: 'contrato_ya_vencido', total: 0 };
    }
    const { mesesCompletos, diasSueltos } = contarPeriodo(fechaCese, fechaFinContrato);
    montoSinTope =
      constants.FACTOR_INDEMNIZACION * remComputable * mesesCompletos +
      ((constants.FACTOR_INDEMNIZACION * remComputable) / 30) * diasSueltos;
    detalle = { mesesCompletos, diasSueltos };
  } else {
    const añosCompletos = Math.floor(antiguedadTotal.mesesCompletos / 12);
    const mesesRestantes = antiguedadTotal.mesesCompletos % 12;
    montoSinTope =
      constants.FACTOR_INDEMNIZACION * remComputable * añosCompletos +
      ((constants.FACTOR_INDEMNIZACION * remComputable) / 12) * mesesRestantes +
      ((constants.FACTOR_INDEMNIZACION * remComputable) / 360) * antiguedadTotal.diasSueltos;
    detalle = { añosCompletos, mesesRestantes, diasSueltos: antiguedadTotal.diasSueltos };
  }

  const tope = constants.TOPE_INDEMNIZACION_REMUNERACIONES * remComputable;
  const topeAplicado = montoSinTope > tope;
  const total = Math.min(montoSinTope, tope);

  return { aplica: true, remComputable, montoSinTope, tope, topeAplicado, total, detalle };
}

// ---------------------------------------------------------------------------
// Orquestador: calcula los 4 módulos y arma el resumen final
// ---------------------------------------------------------------------------
function calcularLiquidacionTotal(inputs) {
  const {
    fechaIngreso: fechaIngresoISO,
    fechaCese: fechaCeseISO,
    sueldoBasico,
    recibeAsignacionFamiliar,
    tieneVariable,
    variablePromedio,
    regimenSalud,
    motivoCese,
    tipoContrato,
    fechaFinContrato: fechaFinContratoISO,
    diasNoGozados,
    diasPendientesNoGozados,
    periodoPruebaDistinto,
    periodoPruebaMeses,
    constants = LEGAL_CONSTANTS_2026,
  } = inputs;

  const fechaIngreso = parseISO(fechaIngresoISO);
  const fechaCese = parseISO(fechaCeseISO);
  const fechaFinContrato = fechaFinContratoISO ? parseISO(fechaFinContratoISO) : null;
  const variable = tieneVariable ? Number(variablePromedio) || 0 : 0;

  const base = { fechaIngreso, fechaCese, sueldoBasico: Number(sueldoBasico) || 0, recibeAsignacionFamiliar: !!recibeAsignacionFamiliar, variablePromedio: variable, constants };

  const gratificacion = calcularGratificacion({ ...base, regimenSalud });
  const cts = calcularCTS(base);
  const declaradoVac = diasNoGozados !== undefined ? diasNoGozados : diasPendientesNoGozados;
  const vacaciones = calcularVacaciones({
    ...base,
    diasNoGozados: declaradoVac === '' || declaradoVac === undefined ? null : declaradoVac,
  });
  const indemnizacion = calcularIndemnizacion({
    ...base,
    motivoCese,
    tipoContrato,
    fechaFinContrato,
    periodoPruebaMeses: periodoPruebaDistinto ? Number(periodoPruebaMeses) || constants.PERIODO_PRUEBA_MESES_ESTANDAR : null,
  });

  const total = cts.total + gratificacion.total + vacaciones.total + indemnizacion.total;

  return { cts, gratificacion, vacaciones, indemnizacion, total, constants };
}

// ---------------------------------------------------------------------------
// Exposición: funciona como script clásico en el navegador (window.LiquidacionEngine)
// y como módulo CommonJS en Node (para los tests con `require`).
// ---------------------------------------------------------------------------
const LiquidacionEngine = {
  LEGAL_CONSTANTS_2026,
  parseISO,
  toISO,
  compareDate,
  maxDate,
  minDate,
  addMonths,
  contarPeriodo,
  remuneracionBase,
  calcularGratificacion,
  calcularCTS,
  calcularVacaciones,
  calcularDiasVacacionesGanados,
  plazoGoceVencido,
  calcularIndemnizacion,
  calcularLiquidacionTotal,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LiquidacionEngine;
}
if (typeof window !== 'undefined') {
  window.LiquidacionEngine = LiquidacionEngine;
}
