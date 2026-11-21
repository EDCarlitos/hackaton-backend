// RF-23 / RF-24: contador de impacto con metodología visible.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { FACTOR_KG_CO2_KM } = require('../src/modules/impacto/impacto.service');
const {
  api,
  pool,
  prepararBD,
  cerrarBD,
  crearUsuario,
  crearConductor,
  crearReserva,
  zonaDePrueba,
  publicarEnZona,
  auth,
} = require('./helpers');

before(prepararBD);
after(cerrarBD);

describe('GET /impacto', () => {
  it('cuenta solo reservas completadas y calcula CO₂ = km × factor', async () => {
    const c = await crearConductor();
    const p1 = await crearUsuario();
    const p2 = await crearUsuario();
    const viaje = await publicarEnZona(c, zonaDePrueba());
    await pool.query('UPDATE ucaribe.viajes SET distancia_km = 10 WHERE id = $1', [viaje.id]);
    await crearReserva(viaje.id, p1.usuario.id, 'completada');
    await crearReserva(viaje.id, p2.usuario.id, 'completada');
    // Otro viaje con reservas NO completadas: no cuenta.
    const otro = await publicarEnZona(c, zonaDePrueba(), { salida_en: new Date(Date.now() + 90 * 3_600_000).toISOString() });
    await crearReserva(otro.id, p1.usuario.id, 'confirmada');

    const conductor = await api().get('/impacto').set(auth(c.token)).expect(200);
    assert.deepEqual(conductor.body.mio, {
      viajes_compartidos: 1,
      asientos_ocupados: 2,
      km_compartidos: 20,
      co2_evitado_kg: Math.round(20 * FACTOR_KG_CO2_KM * 10) / 10,
    });

    const pasajero = await api().get('/impacto').set(auth(p1.token)).expect(200);
    assert.equal(pasajero.body.mio.asientos_ocupados, 1);
    assert.equal(pasajero.body.mio.km_compartidos, 10);
    assert.ok(pasajero.body.institucion.asientos_ocupados >= 2);
  });

  it('RF-24: trae fórmula, factor con fuente y supuestos, etiquetado como estimación', async () => {
    const { token } = await crearUsuario();
    const { body } = await api().get('/impacto').set(auth(token)).expect(200);
    const m = body.metodologia;
    assert.equal(m.etiqueta, 'Estimación');
    assert.match(m.formula, /km compartidos × factor/);
    assert.equal(m.factor_emision.valor, 0.249);
    assert.equal(m.factor_emision.unidad, 'kg CO₂/km');
    assert.match(m.factor_emision.fuente.url, /^https:\/\/www\.epa\.gov\//);
    assert.ok(m.supuestos.length >= 3);
    assert.deepEqual(body.mio, { viajes_compartidos: 0, asientos_ocupados: 0, km_compartidos: 0, co2_evitado_kg: 0 });
  });
});
