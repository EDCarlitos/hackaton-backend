const { describe, it, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mapas = require('../src/shared/maps');
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
afterEach(() => mock.restoreAll());

async function publicar(conductor, extra) {
  const res = await publicarViaje(conductor.token, extra);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.viaje;
}

const misViajes = (token, query = '') => api().get(`/viajes/mios${query}`).set(auth(token));

describe('GET /viajes/mios (RF-10)', () => {
  it('lista mis viajes con estado, solicitudes entrantes y confirmados', async () => {
    const c = await crearConductor();
    const otro = await crearConductor();
    const [p1, p2, p3] = [await crearUsuario(), await crearUsuario(), await crearUsuario()];

    const conReservas = await publicar(c, { salida_en: enHoras(5) });
    await publicar(c, { salida_en: enHoras(48) });
    await publicar(otro); // no debe aparecer

    await crearReserva(conReservas.id, p1.usuario.id, 'confirmada');
    await crearReserva(conReservas.id, p2.usuario.id, 'solicitada');
    await crearReserva(conReservas.id, p3.usuario.id, 'rechazada'); // no es "vigente"

    const res = await misViajes(c.token).expect(200);
    assert.equal(res.body.viajes.length, 2);
    const v = res.body.viajes.find((x) => x.id === conReservas.id);
    assert.equal(v.estado, 'abierto');
    assert.equal(v.solicitudes_pendientes, 1);
    assert.equal(v.pasajeros_confirmados, 1);
    assert.equal(v.reservas.length, 2);
    assert.equal(v.vehiculo.placa_o_descripcion, 'Auto de prueba');

    const pendiente = v.reservas.find((r) => r.estado === 'solicitada');
    assert.equal(pendiente.pasajero.id, p2.usuario.id);
    assert.equal(pendiente.pasajero.nombre_visible, 'Usuario Prueba');
    assert.equal(pendiente.recogida.texto, 'Parada de prueba');
    assert.equal(typeof pendiente.recogida.lat, 'number');
    assert.equal(pendiente.pasajero.correo, undefined, 'no expone el correo del pasajero');
  });

  it('filtra por estado y por próximos/pasados', async () => {
    const c = await crearConductor();
    const pronto = await publicar(c, { salida_en: enHoras(3) });
    const despues = await publicar(c, { salida_en: enHoras(50) });
    const cancelado = await publicar(c, { salida_en: enHoras(80) });
    await api().post(`/viajes/${cancelado.id}/cancelar`).set(auth(c.token)).send({}).expect(200);
    const pasado = await publicar(c, { salida_en: enHoras(100) });
    await pool.query("UPDATE ucaribe.viajes SET salida_en = now() - interval '2 days' WHERE id = $1", [pasado.id]);

    const ids = (res) => res.body.viajes.map((v) => v.id);

    assert.deepEqual(ids(await misViajes(c.token, '?estado=cancelado')), [cancelado.id]);
    assert.deepEqual(ids(await misViajes(c.token, '?estado=abierto,lleno&cuando=proximos')), [pronto.id, despues.id]);
    assert.deepEqual(ids(await misViajes(c.token, '?cuando=pasados')), [pasado.id]);
    assert.deepEqual(ids(await misViajes(c.token, '?limite=1')), [cancelado.id]); // todos: más reciente primero

    const malo = await misViajes(c.token, '?estado=volando&cuando=ayer&limite=0');
    assert.equal(malo.status, 400);
    assert.deepEqual(Object.keys(malo.body.error.detalles).sort(), ['cuando', 'estado', 'limite']);
  });
});

describe('GET /viajes/:id', () => {
  it('el conductor ve todas las reservas; otro usuario ve el viaje sin reservas', async () => {
    const c = await crearConductor();
    const viaje = await publicar(c);
    const p = await crearUsuario();
    await crearReserva(viaje.id, p.usuario.id, 'rechazada');
    await crearReserva(viaje.id, p.usuario.id, 'solicitada');

    const propio = await api().get(`/viajes/${viaje.id}`).set(auth(c.token)).expect(200);
    assert.equal(propio.body.viaje.reservas.length, 2);
    assert.equal(propio.body.viaje.conductor.id, c.usuario.id);

    const ajeno = await api().get(`/viajes/${viaje.id}`).set(auth(p.token)).expect(200);
    assert.equal(ajeno.body.viaje.reservas, undefined);
    assert.equal(ajeno.body.viaje.conductor.nombre_visible, 'Usuario Prueba');
    assert.ok(ajeno.body.viaje.ruta.polilinea);
  });

  it('404 VIAJE_NO_ENCONTRADO si no existe o el id no es válido', async () => {
    const { token } = await crearUsuario();
    for (const id of ['999999', 'abc', '0']) {
      const res = await api().get(`/viajes/${id}`).set(auth(token));
      assert.equal(res.status, 404, id);
      assert.equal(res.body.error.codigo, 'VIAJE_NO_ENCONTRADO');
    }
  });
});

describe('POST /viajes/:id/republicar (RF-08)', () => {
  it('clona origen, destino, ruta y asientos con nueva fecha, SIN consultar Google', async () => {
    const c = await crearConductor();
    const original = await publicar(c, { asientos_ofrecidos: 2, costo_referencia: 30 });
    const espia = mock.method(mapas, 'calcularRuta');
    const nuevaSalida = enHoras(72);

    const res = await api()
      .post(`/viajes/${original.id}/republicar`)
      .set(auth(c.token))
      .send({ salida_en: nuevaSalida });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const copia = res.body.viaje;
    assert.equal(espia.mock.callCount(), 0);
    assert.notEqual(copia.id, original.id);
    assert.equal(new Date(copia.salida_en).toISOString(), nuevaSalida);
    assert.equal(copia.estado, 'abierto');
    assert.equal(copia.asientos_disponibles, 2);
    for (const campo of ['origen', 'destino', 'ruta', 'asientos_ofrecidos', 'vehiculo_id', 'costo_referencia']) {
      assert.deepEqual(copia[campo], original[campo], campo);
    }
    const { rowCount } = await pool.query('SELECT 1 FROM ucaribe.viajes WHERE conductor_id = $1', [c.usuario.id]);
    assert.equal(rowCount, 2);
  });

  it('se puede republicar un viaje cancelado', async () => {
    const c = await crearConductor();
    const original = await publicar(c);
    await api().post(`/viajes/${original.id}/cancelar`).set(auth(c.token)).expect(200);
    const res = await api().post(`/viajes/${original.id}/republicar`).set(auth(c.token)).send({ salida_en: enHoras(26) });
    assert.equal(res.status, 201);
  });

  it('403 NO_ES_CONDUCTOR si no es mi viaje; 400 si falta salida_en', async () => {
    const c = await crearConductor();
    const original = await publicar(c);
    const otro = await crearConductor();

    const ajeno = await api()
      .post(`/viajes/${original.id}/republicar`)
      .set(auth(otro.token))
      .send({ salida_en: enHoras(50) });
    assert.equal(ajeno.status, 403);
    assert.equal(ajeno.body.error.codigo, 'NO_ES_CONDUCTOR');

    const sinFecha = await api().post(`/viajes/${original.id}/republicar`).set(auth(c.token)).send({});
    assert.equal(sinFecha.status, 400);
    assert.ok(sinFecha.body.error.detalles.salida_en);
  });
});

describe('POST /viajes/:id/cancelar (RF-11)', () => {
  it('cancela el viaje y sus reservas vigentes, y avisa a los pasajeros en la app', async () => {
    const c = await crearConductor();
    const viaje = await publicar(c, { destino: { lat: 21.2004, lng: -86.8226, texto: 'UCaribe' } });
    const confirmado = await crearUsuario();
    const pendiente = await crearUsuario();
    const rechazado = await crearUsuario();
    const rConf = await crearReserva(viaje.id, confirmado.usuario.id, 'confirmada');
    const rPend = await crearReserva(viaje.id, pendiente.usuario.id, 'solicitada');
    const rRech = await crearReserva(viaje.id, rechazado.usuario.id, 'rechazada');

    const res = await api()
      .post(`/viajes/${viaje.id}/cancelar`)
      .set(auth(c.token))
      .send({ motivo: 'Se ponchó una llanta' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.viaje.estado, 'cancelado');
    assert.ok(res.body.viaje.cancelado_en);
    assert.equal(res.body.viaje.motivo_cancelacion, 'Se ponchó una llanta');
    assert.equal(res.body.reservas_canceladas, 2);
    assert.equal(res.body.pasajeros_notificados, 2);

    // Reservas en la BD
    const { rows: reservas } = await pool.query('SELECT id, estado FROM ucaribe.reservas WHERE viaje_id = $1', [
      viaje.id,
    ]);
    const estado = Object.fromEntries(reservas.map((r) => [r.id, r.estado]));
    assert.equal(estado[rConf.id], 'cancelada');
    assert.equal(estado[rPend.id], 'cancelada');
    assert.equal(estado[rRech.id], 'rechazada');

    // El confirmado ve el aviso
    const avisos = await api().get('/notificaciones').set(auth(confirmado.token)).expect(200);
    assert.equal(avisos.body.no_leidas, 1);
    const [aviso] = avisos.body.notificaciones;
    assert.equal(aviso.tipo, 'viaje_cancelado');
    assert.equal(aviso.viaje_id, viaje.id);
    assert.match(aviso.mensaje, /Usuario Prueba canceló el viaje del .+ hacia UCaribe\. Motivo: Se ponchó una llanta/);

    // ...y lo marca como leído
    const leida = await api().post(`/notificaciones/${aviso.id}/leida`).set(auth(confirmado.token)).expect(200);
    assert.ok(leida.body.notificacion.leida_en);
    const despues = await api().get('/notificaciones?no_leidas=true').set(auth(confirmado.token)).expect(200);
    assert.equal(despues.body.no_leidas, 0);
    assert.equal(despues.body.notificaciones.length, 0);

    // El rechazado no recibe nada
    const nada = await api().get('/notificaciones').set(auth(rechazado.token)).expect(200);
    assert.equal(nada.body.notificaciones.length, 0);

    // Nadie más puede marcar el aviso ajeno
    const ajena = await api().post(`/notificaciones/${aviso.id}/leida`).set(auth(pendiente.token));
    assert.equal(ajena.status, 404);
    assert.equal(ajena.body.error.codigo, 'NOTIFICACION_NO_ENCONTRADA');
  });

  it('sin motivo ni body también funciona', async () => {
    const c = await crearConductor();
    const viaje = await publicar(c);
    const res = await api().post(`/viajes/${viaje.id}/cancelar`).set(auth(c.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.viaje.motivo_cancelacion, null);
    assert.equal(res.body.pasajeros_notificados, 0);
  });

  it('409 VIAJE_NO_CANCELABLE si ya está cancelado, en curso o finalizado', async () => {
    const c = await crearConductor();
    const viaje = await publicar(c);
    await api().post(`/viajes/${viaje.id}/cancelar`).set(auth(c.token)).expect(200);
    const otraVez = await api().post(`/viajes/${viaje.id}/cancelar`).set(auth(c.token));
    assert.equal(otraVez.status, 409);
    assert.equal(otraVez.body.error.codigo, 'VIAJE_NO_CANCELABLE');

    const enCurso = await publicar(c, { salida_en: enHoras(60) });
    await pool.query("UPDATE ucaribe.viajes SET estado = 'en_curso', iniciado_en = now() WHERE id = $1", [enCurso.id]);
    const res = await api().post(`/viajes/${enCurso.id}/cancelar`).set(auth(c.token));
    assert.equal(res.status, 409);
  });

  it('403 NO_ES_CONDUCTOR para otro usuario, y el viaje no cambia', async () => {
    const c = await crearConductor();
    const viaje = await publicar(c);
    const p = await crearUsuario();
    await crearReserva(viaje.id, p.usuario.id, 'confirmada');

    const res = await api().post(`/viajes/${viaje.id}/cancelar`).set(auth(p.token));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.codigo, 'NO_ES_CONDUCTOR');
    const { rows } = await pool.query('SELECT estado FROM ucaribe.viajes WHERE id = $1', [viaje.id]);
    assert.equal(rows[0].estado, 'abierto');
    const { rowCount } = await pool.query('SELECT 1 FROM ucaribe.notificaciones WHERE viaje_id = $1', [viaje.id]);
    assert.equal(rowCount, 0);
  });

  it('400 si el motivo pasa de 300 caracteres', async () => {
    const c = await crearConductor();
    const viaje = await publicar(c);
    const res = await api().post(`/viajes/${viaje.id}/cancelar`).set(auth(c.token)).send({ motivo: 'x'.repeat(301) });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.detalles.motivo);
  });
});
