const { describe, it, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
const mapas = require('../src/shared/maps');
const {
  api,
  pool,
  prepararBD,
  cerrarBD,
  crearUsuario,
  crearConductor,
  publicarViaje,
  auth,
  ORIGEN,
  DESTINO,
} = require('./helpers');

before(prepararBD);
after(cerrarBD);
afterEach(() => mock.restoreAll());

// Fecha (YYYY-MM-DD) y hora (HH:MM) en la zona de la app, para una fecha dada.
const enZona = (fecha) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: env.zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map(({ type, value }) => [type, value]),
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
};

// La hora actual siempre es válida para "Salgo hoy" (entra en la tolerancia de 5 min).
const horaActual = () => enZona(new Date()).hora;

async function crearTrayecto(conductor, extra = {}) {
  const res = await api()
    .post('/trayectos')
    .set(auth(conductor.token))
    .send({ nombre: 'Casa → UCaribe', origen: ORIGEN, destino: DESTINO, asientos: 3, hora_habitual: '07:00', ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.trayecto;
}

const viajesDe = async (conductorId) =>
  (await pool.query('SELECT * FROM ucaribe.viajes WHERE conductor_id = $1', [conductorId])).rows;

describe('POST /trayectos (guardar plantilla)', () => {
  it('con origen/destino: consulta la ruta una vez y la guarda en la plantilla', async () => {
    const c = await crearConductor();
    const espia = mock.method(mapas, 'calcularRuta');

    const t = await crearTrayecto(c);

    assert.equal(espia.mock.callCount(), 1);
    assert.equal(t.nombre, 'Casa → UCaribe');
    assert.equal(t.hora_habitual, '07:00');
    assert.equal(t.asientos, 3);
    assert.deepEqual(t.origen, ORIGEN);
    assert.equal(t.vehiculo.id, c.vehiculo.id);
    assert.ok(t.ruta.polilinea && t.ruta.distancia_km > 0 && t.ruta.duracion_min > 0);
    const { rows } = await pool.query('SELECT conductor_id, polilinea FROM ucaribe.trayectos WHERE id = $1', [t.id]);
    assert.equal(rows[0].conductor_id, c.usuario.id);
    assert.equal(rows[0].polilinea, t.ruta.polilinea);
  });

  it('desde un viaje propio: copia la ruta sin consultar Google', async () => {
    const c = await crearConductor();
    const { body } = await publicarViaje(c.token, { asientos_ofrecidos: 2 }).expect(201);
    const espia = mock.method(mapas, 'calcularRuta');

    const res = await api()
      .post('/trayectos')
      .set(auth(c.token))
      .send({ nombre: 'Del viaje', desde_viaje_id: body.viaje.id });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(espia.mock.callCount(), 0);
    assert.deepEqual(res.body.trayecto.ruta, body.viaje.ruta);
    assert.equal(res.body.trayecto.asientos, 2);
    assert.equal(res.body.trayecto.hora_habitual, null);
  });

  it('desde un viaje ajeno → 403 NO_ES_CONDUCTOR', async () => {
    const c = await crearConductor();
    const { body } = await publicarViaje(c.token).expect(201);
    const otro = await crearConductor();
    const res = await api()
      .post('/trayectos')
      .set(auth(otro.token))
      .send({ nombre: 'Robado', desde_viaje_id: body.viaje.id });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.codigo, 'NO_ES_CONDUCTOR');
  });

  it('400 por campo, sin consultar Google ni crear nada', async () => {
    const c = await crearConductor();
    const espia = mock.method(mapas, 'calcularRuta');
    const casos = [
      [{ nombre: '' }, 'nombre'],
      [{ hora_habitual: '25:00' }, 'hora_habitual'],
      [{ hora_habitual: '7:00' }, 'hora_habitual'],
      [{ asientos: 9 }, 'asientos'],
      [{ desde_viaje_id: 1 }, 'desde_viaje_id'], // junto con origen/destino
    ];
    for (const [extra, campo] of casos) {
      const res = await api()
        .post('/trayectos')
        .set(auth(c.token))
        .send({ nombre: 'X', origen: ORIGEN, destino: DESTINO, asientos: 3, ...extra });
      assert.equal(res.status, 400, JSON.stringify(extra));
      assert.ok(res.body.error.detalles[campo], JSON.stringify(res.body.error));
    }
    assert.equal(espia.mock.callCount(), 0);
    const { rowCount } = await pool.query('SELECT 1 FROM ucaribe.trayectos WHERE conductor_id = $1', [c.usuario.id]);
    assert.equal(rowCount, 0);
  });

  it('GET /trayectos lista solo las plantillas propias', async () => {
    const c = await crearConductor();
    const otro = await crearConductor();
    const t = await crearTrayecto(c);
    await crearTrayecto(otro);
    const res = await api().get('/trayectos').set(auth(c.token)).expect(200);
    assert.deepEqual(
      res.body.trayectos.map((x) => x.id),
      [t.id],
    );
  });
});

describe('"Salgo hoy" (RF-09)', () => {
  it('GET da el resumen para confirmar (fecha, hora, ruta, asientos) y NO publica', async () => {
    const c = await crearConductor();
    const t = await crearTrayecto(c);
    const hora = horaActual();

    const res = await api().get(`/trayectos/${t.id}/salgo-hoy?hora=${hora}`).set(auth(c.token));

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { borrador } = res.body;
    assert.deepEqual(enZona(new Date(borrador.salida_en)), enZona(new Date()));
    assert.deepEqual(borrador.ruta, t.ruta);
    assert.equal(borrador.asientos_ofrecidos, 3);
    assert.equal(borrador.vehiculo.id, c.vehiculo.id);
    assert.equal(borrador.trayecto_id, t.id);
    assert.equal((await viajesDe(c.usuario.id)).length, 0);

    const conAsientos = await api()
      .get(`/trayectos/${t.id}/salgo-hoy?hora=${hora}&asientos_ofrecidos=2`)
      .set(auth(c.token))
      .expect(200);
    assert.equal(conAsientos.body.borrador.asientos_ofrecidos, 2);
  });

  it('POST publica el viaje de hoy con la ruta de la plantilla, sin consultar Google', async () => {
    const c = await crearConductor();
    const t = await crearTrayecto(c);
    const espia = mock.method(mapas, 'calcularRuta');

    const res = await api()
      .post(`/trayectos/${t.id}/salgo-hoy`)
      .set(auth(c.token))
      .send({ hora: horaActual(), asientos_ofrecidos: 2 });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(espia.mock.callCount(), 0);
    const { viaje } = res.body;
    assert.equal(viaje.trayecto_id, t.id);
    assert.deepEqual(viaje.ruta, t.ruta);
    assert.deepEqual(viaje.origen, t.origen);
    assert.equal(viaje.asientos_ofrecidos, 2);
    assert.equal(enZona(new Date(viaje.salida_en)).dia, enZona(new Date()).dia);
    const [fila] = await viajesDe(c.usuario.id);
    assert.equal(fila.trayecto_id, t.id);

    // Doble clic: el segundo choca con el primero.
    const otraVez = await api().post(`/trayectos/${t.id}/salgo-hoy`).set(auth(c.token)).send({ hora: horaActual() });
    assert.equal(otraVez.status, 409);
    assert.equal(otraVez.body.error.codigo, 'VIAJE_TRASLAPADO');
  });

  it('400 HORA_YA_PASO si la hora de hoy ya pasó', async (t) => {
    const hace30 = new Date(Date.now() - 30 * 60_000);
    if (enZona(hace30).dia !== enZona(new Date()).dia) return t.skip('cerca de medianoche');
    const c = await crearConductor();
    const tr = await crearTrayecto(c);
    const res = await api().post(`/trayectos/${tr.id}/salgo-hoy`).set(auth(c.token)).send({ hora: enZona(hace30).hora });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.codigo, 'HORA_YA_PASO');
    assert.equal((await viajesDe(c.usuario.id)).length, 0);
  });

  it('400 si la plantilla no tiene hora habitual y no se manda hora', async () => {
    const c = await crearConductor();
    const t = await crearTrayecto(c, { hora_habitual: undefined });
    const res = await api().get(`/trayectos/${t.id}/salgo-hoy`).set(auth(c.token));
    assert.equal(res.status, 400);
    assert.ok(res.body.error.detalles.hora);
  });

  it('400 si se piden más asientos que los del vehículo', async () => {
    const c = await crearConductor({ asientos: 2 });
    const t = await crearTrayecto(c, { asientos: 2 });
    const res = await api()
      .post(`/trayectos/${t.id}/salgo-hoy`)
      .set(auth(c.token))
      .send({ hora: horaActual(), asientos_ofrecidos: 4 });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.detalles.asientos_ofrecidos);
  });

  it('plantilla ajena → 404 TRAYECTO_NO_ENCONTRADO', async () => {
    const c = await crearConductor();
    const t = await crearTrayecto(c);
    const otro = await crearUsuario();
    const res = await api().get(`/trayectos/${t.id}/salgo-hoy`).set(auth(otro.token));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.codigo, 'TRAYECTO_NO_ENCONTRADO');
  });
});

describe('DELETE /trayectos/:id', () => {
  it('borra la plantilla; los viajes ya publicados se quedan con trayecto_id NULL', async () => {
    const c = await crearConductor();
    const t = await crearTrayecto(c);
    const { body } = await api()
      .post(`/trayectos/${t.id}/salgo-hoy`)
      .set(auth(c.token))
      .send({ hora: horaActual() })
      .expect(201);

    await api().delete(`/trayectos/${t.id}`).set(auth(c.token)).expect(204);

    const { rows } = await pool.query('SELECT trayecto_id FROM ucaribe.viajes WHERE id = $1', [body.viaje.id]);
    assert.equal(rows[0].trayecto_id, null);
    const otraVez = await api().delete(`/trayectos/${t.id}`).set(auth(c.token));
    assert.equal(otraVez.status, 404);
  });
});
