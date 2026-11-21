const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  api,
  pool,
  prepararBD,
  cerrarBD,
  crearUsuario,
  crearConductor,
  zonaDePrueba,
  publicarEnZona,
  enHoras,
  auth,
} = require('./helpers');

before(prepararBD);
after(cerrarBD);

const solicitar = (token, body) => api().post('/reservas').set(auth(token)).send(body);
const cancelar = (token, id) => api().post(`/reservas/${id}/cancelar`).set(auth(token));

// Viaje recién publicado en una zona propia + un pasajero.
async function escenario(extra = {}) {
  const zona = zonaDePrueba();
  const conductor = await crearConductor();
  const viaje = await publicarEnZona(conductor, zona, { salida_en: enHoras(24), ...extra });
  const pasajero = await crearUsuario();
  return { zona, conductor, viaje, pasajero };
}

const filaViaje = async (id) => (await pool.query('SELECT * FROM ucaribe.viajes WHERE id = $1', [id])).rows[0];
const reservasDe = async (viajeId) =>
  (await pool.query('SELECT * FROM ucaribe.reservas WHERE viaje_id = $1 ORDER BY id', [viajeId])).rows;
const avisosDe = async (usuarioId, tipo) =>
  (await pool.query('SELECT * FROM ucaribe.notificaciones WHERE usuario_id = $1 AND tipo = $2', [usuarioId, tipo])).rows;

describe('POST /reservas (solicitar asiento, RF-15)', () => {
  it('201: crea la solicitud con la distancia a pie y avisa al conductor', async () => {
    const { zona, conductor, viaje, pasajero } = await escenario();

    const res = await solicitar(pasajero.token, {
      viaje_id: viaje.id,
      recogida: zona.cerca,
      bajada: zona.cercaDelDestino,
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { reserva } = res.body;
    assert.equal(reserva.estado, 'solicitada');
    assert.equal(reserva.viaje_id, viaje.id);
    assert.deepEqual(reserva.recogida, zona.cerca);
    assert.deepEqual(reserva.bajada, { ...zona.cercaDelDestino, texto: null });
    assert.ok(reserva.distancia_pie_m > 70 && reserva.distancia_pie_m < 100);

    const [fila] = await reservasDe(viaje.id);
    assert.equal(fila.pasajero_id, pasajero.usuario.id);
    assert.equal(fila.distancia_pie_m, reserva.distancia_pie_m);
    // El asiento se descuenta al confirmar, no al solicitar.
    assert.equal((await filaViaje(viaje.id)).asientos_disponibles, viaje.asientos_disponibles);

    const [aviso] = await avisosDe(conductor.usuario.id, 'reserva_solicitada');
    assert.equal(aviso.viaje_id, viaje.id);
    assert.match(aviso.mensaje, /Usuario Prueba pidió un asiento/);

    // Aparece como solicitud entrante en "Mis viajes" del conductor.
    const mios = await api().get('/viajes/mios').set(auth(conductor.token)).expect(200);
    assert.equal(mios.body.viajes.find((v) => v.id === viaje.id).solicitudes_pendientes, 1);
  });

  it('una solicitud vigente por viaje: 409 RESERVA_DUPLICADA; tras cancelar se puede volver a pedir', async () => {
    const { zona, viaje, pasajero } = await escenario();
    const body = { viaje_id: viaje.id, recogida: zona.cerca };

    const primera = await solicitar(pasajero.token, body).expect(201);
    const repetida = await solicitar(pasajero.token, body);
    assert.equal(repetida.status, 409);
    assert.equal(repetida.body.error.codigo, 'RESERVA_DUPLICADA');

    await cancelar(pasajero.token, primera.body.reserva.id).expect(200);
    await solicitar(pasajero.token, body).expect(201);
    assert.equal((await reservasDe(viaje.id)).length, 2);
  });

  it('dos solicitudes simultáneas del mismo pasajero: solo una pasa', async () => {
    const { zona, viaje, pasajero } = await escenario();
    const body = { viaje_id: viaje.id, recogida: zona.cerca };
    const res = await Promise.all([solicitar(pasajero.token, body), solicitar(pasajero.token, body)]);
    assert.deepEqual(res.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await reservasDe(viaje.id)).length, 1);
  });

  it('409 ES_TU_VIAJE, VIAJE_LLENO y VIAJE_NO_DISPONIBLE; 404 si no existe', async () => {
    const { zona, conductor, viaje, pasajero } = await escenario();
    const body = { viaje_id: viaje.id, recogida: zona.cerca };

    const propio = await solicitar(conductor.token, body);
    assert.equal(propio.status, 409);
    assert.equal(propio.body.error.codigo, 'ES_TU_VIAJE');

    await pool.query("UPDATE ucaribe.viajes SET asientos_disponibles = 0, estado = 'lleno' WHERE id = $1", [viaje.id]);
    const lleno = await solicitar(pasajero.token, body);
    assert.equal(lleno.status, 409);
    assert.equal(lleno.body.error.codigo, 'VIAJE_LLENO');

    const otro = await escenario();
    await api().post(`/viajes/${otro.viaje.id}/cancelar`).set(auth(otro.conductor.token)).expect(200);
    const cancelado = await solicitar(pasajero.token, { viaje_id: otro.viaje.id, recogida: otro.zona.cerca });
    assert.equal(cancelado.status, 409);
    assert.equal(cancelado.body.error.codigo, 'VIAJE_NO_DISPONIBLE');

    const tercero = await escenario();
    await pool.query("UPDATE ucaribe.viajes SET salida_en = now() - interval '1 minute' WHERE id = $1", [tercero.viaje.id]);
    const salido = await solicitar(pasajero.token, { viaje_id: tercero.viaje.id, recogida: tercero.zona.cerca });
    assert.equal(salido.body.error.codigo, 'VIAJE_NO_DISPONIBLE');

    const noExiste = await solicitar(pasajero.token, { viaje_id: 999999, recogida: zona.cerca });
    assert.equal(noExiste.status, 404);
    assert.equal(noExiste.body.error.codigo, 'VIAJE_NO_ENCONTRADO');

    assert.equal((await reservasDe(viaje.id)).length, 0);
  });

  it('400 FUERA_DE_RUTA o SENTIDO_CONTRARIO (las mismas reglas que la búsqueda) y no crea nada', async () => {
    const { zona, viaje, pasajero } = await escenario();

    const lejos = await solicitar(pasajero.token, { viaje_id: viaje.id, recogida: zona.lejos });
    assert.equal(lejos.status, 400);
    assert.equal(lejos.body.error.codigo, 'FUERA_DE_RUTA');
    assert.match(lejos.body.error.detalles.recogida, /máximo 400 m/);

    const bajadaLejos = await solicitar(pasajero.token, { viaje_id: viaje.id, recogida: zona.cerca, bajada: zona.lejos });
    assert.equal(bajadaLejos.body.error.codigo, 'FUERA_DE_RUTA');
    assert.ok(bajadaLejos.body.error.detalles.bajada);

    const alReves = await solicitar(pasajero.token, {
      viaje_id: viaje.id,
      recogida: zona.cercaDelDestino,
      bajada: zona.cercaDelInicio,
    });
    assert.equal(alReves.status, 400);
    assert.equal(alReves.body.error.codigo, 'SENTIDO_CONTRARIO');

    assert.equal((await reservasDe(viaje.id)).length, 0);
  });

  it('400 VALIDACION por campo', async () => {
    const { token } = await crearUsuario();
    const res = await solicitar(token, { viaje_id: 'x', recogida: { lat: 200 }, bajada: 'casa' });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body.error.detalles).sort(), ['bajada', 'recogida', 'viaje_id']);
  });
});

describe('POST /reservas/:id/cancelar (RF-15)', () => {
  it('cancela una solicitud pendiente y avisa al conductor; los asientos no cambian', async () => {
    const { zona, conductor, viaje, pasajero } = await escenario();
    const { body } = await solicitar(pasajero.token, { viaje_id: viaje.id, recogida: zona.cerca }).expect(201);

    const res = await cancelar(pasajero.token, body.reserva.id);

    assert.equal(res.status, 200);
    assert.equal(res.body.reserva.estado, 'cancelada');
    assert.equal((await reservasDe(viaje.id))[0].estado, 'cancelada');
    assert.equal((await filaViaje(viaje.id)).asientos_disponibles, viaje.asientos_disponibles);
    const [aviso] = await avisosDe(conductor.usuario.id, 'reserva_cancelada');
    assert.match(aviso.mensaje, /canceló su solicitud/);
  });

  it('cancelar un lugar CONFIRMADO libera el asiento y reabre un viaje lleno', async () => {
    const { zona, conductor, viaje, pasajero } = await escenario({ asientos_ofrecidos: 1 });
    const { body } = await solicitar(pasajero.token, { viaje_id: viaje.id, recogida: zona.cerca }).expect(201);
    // Confirmación simulada (el endpoint del conductor es de otro requisito).
    await pool.query("UPDATE ucaribe.reservas SET estado = 'confirmada', respondida_en = now() WHERE id = $1", [
      body.reserva.id,
    ]);
    await pool.query("UPDATE ucaribe.viajes SET asientos_disponibles = 0, estado = 'lleno' WHERE id = $1", [viaje.id]);

    await cancelar(pasajero.token, body.reserva.id).expect(200);

    const v = await filaViaje(viaje.id);
    assert.equal(v.asientos_disponibles, 1);
    assert.equal(v.estado, 'abierto');
    const [aviso] = await avisosDe(conductor.usuario.id, 'reserva_cancelada');
    assert.match(aviso.mensaje, /canceló su lugar/);
  });

  it('409 RESERVA_NO_CANCELABLE si el viaje ya salió o la reserva ya no está vigente', async () => {
    const { zona, viaje, pasajero } = await escenario();
    const { body } = await solicitar(pasajero.token, { viaje_id: viaje.id, recogida: zona.cerca }).expect(201);

    await pool.query("UPDATE ucaribe.viajes SET salida_en = now() - interval '1 minute' WHERE id = $1", [viaje.id]);
    const salido = await cancelar(pasajero.token, body.reserva.id);
    assert.equal(salido.status, 409);
    assert.equal(salido.body.error.codigo, 'RESERVA_NO_CANCELABLE');
    assert.equal((await reservasDe(viaje.id))[0].estado, 'solicitada');

    const otro = await escenario();
    const r = await solicitar(pasajero.token, { viaje_id: otro.viaje.id, recogida: otro.zona.cerca }).expect(201);
    await cancelar(pasajero.token, r.body.reserva.id).expect(200);
    const dosVeces = await cancelar(pasajero.token, r.body.reserva.id);
    assert.equal(dosVeces.status, 409);
    assert.equal(dosVeces.body.error.codigo, 'RESERVA_NO_CANCELABLE');
  });

  it('404 RESERVA_NO_ENCONTRADA si es de otro pasajero o no existe', async () => {
    const { zona, viaje, pasajero } = await escenario();
    const { body } = await solicitar(pasajero.token, { viaje_id: viaje.id, recogida: zona.cerca }).expect(201);
    const intruso = await crearUsuario();

    for (const id of [body.reserva.id, 999999, 'abc']) {
      const res = await cancelar(intruso.token, id);
      assert.equal(res.status, 404, String(id));
      assert.equal(res.body.error.codigo, 'RESERVA_NO_ENCONTRADA');
    }
    assert.equal((await reservasDe(viaje.id))[0].estado, 'solicitada');
  });
});

describe('GET /reservas/mias', () => {
  it('lista mis reservas con el resumen del viaje y filtra próximas/pasadas', async () => {
    const a = await escenario();
    const b = await escenario({ salida_en: enHoras(30) }); // otra hora: RF-22 no deja dos que se crucen
    const p = await crearUsuario();
    const ra = await solicitar(p.token, { viaje_id: a.viaje.id, recogida: a.zona.cerca }).expect(201);
    await solicitar(p.token, { viaje_id: b.viaje.id, recogida: b.zona.cerca }).expect(201);
    await pool.query("UPDATE ucaribe.viajes SET salida_en = now() - interval '1 day' WHERE id = $1", [b.viaje.id]);

    const todas = await api().get('/reservas/mias').set(auth(p.token)).expect(200);
    assert.equal(todas.body.reservas.length, 2);

    const proximas = await api().get('/reservas/mias?cuando=proximas').set(auth(p.token)).expect(200);
    assert.equal(proximas.body.reservas.length, 1);
    const [r] = proximas.body.reservas;
    assert.equal(r.id, ra.body.reserva.id);
    assert.equal(r.viaje.id, a.viaje.id);
    assert.equal(r.viaje.conductor.nombre_visible, 'Usuario Prueba');
    assert.ok(r.viaje.ruta.polilinea);

    const malo = await api().get('/reservas/mias?cuando=ayer').set(auth(p.token));
    assert.equal(malo.status, 400);
  });
});
