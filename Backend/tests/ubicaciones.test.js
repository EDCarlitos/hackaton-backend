const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ejecutarCierre } = require('../src/jobs/cierreAutomatico');
const {
  api,
  pool,
  prepararBD,
  cerrarBD,
  crearUsuario,
  crearConductor,
  crearReserva,
  publicarViaje,
  enHoras,
  auth,
} = require('./helpers');

before(prepararBD);
after(cerrarBD);

const POS = { lat: 21.1801, lng: -86.8592, precision_m: 12.4 };
const ruta = (viajeId) => `/viajes/${viajeId}/ubicacion`;
const compartir = (token, viajeId, body = POS) => api().put(ruta(viajeId)).set(auth(token)).send(body);
const ver = (token, viajeId) => api().get(ruta(viajeId)).set(auth(token));

// Viaje que sale en `horas` con un pasajero confirmado, uno con solicitud y un extraño.
async function escenario(horas = 0.2) {
  const c = await crearConductor();
  const { body } = await publicarViaje(c.token, { salida_en: enHoras(horas) });
  const viaje = body.viaje;
  const [confirmado, solicitante, extrano] = await Promise.all([crearUsuario(), crearUsuario(), crearUsuario()]);
  await crearReserva(viaje.id, confirmado.usuario.id, 'confirmada');
  await crearReserva(viaje.id, solicitante.usuario.id, 'solicitada');
  return { c, viaje, confirmado, solicitante, extrano };
}

const filas = async (viajeId) =>
  (await pool.query('SELECT * FROM ucaribe.ubicaciones_viaje WHERE viaje_id = $1', [viajeId])).rows;

describe('Ubicación en vivo del conductor', () => {
  it('el conductor la comparte y el pasajero confirmado la ve; se guarda solo la última', async () => {
    const { c, viaje, confirmado } = await escenario();

    const r1 = await compartir(c.token, viaje.id);
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.deepEqual({ lat: r1.body.ubicacion.lat, lng: r1.body.ubicacion.lng }, { lat: POS.lat, lng: POS.lng });
    assert.equal(r1.body.ubicacion.precision_m, 12);

    await compartir(c.token, viaje.id, { lat: 21.19, lng: -86.84 }).expect(200);
    const visto = await ver(confirmado.token, viaje.id).expect(200);
    assert.equal(visto.body.compartiendo, true);
    assert.equal(visto.body.ubicacion.lat, 21.19);
    assert.equal(visto.body.ventana.abierta, true);

    // Sin historial: una sola fila por viaje, con la última posición.
    const f = await filas(viaje.id);
    assert.equal(f.length, 1);
    assert.equal(Number(f[0].lat), 21.19);
  });

  it('nadie más la ve: solicitante y extraños reciben 403; solo el conductor la comparte', async () => {
    const { c, viaje, confirmado, solicitante, extrano } = await escenario();
    await compartir(c.token, viaje.id).expect(200);

    for (const u of [solicitante, extrano]) {
      const r = await ver(u.token, viaje.id);
      assert.equal(r.status, 403);
      assert.equal(r.body.error.codigo, 'NO_PARTICIPA');
    }
    const ajeno = await compartir(confirmado.token, viaje.id);
    assert.equal(ajeno.status, 403);
    assert.equal(ajeno.body.error.codigo, 'NO_ES_CONDUCTOR');
    assert.equal(Number((await filas(viaje.id))[0].lat), POS.lat, 'el pasajero no pudo moverla');
  });

  it('409 FUERA_DE_HORARIO si falta más de 30 min para la salida', async () => {
    const { c, viaje, confirmado } = await escenario(5);
    const r = await compartir(c.token, viaje.id);
    assert.equal(r.status, 409);
    assert.equal(r.body.error.codigo, 'FUERA_DE_HORARIO');
    assert.ok(r.body.error.detalles.desde);
    assert.equal((await filas(viaje.id)).length, 0);

    const visto = await ver(confirmado.token, viaje.id).expect(200);
    assert.equal(visto.body.compartiendo, false);
    assert.equal(visto.body.ventana.abierta, false);
  });

  it('dejar de compartir la borra; con el viaje cancelado ya no se devuelve ni se acepta', async () => {
    const { c, viaje, confirmado } = await escenario();
    await compartir(c.token, viaje.id).expect(200);

    await api().delete(ruta(viaje.id)).set(auth(c.token)).expect(204);
    assert.equal((await filas(viaje.id)).length, 0);
    assert.equal((await ver(confirmado.token, viaje.id).expect(200)).body.ubicacion, null);

    await compartir(c.token, viaje.id).expect(200);
    await api().post(`/viajes/${viaje.id}/cancelar`).set(auth(c.token)).send({}).expect(200);
    const r = await compartir(c.token, viaje.id);
    assert.equal(r.status, 409);
    assert.equal(r.body.error.codigo, 'VIAJE_NO_ACTIVO');
    assert.equal((await ver(c.token, viaje.id).expect(200)).body.ubicacion, null);

    // El job de cierre borra la fila que quedó del viaje cancelado.
    await ejecutarCierre();
    assert.equal((await filas(viaje.id)).length, 0);
  });

  it('400 con coordenadas o precisión inválidas; 404 si el viaje no existe; 401 sin token', async () => {
    const { c, viaje } = await escenario();
    const malo = await compartir(c.token, viaje.id, { lat: 200, lng: -86.8 });
    assert.equal(malo.status, 400);
    assert.ok(malo.body.error.detalles.ubicacion);
    const malaPrecision = await compartir(c.token, viaje.id, { ...POS, precision_m: -3 });
    assert.equal(malaPrecision.status, 400);
    assert.ok(malaPrecision.body.error.detalles.precision_m);

    const noExiste = await ver(c.token, 999999999);
    assert.equal(noExiste.status, 404);
    assert.equal(noExiste.body.error.codigo, 'VIAJE_NO_ENCONTRADO');
    await api().get(ruta(viaje.id)).expect(401);
  });
});
