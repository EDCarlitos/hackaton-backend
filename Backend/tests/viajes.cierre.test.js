// RF-20: cierre automático de viajes vencidos.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const viajesService = require('../src/modules/viajes/viajes.service');
const { ejecutarCierre } = require('../src/jobs/cierreAutomatico');
const {
  pool,
  prepararBD,
  cerrarBD,
  crearUsuario,
  crearConductor,
  crearReserva,
  zonaDePrueba,
  publicarEnZona,
  enHoras,
} = require('./helpers');

before(prepararBD);
after(cerrarBD);

const TENANT = { schema: 'ucaribe' };
const filaViaje = async (id) => (await pool.query('SELECT * FROM ucaribe.viajes WHERE id = $1', [id])).rows[0];
const estados = async (viajeId) =>
  (await pool.query('SELECT pasajero_id, estado FROM ucaribe.reservas WHERE viaje_id = $1', [viajeId])).rows;

// Publica un viaje y luego mueve su salida a `minutosAtras` en el pasado.
async function viajeQueSalioHace(minutosAtras) {
  const c = await crearConductor();
  const viaje = await publicarEnZona(c, zonaDePrueba(), { salida_en: enHoras(10) });
  await pool.query('UPDATE ucaribe.viajes SET salida_en = now() - make_interval(mins => $2) WHERE id = $1', [
    viaje.id,
    minutosAtras,
  ]);
  return viaje;
}

describe('cierre automático (RF-20)', () => {
  it('cierra los viajes con salida + margen vencida: confirmadas → completada, solicitadas → expirada', async () => {
    const viaje = await viajeQueSalioHace(viajesService.MARGEN_CIERRE_MIN + 5);
    const [conf, pend] = [await crearUsuario(), await crearUsuario()];
    await crearReserva(viaje.id, conf.usuario.id, 'confirmada');
    await crearReserva(viaje.id, pend.usuario.id, 'solicitada');

    const r = await viajesService.cerrarVencidos(TENANT);

    assert.ok(r.viajes >= 1 && r.completadas >= 1 && r.expiradas >= 1, JSON.stringify(r));
    const v = await filaViaje(viaje.id);
    assert.equal(v.estado, 'finalizado');
    assert.ok(v.finalizado_en && v.iniciado_en);
    const porPasajero = Object.fromEntries((await estados(viaje.id)).map((x) => [x.pasajero_id, x.estado]));
    assert.equal(porPasajero[conf.usuario.id], 'completada');
    assert.equal(porPasajero[pend.usuario.id], 'expirada');
  });

  it('dentro del margen no cierra, pero las solicitudes de un viaje que ya salió expiran', async () => {
    const viaje = await viajeQueSalioHace(5);
    const [conf, pend] = [await crearUsuario(), await crearUsuario()];
    await crearReserva(viaje.id, conf.usuario.id, 'confirmada');
    await crearReserva(viaje.id, pend.usuario.id, 'solicitada');

    await viajesService.cerrarVencidos(TENANT);

    assert.equal((await filaViaje(viaje.id)).estado, 'abierto');
    const porPasajero = Object.fromEntries((await estados(viaje.id)).map((x) => [x.pasajero_id, x.estado]));
    assert.equal(porPasajero[conf.usuario.id], 'confirmada');
    assert.equal(porPasajero[pend.usuario.id], 'expirada');
  });

  it('no toca viajes futuros ni cancelados', async () => {
    const c = await crearConductor();
    const futuro = await publicarEnZona(c, zonaDePrueba(), { salida_en: enHoras(5) });
    const cancelado = await viajeQueSalioHace(500);
    await pool.query("UPDATE ucaribe.viajes SET estado = 'cancelado', cancelado_en = now() WHERE id = $1", [cancelado.id]);

    await viajesService.cerrarVencidos(TENANT);

    assert.equal((await filaViaje(futuro.id)).estado, 'abierto');
    assert.equal((await filaViaje(cancelado.id)).estado, 'cancelado');
  });

  it('el job recorre todas las instituciones activas', async () => {
    const viaje = await viajeQueSalioHace(viajesService.MARGEN_CIERRE_MIN + 1);
    await ejecutarCierre();
    assert.equal((await filaViaje(viaje.id)).estado, 'finalizado');
  });
});
