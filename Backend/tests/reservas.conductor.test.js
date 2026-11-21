// RF-16 a RF-22: el conductor responde solicitudes; cupo, llenado y traslapes.
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
const aceptar = (token, id) => api().post(`/reservas/${id}/aceptar`).set(auth(token));
const rechazar = (token, id) => api().post(`/reservas/${id}/rechazar`).set(auth(token));

const filaViaje = async (id) => (await pool.query('SELECT * FROM ucaribe.viajes WHERE id = $1', [id])).rows[0];
const estadoReserva = async (id) =>
  (await pool.query('SELECT estado FROM ucaribe.reservas WHERE id = $1', [id])).rows[0].estado;
const avisos = async (usuarioId, tipo) =>
  (await pool.query('SELECT * FROM ucaribe.notificaciones WHERE usuario_id = $1 AND tipo = $2', [usuarioId, tipo])).rows;

// Viaje con N asientos y M pasajeros con solicitud pendiente.
async function viajeConSolicitudes({ asientos = 3, solicitudes = 1, salida = enHoras(24) } = {}) {
  const zona = zonaDePrueba();
  const conductor = await crearConductor();
  const viaje = await publicarEnZona(conductor, zona, { salida_en: salida, asientos_ofrecidos: asientos });
  const pasajeros = [];
  for (let i = 0; i < solicitudes; i++) {
    const p = await crearUsuario();
    const { body } = await solicitar(p.token, { viaje_id: viaje.id, recogida: zona.cerca }).expect(201);
    pasajeros.push({ ...p, reserva: body.reserva });
  }
  return { zona, conductor, viaje, pasajeros };
}

describe('POST /reservas/:id/aceptar (RF-16, RF-17)', () => {
  it('confirma la reserva, descuenta un asiento y avisa al pasajero', async () => {
    const { conductor, viaje, pasajeros } = await viajeConSolicitudes({ asientos: 3 });
    const [p] = pasajeros;

    const res = await aceptar(conductor.token, p.reserva.id);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.reserva.estado, 'confirmada');
    assert.ok(res.body.reserva.respondida_en);
    assert.deepEqual(res.body.viaje, { id: viaje.id, estado: 'abierto', asientos_disponibles: 2, asientos_ofrecidos: 3 });
    assert.equal(res.body.rechazadas_automaticamente, 0);
    assert.equal((await filaViaje(viaje.id)).asientos_disponibles, 2);
    const [aviso] = await avisos(p.usuario.id, 'reserva_confirmada');
    assert.match(aviso.mensaje, /aceptó tu solicitud/);
  });

  it('RF-21: al llenarse, rechaza solas las demás solicitudes y les avisa', async () => {
    const { conductor, viaje, pasajeros } = await viajeConSolicitudes({ asientos: 1, solicitudes: 3 });
    const [elegido, otro1, otro2] = pasajeros;

    const res = await aceptar(conductor.token, elegido.reserva.id).expect(200);

    assert.equal(res.body.viaje.estado, 'lleno');
    assert.equal(res.body.viaje.asientos_disponibles, 0);
    assert.equal(res.body.rechazadas_automaticamente, 2);
    assert.equal(await estadoReserva(otro1.reserva.id), 'rechazada');
    assert.equal(await estadoReserva(otro2.reserva.id), 'rechazada');
    assert.equal((await avisos(otro1.usuario.id, 'reserva_rechazada')).length, 1);

    // Ya no se puede aceptar a nadie más.
    const tarde = await aceptar(conductor.token, otro1.reserva.id);
    assert.equal(tarde.status, 409);
    assert.equal(tarde.body.error.codigo, 'RESERVA_NO_PENDIENTE');
  });

  it('RF-19: un viaje lleno deja de aparecer en la búsqueda', async () => {
    const { zona, conductor, viaje, pasajeros } = await viajeConSolicitudes({ asientos: 1 });
    const buscador = await crearUsuario();
    const url = `/viajes/buscar?recogida_lat=${zona.cerca.lat}&recogida_lng=${zona.cerca.lng}&salida_en=${encodeURIComponent(viaje.salida_en)}`;

    const antes = await api().get(url).set(auth(buscador.token)).expect(200);
    assert.ok(antes.body.resultados.some((r) => r.viaje_id === viaje.id));

    await aceptar(conductor.token, pasajeros[0].reserva.id).expect(200);
    const despues = await api().get(url).set(auth(buscador.token)).expect(200);
    assert.ok(!despues.body.resultados.some((r) => r.viaje_id === viaje.id));
  });

  it('aceptaciones simultáneas del último asiento: solo una gana (RNF-05)', async () => {
    const { conductor, viaje, pasajeros } = await viajeConSolicitudes({ asientos: 1, solicitudes: 2 });
    const res = await Promise.all(pasajeros.map((p) => aceptar(conductor.token, p.reserva.id)));

    assert.deepEqual(res.map((r) => r.status).sort(), [200, 409]);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM ucaribe.reservas WHERE viaje_id = $1 AND estado = 'confirmada'",
      [viaje.id],
    );
    assert.equal(rows[0].n, 1);
    assert.equal((await filaViaje(viaje.id)).asientos_disponibles, 0);
  });

  it('RF-17: la BD rechaza más confirmadas que asientos aunque se salte la API (trigger)', async () => {
    const { viaje, pasajeros } = await viajeConSolicitudes({ asientos: 1, solicitudes: 2 });
    await pool.query("UPDATE ucaribe.reservas SET estado = 'confirmada' WHERE id = $1", [pasajeros[0].reserva.id]);
    await assert.rejects(
      pool.query("UPDATE ucaribe.reservas SET estado = 'confirmada' WHERE id = $1", [pasajeros[1].reserva.id]),
      (err) => err.code === '23514' && err.constraint === 'chk_cupo_confirmadas',
    );
    assert.equal(await estadoReserva(pasajeros[1].reserva.id), 'solicitada');
    assert.ok(viaje.id);
  });

  it('solo el conductor del viaje responde: otro usuario o el pasajero reciben 404', async () => {
    const { viaje, pasajeros } = await viajeConSolicitudes();
    const intruso = await crearConductor();
    for (const token of [intruso.token, pasajeros[0].token]) {
      const res = await aceptar(token, pasajeros[0].reserva.id);
      assert.equal(res.status, 404);
      assert.equal(res.body.error.codigo, 'RESERVA_NO_ENCONTRADA');
    }
    assert.equal((await filaViaje(viaje.id)).asientos_disponibles, viaje.asientos_disponibles);
  });

  it('409 VIAJE_NO_DISPONIBLE si el viaje ya salió o se canceló', async () => {
    const { conductor, viaje, pasajeros } = await viajeConSolicitudes({ solicitudes: 2 });
    await pool.query("UPDATE ucaribe.viajes SET salida_en = now() - interval '1 minute' WHERE id = $1", [viaje.id]);
    const res = await aceptar(conductor.token, pasajeros[0].reserva.id);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'VIAJE_NO_DISPONIBLE');
    assert.equal(await estadoReserva(pasajeros[0].reserva.id), 'solicitada');
  });
});

describe('POST /reservas/:id/rechazar (RF-16)', () => {
  it('rechaza, no toca los asientos y avisa al pasajero; no se puede responder dos veces', async () => {
    const { conductor, viaje, pasajeros } = await viajeConSolicitudes();
    const [p] = pasajeros;

    const res = await rechazar(conductor.token, p.reserva.id).expect(200);
    assert.equal(res.body.reserva.estado, 'rechazada');
    assert.equal((await filaViaje(viaje.id)).asientos_disponibles, viaje.asientos_disponibles);
    assert.equal((await avisos(p.usuario.id, 'reserva_rechazada')).length, 1);

    const otraVez = await aceptar(conductor.token, p.reserva.id);
    assert.equal(otraVez.status, 409);
    assert.equal(otraVez.body.error.codigo, 'RESERVA_NO_PENDIENTE');
  });
});

describe('GET /reservas/:id (RF-18)', () => {
  it('pasajero y conductor ven el estado y el punto de recogida acordado; nadie más', async () => {
    const { zona, conductor, viaje, pasajeros } = await viajeConSolicitudes();
    const [p] = pasajeros;
    await aceptar(conductor.token, p.reserva.id).expect(200);

    for (const [token, soy] of [
      [p.token, 'pasajero'],
      [conductor.token, 'conductor'],
    ]) {
      const { body } = await api().get(`/reservas/${p.reserva.id}`).set(auth(token)).expect(200);
      assert.equal(body.reserva.estado, 'confirmada');
      assert.equal(body.reserva.soy, soy);
      assert.deepEqual(body.reserva.recogida, zona.cerca);
      assert.ok(Math.abs(body.reserva.punto_abordaje.lng - zona.origen.lng) < 1e-5, 'el punto acordado está sobre la ruta');
      assert.equal(body.reserva.viaje.id, viaje.id);
      assert.equal(body.reserva.pasajero.id, p.usuario.id);
    }

    // El conductor también lo ve en el detalle del viaje.
    const det = await api().get(`/viajes/${viaje.id}`).set(auth(conductor.token)).expect(200);
    const r = det.body.viaje.reservas.find((x) => x.id === p.reserva.id);
    assert.equal(r.estado, 'confirmada');
    assert.ok(r.punto_abordaje);

    // Y el pasajero, en el detalle del viaje (mi_reserva).
    const suyo = await api().get(`/viajes/${viaje.id}`).set(auth(p.token)).expect(200);
    assert.equal(suyo.body.viaje.mi_reserva.estado, 'confirmada');

    const intruso = await crearUsuario();
    await api().get(`/reservas/${p.reserva.id}`).set(auth(intruso.token)).expect(404);
  });
});

describe('RF-22: sin reservas activas que se crucen en el tiempo', () => {
  it('bloquea la segunda solicitud si los viajes se traslapan; permite otra hora', async () => {
    const p = await crearUsuario();
    const a = await viajeConSolicitudes({ solicitudes: 0, salida: enHoras(48) });
    const b = await viajeConSolicitudes({ solicitudes: 0, salida: enHoras(48 + 10 / 60) }); // 10 min después
    const c = await viajeConSolicitudes({ solicitudes: 0, salida: enHoras(52) }); // 4 h después

    await solicitar(p.token, { viaje_id: a.viaje.id, recogida: a.zona.cerca }).expect(201);

    const choque = await solicitar(p.token, { viaje_id: b.viaje.id, recogida: b.zona.cerca });
    assert.equal(choque.status, 409);
    assert.equal(choque.body.error.codigo, 'RESERVA_TRASLAPADA');

    await solicitar(p.token, { viaje_id: c.viaje.id, recogida: c.zona.cerca }).expect(201);
  });

  it('si la primera se cancela o la rechazan, ya puede pedir la otra', async () => {
    const p = await crearUsuario();
    const a = await viajeConSolicitudes({ solicitudes: 0, salida: enHoras(60) });
    const b = await viajeConSolicitudes({ solicitudes: 0, salida: enHoras(60 + 5 / 60) });
    const { body } = await solicitar(p.token, { viaje_id: a.viaje.id, recogida: a.zona.cerca }).expect(201);

    await rechazar(a.conductor.token, body.reserva.id).expect(200);
    await solicitar(p.token, { viaje_id: b.viaje.id, recogida: b.zona.cerca }).expect(201);
  });
});
