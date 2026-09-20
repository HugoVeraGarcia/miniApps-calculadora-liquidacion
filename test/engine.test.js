const assert = require('node:assert/strict');
const { calcularLiquidacionTotal } = require('../js/engine.js');

function cerca(actual, esperado, tolerancia = 0.05) {
  return Math.abs(actual - esperado) <= tolerancia;
}

function verificar(nombre, actual, esperado, tolerancia = 0.05) {
  const ok = cerca(actual, esperado, tolerancia);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${nombre}: esperado ${esperado.toFixed(2)}, obtenido ${actual.toFixed(2)}`);
  if (!ok) process.exitCode = 1;
}

// --------------------------------------------------------------------------
// Caso 1 — Renuncia voluntaria, antigüedad menor a 1 año
// --------------------------------------------------------------------------
{
  const r = calcularLiquidacionTotal({
    fechaIngreso: '2026-01-01',
    fechaCese: '2026-06-30',
    sueldoBasico: 2500,
    recibeAsignacionFamiliar: false,
    tieneVariable: false,
    regimenSalud: 'EsSalud',
    motivoCese: 'renuncia_voluntaria',
    tipoContrato: 'indeterminado',
    gozoUltimoRecordCompleto: true,
  });

  console.log('\n--- Caso 1: Renuncia voluntaria, <1 año ---');
  verificar('Gratificación trunca', r.gratificacion.total, 2709.86);
  verificar('CTS trunca', r.cts.total, 477.58);
  verificar('Vacaciones truncas', r.vacaciones.total, 1243.06);
  verificar('Indemnización', r.indemnizacion.total, 0);
  verificar('Total', r.total, 4430.50, 0.1);
}

// --------------------------------------------------------------------------
// Caso 2 — Despido arbitrario, con asignación familiar y comisiones
// --------------------------------------------------------------------------
{
  const r = calcularLiquidacionTotal({
    fechaIngreso: '2023-02-15',
    fechaCese: '2026-09-10',
    sueldoBasico: 4000,
    recibeAsignacionFamiliar: true,
    tieneVariable: true,
    variablePromedio: 800,
    regimenSalud: 'EsSalud',
    motivoCese: 'despido_arbitrario',
    tipoContrato: 'indeterminado',
  });

  console.log('\n--- Caso 2: Despido arbitrario, con variable y asignación ---');
  verificar('Gratificación trunca', r.gratificacion.total, 2052.82);
  // El 1/6 para CTS usa la gratificación BASE (1883.32), sin el bono del 9%.
  verificar('CTS trunca', r.cts.total, 1872.97, 0.1);
  verificar('Vacaciones (truncas + no gozadas)', r.vacaciones.total, 7710.68, 0.1);
  verificar('Indemnización', r.indemnizacion.total, 26305.02, 0.5);
  verificar('Total', r.total, 37941.49, 0.5);
}

// --------------------------------------------------------------------------
// Caso 3 — Despido arbitrario, antigüedad alta: se activa el tope de 12 rem.
// --------------------------------------------------------------------------
{
  const r = calcularLiquidacionTotal({
    fechaIngreso: '2016-01-01',
    fechaCese: '2027-01-01',
    sueldoBasico: 5000,
    recibeAsignacionFamiliar: false,
    tieneVariable: false,
    regimenSalud: 'EsSalud',
    motivoCese: 'despido_arbitrario',
    tipoContrato: 'indeterminado',
  });

  console.log('\n--- Caso 3: Despido arbitrario, tope de 12 remuneraciones ---');
  verificar('Gratificación trunca', r.gratificacion.total, 0);
  // El semestre jul-dic 2026 se trabajó completo (6 meses): el 1/6 usa la
  // gratificación regular SIN bono (5000, no 5450 con bono).
  verificar('CTS trunca', r.cts.total, 972.22, 0.1);
  verificar('Vacaciones (no gozadas simple)', r.vacaciones.total, 5000, 0.1);
  verificar('Indemnización (con tope)', r.indemnizacion.total, 60000);
  assert.equal(r.indemnizacion.topeAplicado, true, 'El tope debe activarse en el caso 3');
  verificar('Total', r.total, 65972.22, 0.5);
}

console.log(process.exitCode === 1 ? '\nHay diferencias — revisar.' : '\nTodos los casos coinciden con el cálculo manual.');
