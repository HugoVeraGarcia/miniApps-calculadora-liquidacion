const assert = require('node:assert/strict');
const { calcularLiquidacionTotal, calcularDiasVacacionesGanados, calcularVacaciones, parseISO } = require('../js/engine.js');

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
    // 5 meses y 29 dias ganan 5 x 2,5 + 29/12 = 14,9167 dias. Declararlos
    // todos tiene que dar exactamente lo que daban las "truncas" de antes:
    // (2500/12) x 5 + (2500/360) x 29 = 1243,06. Es la prueba de que el
    // cambio de modelo no movio el dinero, solo quien decide los dias.
    diasNoGozados: 14.916666666666666,
  });

  console.log('\n--- Caso 1: Renuncia voluntaria, <1 año ---');
  verificar('Gratificación trunca', r.gratificacion.total, 2709.86);
  verificar('CTS trunca', r.cts.total, 477.58);
  verificar('Vacaciones: los 14,92 días ganados', r.vacaciones.total, 1243.06);
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
    diasNoGozados: 30,
  });

  console.log('\n--- Caso 2: Despido arbitrario, con variable y asignación ---');
  verificar('Gratificación trunca', r.gratificacion.total, 2052.82);
  // El 1/6 para CTS usa la gratificación BASE (1883.32), sin el bono del 9%.
  verificar('CTS trunca', r.cts.total, 1872.97, 0.1);
  // 30 dias declarados x (4913/30) = 4913,00 exactos.
  verificar('Vacaciones: 30 días declarados', r.vacaciones.total, 4913.00, 0.1);
  verificar('Indemnización', r.indemnizacion.total, 26305.02, 0.5);
  // 2052,82 + 1872,97 + 4913,00 + 26305,02 = 35143,81
  verificar('Total', r.total, 35143.81, 0.5);
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
    diasNoGozados: 30,
  });

  console.log('\n--- Caso 3: Despido arbitrario, tope de 12 remuneraciones ---');
  verificar('Gratificación trunca', r.gratificacion.total, 0);
  // El semestre jul-dic 2026 se trabajó completo (6 meses): el 1/6 usa la
  // gratificación regular SIN bono (5000, no 5450 con bono).
  verificar('CTS trunca', r.cts.total, 972.22, 0.1);
  verificar('Vacaciones: 30 días declarados', r.vacaciones.total, 5000, 0.1);
  verificar('Indemnización (con tope)', r.indemnizacion.total, 60000);
  assert.equal(r.indemnizacion.topeAplicado, true, 'El tope debe activarse en el caso 3');
  verificar('Total', r.total, 65972.22, 0.5);
}

// --------------------------------------------------------------------------
// Caso 4 — El caso que destapó el fallo: alguien que SI salio de vacaciones
// durante el año en curso. Ingreso 02/03/2023, cese 30/10/2026, sueldo 7800
// con asignacion familiar. Antes el motor pagaba el año en curso entero
// (S/ 5.231,37) ademas de los dias declarados, aunque el trabajador ya
// hubiera descansado parte de ese año. Ahora paga solo lo que se declara.
// --------------------------------------------------------------------------
{
  const fechaIngreso = parseISO('2023-03-02');
  const fechaCese = parseISO('2026-10-30');
  const g = calcularDiasVacacionesGanados({ fechaIngreso, fechaCese });

  console.log('\n--- Caso 4: trabajador que sí descansó durante el año en curso ---');
  verificar('Años completos', g.añosCompletos, 3, 0);
  verificar('Días por los 3 años cerrados', g.porRecordsCerrados, 90, 0);
  // 7 meses y 28 dias: 7 x 2,5 + 28/12 = 17,5 + 2,3333 = 19,8333
  verificar('Días por el año en curso', g.porRecordEnCurso, 19.8333, 0.001);
  verificar('Días ganados en total', g.total, 109.8333, 0.001);

  const base = { fechaIngreso, fechaCese, sueldoBasico: 7800, recibeAsignacionFamiliar: true };
  const v = calcularVacaciones({ ...base, diasNoGozados: 32 });
  verificar('Valor de un día', v.valorDia, 263.7667, 0.001);
  // 7913/30 x 32 = 8.440,53. Y NADA mas: los 14 dias que si descanso no se
  // pagan, que es justo lo que antes se colaba por la puerta de las truncas.
  verificar('Pago por los 32 días declarados', v.total, 8440.53, 0.01);

  const sinDeclarar = calcularVacaciones({ ...base });
  verificar('Sin declarar días, no se paga nada', sinDeclarar.total, 0, 0);
  assert.equal(sinDeclarar.diasNoGozados, 0, 'Sin dato declarado no se supone ninguno');

  const exagerado = calcularVacaciones({ ...base, diasNoGozados: 200 });
  assert.equal(exagerado.excedeGanados, true, 'Declarar 200 días sobre 109,83 debe avisar');
  assert.equal(calcularVacaciones({ ...base, diasNoGozados: 109 }).excedeGanados, false,
    '109 días no excede los 109,83 ganados');

  // La firma antigua tiene que seguir funcionando.
  const conNombreViejo = calcularVacaciones({ ...base, diasPendientesNoGozados: 32 });
  verificar('El nombre antiguo del campo sigue valiendo', conNombreViejo.total, 8440.53, 0.01);
}

// --------------------------------------------------------------------------
// Caso 5 — Equivalencia: un día vale lo mismo venga del año en curso o de un
// año cerrado. Es lo que permite unificar todo en un solo número.
// --------------------------------------------------------------------------
{
  console.log('\n--- Caso 5: un día vale lo mismo venga de donde venga ---');
  const rem = 7913;
  verificar('(rem/12) x 1 mes  ==  (rem/30) x 2,5 días', rem / 12, (rem / 30) * 2.5, 0.0001);
  verificar('(rem/360) x 1 día ==  (rem/30) x 1/12 día', rem / 360, (rem / 30) * (1 / 12), 0.0001);
}

console.log(process.exitCode === 1 ? '\nHay diferencias — revisar.' : '\nTodos los casos coinciden con el cálculo manual.');
