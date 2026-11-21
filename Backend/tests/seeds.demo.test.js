// Los datos demo de ucaribe (src/db/seeds/tenant/ucaribe) se pueden usar desde la API.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDatabase } = require('../src/db/migrate');
const { api, pool, prepararBD, cerrarBD, auth } = require('./helpers');

before(prepararBD);
after(cerrarBD);

const login = async (correo) =>
  (await api().post('/auth/login').send({ correo, password: 'secreta123' }).expect(200)).body.token;

describe('datos demo de ucaribe', () => {
  it('Ana inicia sesión y ve sus viajes con una solicitud entrante', async () => {
    const token = await login('ana.conductora@ucaribe.edu.mx');
    const { body } = await api().get('/viajes/mios').set(auth(token)).expect(200);

    assert.deepEqual(body.viajes.map((v) => v.estado).sort(), ['abierto', 'cancelado', 'finalizado']);
    const manana = body.viajes.find((v) => v.estado === 'abierto');
    assert.equal(manana.solicitudes_pendientes, 1);
    assert.equal(manana.pasajeros_confirmados, 1);

    const trayectos = await api().get('/trayectos').set(auth(token)).expect(200);
    assert.equal(trayectos.body.trayectos.length, 2);
  });

  it('Sofía tiene el aviso de viaje cancelado sin leer', async () => {
    const token = await login('sofia.pasajera@ucaribe.edu.mx');
    const { body } = await api().get('/notificaciones').set(auth(token)).expect(200);
    assert.equal(body.no_leidas, 1);
    assert.equal(body.notificaciones[0].tipo, 'viaje_cancelado');
  });

  it('Ana puede republicar su viaje de ayer (RF-08) con los datos demo', async () => {
    const token = await login('ana.conductora@ucaribe.edu.mx');
    const { body } = await api().get('/viajes/mios?estado=finalizado').set(auth(token)).expect(200);
    const salida = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const res = await api()
      .post(`/viajes/${body.viajes[0].id}/republicar`)
      .set(auth(token))
      .send({ salida_en: salida });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  it('la búsqueda de ejemplo de 002_demo_busqueda.sql da el orden documentado', async () => {
    const token = await login('valeria.pasajera@ucaribe.edu.mx');
    // Cancún no tiene horario de verano: siempre -05:00.
    const manana = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun' }).format(
      new Date(Date.now() + 86_400_000),
    );
    const base = `/viajes/buscar?recogida_lat=21.1762&recogida_lng=-86.8492&salida_en=${encodeURIComponent(`${manana}T07:00:00-05:00`)}`;
    const nombres = (res) => res.body.resultados.map((r) => r.conductor.nombre_visible);

    const sinBajada = await api().get(base).set(auth(token)).expect(200);
    // Pedro no sale: su ruta pasa a 524 m (R = 400 m).
    assert.deepEqual(nombres(sinBajada), ['Rosa Tun', 'Carla Uc', 'Ana López']);

    const conBajada = await api().get(`${base}&bajada_lat=21.2000&bajada_lng=-86.8230`).set(auth(token)).expect(200);
    assert.deepEqual(nombres(conBajada), ['Carla Uc', 'Ana López']);

    // Valeria puede pedir lugar con Carla (no tiene otras reservas que se crucen).
    const carla = conBajada.body.resultados[0];
    await api()
      .post('/reservas')
      .set(auth(token))
      .send({ viaje_id: carla.viaje_id, recogida: { lat: 21.1762, lng: -86.8492 } })
      .expect(201);
  });

  it('el historial demo alimenta el contador de impacto', async () => {
    const token = await login('carla.conductora@ucaribe.edu.mx');
    const { body } = await api().get('/impacto').set(auth(token)).expect(200);
    assert.equal(body.mio.viajes_compartidos, 10);
    assert.ok(body.mio.asientos_ocupados >= 10);
    assert.ok(body.institucion.co2_evitado_kg > body.mio.co2_evitado_kg - 0.01);
    assert.equal(body.metodologia.etiqueta, 'Estimación');
  });

  it('volver a correr los seeds no duplica nada', async () => {
    const contar = async () =>
      (
        await pool.query(
          `SELECT (SELECT count(*) FROM ucaribe.usuarios WHERE correo LIKE '%.pasajer_@ucaribe.edu.mx') AS pasajeros,
                  (SELECT count(*) FROM ucaribe.trayectos) AS trayectos`,
        )
      ).rows[0];
    const antes = await contar();
    await setupDatabase({ withSeeds: true });
    assert.deepEqual(await contar(), antes);
  });
});
