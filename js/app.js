(function () {
'use strict';
const { calcularLiquidacionTotal, contarPeriodo, parseISO, calcularDiasVacacionesGanados, LEGAL_CONSTANTS_2026 } = window.LiquidacionEngine;

const form = document.getElementById('form-liquidacion');
const rowVariable = document.getElementById('row-variable');
const rowFinContrato = document.getElementById('row-fin-contrato');
const rowPeriodoPrueba = document.getElementById('row-periodo-prueba');
const rowPeriodoPruebaMeses = document.getElementById('row-periodo-prueba-meses');
const fieldsetVacaciones = document.getElementById('fieldset-vacaciones');
const diasPendientesInput = document.getElementById('diasPendientesNoGozados');
const diasGanadosEl = document.getElementById('dias-ganados');
const avisoVacacionesEl = document.getElementById('aviso-vacaciones');

/* Los dias ganados hasta el cese, para enseñarlos como referencia y para
   avisar si el usuario declara mas dias de los que le corresponden. El campo
   NO se precarga: cuantos dias descanso solo lo sabe el. */
let ganadosActuales = null;
diasPendientesInput.addEventListener('input', revisarDiasDeclarados);

const fmt = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function soles(n) {
  return `S/ ${fmt.format(n)}`;
}

function formatFecha(iso) {
  if (!iso) return '—';
  const { y, m, d } = parseISO(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function formatAntiguedad(fechaIngresoISO, fechaCeseISO) {
  const { mesesCompletos, diasSueltos } = contarPeriodo(parseISO(fechaIngresoISO), parseISO(fechaCeseISO));
  const años = Math.floor(mesesCompletos / 12);
  const meses = mesesCompletos % 12;
  const partes = [];
  if (años > 0) partes.push(`${años} ${años === 1 ? 'año' : 'años'}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mes' : 'meses'}`);
  if (diasSueltos > 0 || partes.length === 0) partes.push(`${diasSueltos} ${diasSueltos === 1 ? 'día' : 'días'}`);
  return partes.join(', ');
}

const REGIMEN_LABEL = { EsSalud: 'EsSalud (bono 9%)', EPS: 'EPS (bono 6.75%)' };
const TIPO_CONTRATO_LABEL = { indeterminado: 'Indeterminado', plazo_fijo: 'Plazo fijo' };

/** Datos de entrada en un formato común, reutilizado por la pantalla y el PDF. */
function construirDatosEntrada(inputs) {
  const datos = [
    ['Fecha de ingreso', formatFecha(inputs.fechaIngreso)],
    ['Fecha de cese', formatFecha(inputs.fechaCese)],
    ['Antigüedad', formatAntiguedad(inputs.fechaIngreso, inputs.fechaCese)],
    ['Remuneración mensual bruta', soles(Number(inputs.sueldoBasico) || 0)],
    ['Asignación familiar', inputs.recibeAsignacionFamiliar ? `Sí (${soles(LEGAL_CONSTANTS_2026.ASIGNACION_FAMILIAR)})` : 'No'],
    ['Comisiones / remuneración variable', inputs.tieneVariable ? `${soles(Number(inputs.variablePromedio) || 0)} (promedio 6 meses)` : 'No'],
    ['Sistema de salud', REGIMEN_LABEL[inputs.regimenSalud] || inputs.regimenSalud],
    ['Motivo de cese', MOTIVO_LABEL[inputs.motivoCese] || inputs.motivoCese],
    ['Tipo de contrato', TIPO_CONTRATO_LABEL[inputs.tipoContrato] || inputs.tipoContrato],
  ];
  if (inputs.tipoContrato === 'plazo_fijo' && inputs.fechaFinContrato) {
    datos.push(['Fecha de fin de contrato pactada', formatFecha(inputs.fechaFinContrato)]);
  }
  if (Number(inputs.diasPendientesNoGozados) > 0) {
    datos.push(['Días de vacaciones no gozados declarados', `${inputs.diasPendientesNoGozados} días`]);
  }
  return datos;
}

function formatFechaObj({ y, m, d }) {
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/**
 * Memoria de cálculo: el detalle paso a paso de cada módulo, con las mismas
 * fórmulas de logica-calculo-liquidacion.md ya resueltas con los números del
 * caso. Se usa tanto en pantalla (detalle colapsable) como en el PDF.
 */
function construirMemoriaCalculo(r, inputs) {
  const secciones = [];
  const sueldo = Number(inputs.sueldoBasico) || 0;
  const asignacion = inputs.recibeAsignacionFamiliar ? LEGAL_CONSTANTS_2026.ASIGNACION_FAMILIAR : 0;
  const variable = inputs.tieneVariable ? Number(inputs.variablePromedio) || 0 : 0;

  // --- CTS ---
  if (r.cts.aplica) {
    secciones.push({
      titulo: 'CTS trunca',
      lineas: [
        `Semestre CTS en curso: desde el ${formatFechaObj(r.cts.inicioSemestre)} hasta la fecha de cese.`,
        `Tiempo trabajado en el tramo: ${r.cts.mesesCompletos} meses completos + ${r.cts.diasSueltos} días.`,
        `1/6 de la gratificación (base, sin bono) = ${soles(r.cts.gratificacionBaseParaSexto)} ÷ 6 = ${soles(r.cts.gratificacionBaseParaSexto / 6)}.`,
        `Remuneración computable = sueldo (${soles(sueldo)}) + asignación familiar (${soles(asignacion)}) + variable (${soles(variable)}) + 1/6 gratificación (${soles(r.cts.gratificacionBaseParaSexto / 6)}) = ${soles(r.cts.remComputable)}.`,
        `CTS = (${soles(r.cts.remComputable)} ÷ 12) × ${r.cts.mesesCompletos} + (${soles(r.cts.remComputable)} ÷ 360) × ${r.cts.diasSueltos} = ${soles(r.cts.total)}.`,
      ],
    });
  } else {
    secciones.push({ titulo: 'CTS trunca', lineas: ['No corresponde: se requiere al menos 1 mes completo de servicios.'] });
  }

  // --- Gratificación ---
  if (r.gratificacion.aplica) {
    const tasaBono = inputs.regimenSalud === 'EPS' ? LEGAL_CONSTANTS_2026.BONO_EXTRAORDINARIO_EPS : LEGAL_CONSTANTS_2026.BONO_EXTRAORDINARIO_ESSALUD;
    secciones.push({
      titulo: 'Gratificación trunca',
      lineas: [
        `Semestre de gratificación en curso: desde el ${formatFechaObj(r.gratificacion.inicioSemestre)}.`,
        `Tiempo trabajado en el semestre: ${r.gratificacion.mesesCompletos} meses completos + ${r.gratificacion.diasSueltos} días.`,
        `Remuneración computable = sueldo (${soles(sueldo)}) + asignación familiar (${soles(asignacion)}) + variable (${soles(variable)}) = ${soles(r.gratificacion.remComputable)}.`,
        `Base = (${soles(r.gratificacion.remComputable)} ÷ 6) × ${r.gratificacion.mesesCompletos} + (${soles(r.gratificacion.remComputable)} ÷ 180) × ${r.gratificacion.diasSueltos} = ${soles(r.gratificacion.montoBase)}.`,
        `Bono extraordinario (${(tasaBono * 100).toFixed(2).replace(/\.00$/, '')}%, ${inputs.regimenSalud}) = ${soles(r.gratificacion.montoBase)} × ${tasaBono} = ${soles(r.gratificacion.bono)}.`,
        `Total = ${soles(r.gratificacion.montoBase)} + ${soles(r.gratificacion.bono)} = ${soles(r.gratificacion.total)}.`,
      ],
    });
  } else {
    secciones.push({ titulo: 'Gratificación trunca', lineas: ['No corresponde: no se completó 1 mes calendario en el semestre en curso.'] });
  }

  // --- Vacaciones ---
  const g = r.vacaciones.ganados;
  const vLineas = [
    g.añosCompletos > 0
      ? `Años completos trabajados: ${g.añosCompletos} → ${g.porRecordsCerrados} días ganados.`
      : 'Aún no cumples un año completo, así que no hay días de años cerrados.',
    `Año en curso: desde el ${formatFecha(g.inicioRecordActual)}, ${g.mesesRecordActual} meses completos`
      + ` + ${g.diasSueltosRecordActual} días → ${numDias(g.porRecordEnCurso)} días ganados.`,
    `Total de días ganados hasta el cese: ${numDias(g.total)} días.`,
    `Remuneración computable = sueldo (${soles(sueldo)}) + asignación familiar (${soles(asignacion)}) + variable (${soles(variable)}) = ${soles(r.vacaciones.remComputable)}.`,
    `Valor de un día = ${soles(r.vacaciones.remComputable)} ÷ 30 = ${soles(r.vacaciones.valorDia)}.`,
  ];
  if (r.vacaciones.diasNoGozados > 0) {
    vLineas.push(
      `Días que declaraste NO gozados: ${numDias(r.vacaciones.diasNoGozados)}.`,
      `Pago = ${soles(r.vacaciones.valorDia)} × ${numDias(r.vacaciones.diasNoGozados)} = ${soles(r.vacaciones.total)}.`
    );
  } else {
    vLineas.push('Declaraste 0 días sin gozar, así que no hay pago por vacaciones.');
  }
  if (r.vacaciones.plazoGoceVencido && r.vacaciones.diasNoGozados > 0) {
    vLineas.push('Pasaron más de 12 meses desde que cerró tu último año completo sin que'
      + ' descansaras: además de estos días puede corresponderte una remuneración adicional'
      + ' (D.S. 012-92-TR, art. 23). Esta calculadora no la incluye; consúltalo.');
  }
  if (r.vacaciones.excedeGanados) {
    vLineas.push(`Atención: declaraste más días de los ${numDias(g.total)} ganados. El cálculo usa el número que indicaste.`);
  }
  secciones.push({ titulo: 'Vacaciones no gozadas', lineas: vLineas });

  // --- Indemnización ---
  if (inputs.motivoCese === 'despido_arbitrario') {
    const i = r.indemnizacion;
    if (!i.aplica) {
      secciones.push({
        titulo: 'Indemnización por despido arbitrario',
        lineas: [i.advertencia || (i.motivo === 'contrato_ya_vencido'
          ? 'La fecha de cese es igual o posterior a la fecha de fin de contrato: no corresponde indemnización, sino el término normal del contrato.'
          : 'No corresponde indemnización por despido arbitrario.')],
      });
    } else {
      const lineas = [`Remuneración computable = sueldo (${soles(sueldo)}) + asignación familiar (${soles(asignacion)}) + variable (${soles(variable)}) = ${soles(i.remComputable)}.`];
      if (inputs.tipoContrato === 'plazo_fijo') {
        lineas.push(
          `Contrato a plazo fijo: meses y días que faltaban para culminar el contrato pactado: ${i.detalle.mesesCompletos} meses + ${i.detalle.diasSueltos} días.`,
          `Cálculo = 1.5 × ${soles(i.remComputable)} × ${i.detalle.mesesCompletos} + (1.5 × ${soles(i.remComputable)} ÷ 30) × ${i.detalle.diasSueltos} = ${soles(i.montoSinTope)}.`
        );
      } else {
        lineas.push(
          `Contrato indeterminado: antigüedad de ${i.detalle.añosCompletos} años completos + ${i.detalle.mesesRestantes} meses + ${i.detalle.diasSueltos} días.`,
          `Cálculo = 1.5 × ${soles(i.remComputable)} × ${i.detalle.añosCompletos} + (1.5 × ${soles(i.remComputable)} ÷ 12) × ${i.detalle.mesesRestantes} + (1.5 × ${soles(i.remComputable)} ÷ 360) × ${i.detalle.diasSueltos} = ${soles(i.montoSinTope)}.`
        );
      }
      if (i.topeAplicado) {
        lineas.push(`Tope legal de ${r.constants.TOPE_INDEMNIZACION_REMUNERACIONES} remuneraciones = ${soles(i.tope)}. El cálculo sin tope (${soles(i.montoSinTope)}) lo superaba, así que se aplica el tope.`);
      }
      lineas.push(`Total indemnización = ${soles(i.total)}.`);
      secciones.push({ titulo: 'Indemnización por despido arbitrario', lineas });
    }
  }

  return secciones;
}

// --- Mostrar/ocultar campos condicionales ---------------------------------

document.getElementById('tieneVariable').addEventListener('change', (e) => {
  rowVariable.hidden = !e.target.checked;
});

document.getElementById('tipoContrato').addEventListener('change', (e) => {
  rowFinContrato.hidden = e.target.value !== 'plazo_fijo';
});

document.getElementById('motivoCese').addEventListener('change', (e) => {
  rowPeriodoPrueba.hidden = e.target.value !== 'despido_arbitrario';
  if (rowPeriodoPrueba.hidden) rowPeriodoPruebaMeses.hidden = true;
});

document.getElementById('periodoPruebaDistinto').addEventListener('change', (e) => {
  rowPeriodoPruebaMeses.hidden = e.target.value !== 'si';
});

function actualizarVisibilidadVacaciones() {
  const ingresoVal = document.getElementById('fechaIngreso').value;
  const ceseVal = document.getElementById('fechaCese').value;
  if (!ingresoVal || !ceseVal) {
    fieldsetVacaciones.hidden = true;
    return;
  }
  try {
    const fechaIngreso = parseISO(ingresoVal);
    const fechaCese = parseISO(ceseVal);
    const { mesesCompletos } = contarPeriodo(fechaIngreso, fechaCese);
    fieldsetVacaciones.hidden = mesesCompletos < 1;
    if (fieldsetVacaciones.hidden) { ganadosActuales = null; return; }

    ganadosActuales = calcularDiasVacacionesGanados({ fechaIngreso, fechaCese });
    diasGanadosEl.hidden = false;
    diasGanadosEl.innerHTML = `Hasta tu fecha de cese has <b>ganado ${numDias(ganadosActuales.total)} días</b>`
      + ` de vacaciones: ${ganadosActuales.añosCompletos > 0
          ? `${ganadosActuales.porRecordsCerrados} por los ${ganadosActuales.añosCompletos} año${ganadosActuales.añosCompletos > 1 ? 's' : ''} ya cumplidos`
            + ` y ${numDias(ganadosActuales.porRecordEnCurso)} por el año en curso`
          : `${numDias(ganadosActuales.porRecordEnCurso)} por el año en curso`}.`;
    revisarDiasDeclarados();
  } catch {
    fieldsetVacaciones.hidden = true;
    ganadosActuales = null;
  }
}

/** Los dias se muestran sin decimales cuando son enteros: "90", no "90.00". */
function numDias(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/* Declarar mas dias de los ganados suele ser un error de tecleo, y vale
   dinero. Se avisa, no se corrige solo: puede haber un acuerdo particular. */
function revisarDiasDeclarados() {
  if (!ganadosActuales || !avisoVacacionesEl) return;
  const dias = Number(diasPendientesInput.value);
  const excede = Number.isFinite(dias) && dias > ganadosActuales.total + 1e-9;
  avisoVacacionesEl.hidden = !excede;
  if (excede) {
    avisoVacacionesEl.textContent = `Has puesto ${numDias(dias)} días, más de los ${numDias(ganadosActuales.total)}`
      + ' que has ganado hasta el cese. Revísalo: el cálculo usará el número que escribas.';
  }
}
document.getElementById('fechaIngreso').addEventListener('change', actualizarVisibilidadVacaciones);
document.getElementById('fechaCese').addEventListener('change', actualizarVisibilidadVacaciones);

// --- Cálculo y render de resultado -----------------------------------------

let ultimoResultado = null;
let ultimoInputs = null;

const MOTIVO_LABEL = {
  renuncia_voluntaria: 'Renuncia voluntaria',
  despido_arbitrario: 'Despido arbitrario',
  mutuo_disenso: 'Mutuo disenso',
  fin_contrato_plazo_fijo: 'Fin de contrato a plazo fijo',
  despido_justificado: 'Despido justificado',
};

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(form);

  const inputs = {
    fechaIngreso: data.get('fechaIngreso'),
    fechaCese: data.get('fechaCese'),
    sueldoBasico: data.get('sueldoBasico'),
    recibeAsignacionFamiliar: data.get('recibeAsignacionFamiliar') === 'on',
    tieneVariable: data.get('tieneVariable') === 'on',
    variablePromedio: data.get('variablePromedio') || 0,
    regimenSalud: data.get('regimenSalud'),
    motivoCese: data.get('motivoCese'),
    tipoContrato: data.get('tipoContrato'),
    fechaFinContrato: data.get('fechaFinContrato') || null,
    diasPendientesNoGozados: fieldsetVacaciones.hidden ? 0 : data.get('diasPendientesNoGozados'),
    periodoPruebaDistinto: data.get('periodoPruebaDistinto') === 'si',
    periodoPruebaMeses: data.get('periodoPruebaMeses'),
  };

  if (!inputs.fechaIngreso || !inputs.fechaCese) return;

  const resultado = calcularLiquidacionTotal(inputs);
  ultimoResultado = resultado;
  ultimoInputs = inputs;
  renderResultado(resultado, inputs);
});

function renderDatosEntrada(inputs) {
  const cont = document.getElementById('datos-entrada');
  cont.innerHTML = construirDatosEntrada(inputs)
    .map(([label, valor]) => `<div class="dato-fila"><span class="dato-label">${label}</span><span class="dato-valor">${valor}</span></div>`)
    .join('');
}

function renderMemoriaCalculo(r, inputs) {
  const cont = document.getElementById('memoria-calculo');
  cont.innerHTML = construirMemoriaCalculo(r, inputs)
    .map(
      (s) => `
      <details class="memoria-modulo">
        <summary>${s.titulo}</summary>
        <ol>${s.lineas.map((l) => `<li>${l}</li>`).join('')}</ol>
      </details>`
    )
    .join('');
}

function renderResultado(r, inputs) {
  const seccion = document.getElementById('resultado');
  const tbody = document.getElementById('tabla-resumen-body');
  const advertenciasEl = document.getElementById('advertencias');
  tbody.innerHTML = '';
  advertenciasEl.innerHTML = '';

  renderDatosEntrada(inputs);
  renderMemoriaCalculo(r, inputs);

  const filas = [];

  filas.push(['CTS trunca pendiente de pago', r.cts.aplica ? r.cts.total : 0]);
  filas.push(['Gratificación trunca (incluye bono extraordinario)', r.gratificacion.aplica ? r.gratificacion.total : 0]);

  const vacacionesDetalle = [];
  if (r.vacaciones.diasNoGozados > 0) {
    vacacionesDetalle.push(`${numDias(r.vacaciones.diasNoGozados)} días × ${soles(r.vacaciones.valorDia)} por día`);
  }
  vacacionesDetalle.push(`Días ganados hasta el cese: ${numDias(r.vacaciones.ganados.total)}`);
  filas.push(['Vacaciones no gozadas', r.vacaciones.total, vacacionesDetalle]);

  if (inputs.motivoCese === 'despido_arbitrario') {
    filas.push(['Indemnización por despido arbitrario', r.indemnizacion.aplica ? r.indemnizacion.total : 0]);
    if (r.indemnizacion.topeAplicado) {
      advertenciasEl.innerHTML += `<p class="aviso">El cálculo sin tope (${soles(r.indemnizacion.montoSinTope)}) supera el máximo legal de ${r.constants.TOPE_INDEMNIZACION_REMUNERACIONES} remuneraciones; se aplica el tope de ${soles(r.indemnizacion.tope)}.</p>`;
    }
    if (r.indemnizacion.advertencia) {
      advertenciasEl.innerHTML += `<p class="aviso">${r.indemnizacion.advertencia}</p>`;
    }
    if (r.indemnizacion.motivo === 'contrato_ya_vencido') {
      advertenciasEl.innerHTML += `<p class="aviso">La fecha de cese es igual o posterior a la fecha de fin de contrato pactada: no corresponde indemnización por despido arbitrario, sino el término normal del contrato.</p>`;
    }
  }

  for (const [label, monto, detalle] of filas) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${label}</td><td>${soles(monto)}</td>`;
    tbody.appendChild(tr);
    if (detalle && detalle.length) {
      const trd = document.createElement('tr');
      trd.className = 'fila-detalle';
      trd.innerHTML = `<td colspan="2">${detalle.join(' · ')}</td>`;
      tbody.appendChild(trd);
    }
  }

  const trTotal = document.createElement('tr');
  trTotal.className = 'fila-total';
  trTotal.innerHTML = `<td>Total</td><td>${soles(r.total)}</td>`;
  tbody.appendChild(trTotal);

  document.getElementById('total-amount').textContent = soles(r.total);

  seccion.hidden = false;
  seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Generación de PDF -------------------------------------------------

const PDF_MARGIN_L = 14;
const PDF_MARGIN_R = 196;
const PDF_WIDTH = PDF_MARGIN_R - PDF_MARGIN_L;
const PDF_COLOR_PRIMARY = [15, 95, 76];
const PDF_COLOR_PRIMARY_DARK = [11, 74, 59];
const PDF_COLOR_TEXT = [26, 34, 51];
const PDF_COLOR_MUTED = [91, 100, 114];
const PDF_COLOR_BORDER = [226, 229, 234];
const PDF_COLOR_BG = [247, 248, 250];
const PDF_PAGE_BOTTOM = 283;

document.getElementById('btn-pdf').addEventListener('click', () => {
  if (!ultimoResultado || !window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const r = ultimoResultado;
  const inputs = ultimoInputs;

  function checkPageBreak(y, espacioNecesario) {
    if (y + espacioNecesario > PDF_PAGE_BOTTOM) {
      doc.addPage();
      return dibujarEncabezadoSecundario();
    }
    return y;
  }

  function dibujarEncabezadoSecundario() {
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLOR_MUTED);
    doc.text('Calculadora de Liquidación Laboral Perú', PDF_MARGIN_L, 12);
    doc.setDrawColor(...PDF_COLOR_BORDER);
    doc.line(PDF_MARGIN_L, 16, PDF_MARGIN_R, 16);
    return 26;
  }

  // --- Portada: banda de encabezado ---------------------------------------
  doc.setFillColor(...PDF_COLOR_PRIMARY);
  doc.rect(0, 0, 210, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('Tu liquidación estimada', PDF_MARGIN_L, 16);
  doc.setFontSize(10);
  doc.text('Calculadora de Liquidación Laboral Perú', PDF_MARGIN_L, 24);
  doc.setFontSize(9);
  doc.text(`Fecha de cálculo: ${new Date().toLocaleDateString('es-PE')}`, PDF_MARGIN_L, 30);

  let y = 46;

  // --- Total destacado -----------------------------------------------------
  doc.setFillColor(...PDF_COLOR_PRIMARY_DARK);
  doc.roundedRect(PDF_MARGIN_L, y, PDF_WIDTH, 20, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('TOTAL ESTIMADO', PDF_MARGIN_L + 8, y + 8);
  doc.setFontSize(17);
  doc.text(soles(r.total), PDF_MARGIN_R - 8, y + 15.5, { align: 'right' });
  y += 30;

  // --- Datos de entrada, en caja de dos columnas --------------------------
  doc.setTextColor(...PDF_COLOR_TEXT);
  doc.setFontSize(11);
  doc.text('Datos utilizados en el cálculo', PDF_MARGIN_L, y);
  y += 6;

  const datosEntrada = construirDatosEntrada(inputs);
  const filaAlto = 7;
  const colWidth = PDF_WIDTH / 2;
  const filasDatos = Math.ceil(datosEntrada.length / 2);
  const altoCaja = filasDatos * filaAlto + 4;

  doc.setDrawColor(...PDF_COLOR_BORDER);
  doc.setFillColor(...PDF_COLOR_BG);
  doc.roundedRect(PDF_MARGIN_L, y, PDF_WIDTH, altoCaja, 2, 2, 'FD');

  doc.setFontSize(8.5);
  datosEntrada.forEach(([label, valor], i) => {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const x = PDF_MARGIN_L + 4 + col * colWidth;
    const yFila = y + 6 + fila * filaAlto;
    doc.setTextColor(...PDF_COLOR_MUTED);
    doc.text(label, x, yFila);
    doc.setTextColor(...PDF_COLOR_TEXT);
    doc.text(String(valor), x, yFila + 4);
  });
  y += altoCaja + 12;

  // --- Desglose, tabla con sombreado alterno -------------------------------
  y = checkPageBreak(y, 20);
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLOR_TEXT);
  doc.text('Desglose', PDF_MARGIN_L, y);
  y += 6;

  const filasDesglose = [
    ['CTS trunca pendiente de pago', r.cts.aplica ? r.cts.total : 0],
    ['Gratificación trunca (incluye bono extraordinario)', r.gratificacion.aplica ? r.gratificacion.total : 0],
    ['Vacaciones no gozadas', r.vacaciones.total],
  ];
  if (inputs.motivoCese === 'despido_arbitrario') {
    filasDesglose.push(['Indemnización por despido arbitrario', r.indemnizacion.aplica ? r.indemnizacion.total : 0]);
  }

  filasDesglose.forEach(([label, monto], i) => {
    y = checkPageBreak(y, 9);
    if (i % 2 === 0) {
      doc.setFillColor(...PDF_COLOR_BG);
      doc.rect(PDF_MARGIN_L, y - 5, PDF_WIDTH, 8, 'F');
    }
    doc.setFontSize(9.5);
    doc.setTextColor(...PDF_COLOR_TEXT);
    doc.text(label, PDF_MARGIN_L + 3, y);
    doc.setFont(undefined, 'bold');
    doc.text(soles(monto), PDF_MARGIN_R - 3, y, { align: 'right' });
    doc.setFont(undefined, 'normal');
    y += 8;
  });

  y += 2;
  doc.setDrawColor(...PDF_COLOR_TEXT);
  doc.setLineWidth(0.6);
  doc.line(PDF_MARGIN_L, y, PDF_MARGIN_R, y);
  y += 8;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Total', PDF_MARGIN_L, y);
  doc.text(soles(r.total), PDF_MARGIN_R, y, { align: 'right' });
  doc.setFont(undefined, 'normal');
  y += 14;

  // --- Memoria de cálculo ---------------------------------------------------
  y = checkPageBreak(y, 16);
  doc.setFontSize(13);
  doc.setTextColor(...PDF_COLOR_TEXT);
  doc.text('¿Cómo se calculó?', PDF_MARGIN_L, y);
  y += 9;

  const memoria = construirMemoriaCalculo(r, inputs);
  memoria.forEach((seccion) => {
    y = checkPageBreak(y, 12);
    doc.setFontSize(10.5);
    doc.setTextColor(...PDF_COLOR_PRIMARY_DARK);
    doc.setFont(undefined, 'bold');
    doc.text(seccion.titulo, PDF_MARGIN_L, y);
    doc.setFont(undefined, 'normal');
    y += 6;

    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLOR_MUTED);
    seccion.lineas.forEach((linea) => {
      const lineasEnvueltas = doc.splitTextToSize(`• ${linea}`, PDF_WIDTH - 4);
      lineasEnvueltas.forEach((l) => {
        y = checkPageBreak(y, 6);
        doc.text(l, PDF_MARGIN_L + 2, y);
        y += 4.6;
      });
    });
    y += 4;
  });

  // --- Aviso legal ----------------------------------------------------------
  y = checkPageBreak(y, 20);
  doc.setDrawColor(...PDF_COLOR_BORDER);
  doc.line(PDF_MARGIN_L, y, PDF_MARGIN_R, y);
  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLOR_MUTED);
  const disclaimer = 'Aviso legal: esta herramienta ofrece un cálculo referencial basado en la normativa laboral peruana vigente y no constituye asesoría legal. Para un caso concreto, especialmente en despidos, consulta con un abogado laboralista.';
  doc.text(doc.splitTextToSize(disclaimer, PDF_WIDTH), PDF_MARGIN_L, y);

  doc.save('liquidacion-laboral-peru.pdf');
});
})();
