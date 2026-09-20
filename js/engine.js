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
 * Sugerencia automática de días de vacaciones pendientes de gozar, para
 * precargar el campo editable del formulario. Solo cubre el último récord
 * anual cerrado (el caso más común); si el trabajador tiene más de un año
 * acumulado sin descansar, debe ajustar el número manualmente — por eso el
 * campo es editable y no un simple sí/no.
 */
function sugerirDiasVacacionesPendientes({ fechaIngreso, fechaCese, constants = LEGAL_CONSTANTS_2026 }) {
  const antiguedadTotal = contarPeriodo(fechaIngreso, fechaCese);
  const añosCompletos = Math.floor(antiguedadTotal.mesesCompletos / 12);
  if (añosCompletos < 1) return 0;

  const fechaCierreUltimoRecord = addMonths(fechaIngreso, añosCompletos * 12);
  const fechaLimiteSinPenalidad = addMonths(fechaCierreUltimoRecord, constants.PLAZO_GOCE_VACACIONES_MESES);
  const plazoVencido = compareDate(fechaCese, fechaLimiteSinPenalidad) > 0;

  // Si venció el plazo de 12 meses sin descanso, la ley agrega una
  // indemnización equivalente (D.S. 012-92-TR, art. 23): se sugiere el doble
  // de días como referencia, editable por el usuario.
  return plazoVencido ? constants.DIAS_VACACIONES_ANUALES * 2 : constants.DIAS_VACACIONES_ANUALES;
}

function calcularVacaciones({ fechaIngreso, fechaCese, sueldoBasico, recibeAsignacionFamiliar, variablePromedio = 0, diasPendientesNoGozados = null, constants = LEGAL_CONSTANTS_2026 }) {
  const remComputable = remuneracionBase({ sueldoBasico, recibeAsignacionFamiliar, variablePromedio, constants });
  const antiguedadTotal = contarPeriodo(fechaIngreso, fechaCese);
  const añosCompletos = Math.floor(antiguedadTotal.mesesCompletos / 12);

  const inicioRecordActual = addMonths(fechaIngreso, añosCompletos * 12);
  const { mesesCompletos, diasSueltos } = contarPeriodo(inicioRecordActual, fechaCese);

  const truncas = mesesCompletos < 1 ? 0 : (remComputable / 12) * mesesCompletos + (remComputable / 360) * diasSueltos;

  const diasSugeridos = sugerirDiasVacacionesPendientes({ fechaIngreso, fechaCese, constants });
  const dias = diasPendientesNoGozados === null || diasPendientesNoGozados === undefined ? diasSugeridos : Math.max(0, Number(diasPendientesNoGozados) || 0);
  const totalNoGozadas = (remComputable / 30) * dias;

  const noGozadas = {
    aplica: dias > 0,
    dias,
    diasSugeridos,
    total: totalNoGozadas,
  };

  return {
    remComputable,
    truncas: { mesesCompletos, diasSueltos, total: truncas, inicioRecordActual: toISO(inicioRecordActual) },
    noGozadas,
    total: truncas + noGozadas.total,
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
  const vacaciones = calcularVacaciones({
    ...base,
    diasPendientesNoGozados: diasPendientesNoGozados === '' || diasPendientesNoGozados === undefined ? null : diasPendientesNoGozados,
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
  sugerirDiasVacacionesPendientes,
  calcularIndemnizacion,
  calcularLiquidacionTotal,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LiquidacionEngine;
}
if (typeof window !== 'undefined') {
  window.LiquidacionEngine = LiquidacionEngine;
}
