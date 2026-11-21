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
