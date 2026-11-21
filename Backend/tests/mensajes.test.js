// RF-23: chat de grupo del viaje.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
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

const leer = (token, viajeId, q = '') => api().get(`/viajes/${viajeId}/mensajes${q}`).set(auth(token));
const enviar = (token, viajeId, texto) => api().post(`/viajes/${viajeId}/mensajes`).set(auth(token)).send({ texto });

async function grupo() {
  const conductor = await crearConductor();
  const viaje = await publicarEnZona(conductor, zonaDePrueba());
  const confirmado = await crearUsuario();
  const pendiente = await crearUsuario();
  await crearReserva(viaje.id, confirmado.usuario.id, 'confirmada');
  await crearReserva(viaje.id, pendiente.usuario.id, 'solicitada');
  return { conductor, viaje, confirmado, pendiente };
}

describe('chat del viaje (RF-23)', () => {
  it('conductor y confirmados escriben y leen; cada quien ve cuáles son suyos', async () => {
    const { conductor, viaje, confirmado } = await grupo();

    const m1 = await enviar(conductor.token, viaje.id, '  Salgo en 5 minutos  ');
    assert.equal(m1.status, 201, JSON.stringify(m1.body));
    assert.equal(m1.body.mensaje.texto, 'Salgo en 5 minutos');
    await enviar(confirmado.token, viaje.id, '¡Listo, aquí espero!').expect(201);

    const { body } = await leer(confirmado.token, viaje.id).expect(200);
    assert.deepEqual(
      body.mensajes.map((m) => [m.texto, m.mio]),
      [
        ['Salgo en 5 minutos', false],
        ['¡Listo, aquí espero!', true],
      ],
    );
    assert.equal(body.puede_escribir, true);
    assert.deepEqual(body.participantes.map((p) => p.papel).sort(), ['conductor', 'pasajero']);

    // Polling: solo lo nuevo.
    const nuevos = await leer(conductor.token, viaje.id, `?despues_de=${m1.body.mensaje.id}`).expect(200);
    assert.deepEqual(
      nuevos.body.mensajes.map((m) => m.texto),
      ['¡Listo, aquí espero!'],
    );
  });

  it('403 NO_PARTICIPA para solicitudes pendientes y ajenos; no se guarda nada', async () => {
    const { viaje, pendiente } = await grupo();
    const ajeno = await crearUsuario();
    for (const u of [pendiente, ajeno]) {
      const r1 = await leer(u.token, viaje.id);
      assert.equal(r1.status, 403);
      assert.equal(r1.body.error.codigo, 'NO_PARTICIPA');
      const r2 = await enviar(u.token, viaje.id, 'hola');
      assert.equal(r2.status, 403);
    }
    const { rowCount } = await pool.query('SELECT 1 FROM ucaribe.mensajes WHERE viaje_id = $1', [viaje.id]);
    assert.equal(rowCount, 0);
  });

  it('con el viaje cancelado se puede leer pero no escribir (409 CHAT_CERRADO)', async () => {
    const { conductor, viaje } = await grupo();
    await enviar(conductor.token, viaje.id, 'Aviso').expect(201);
    await api().post(`/viajes/${viaje.id}/cancelar`).set(auth(conductor.token)).expect(200);

    const res = await enviar(conductor.token, viaje.id, '¿Alguien?');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'CHAT_CERRADO');
    const lectura = await leer(conductor.token, viaje.id).expect(200);
    assert.equal(lectura.body.puede_escribir, false);
  });

  it('400 texto vacío o > 500; 404 viaje inexistente', async () => {
    const { conductor, viaje } = await grupo();
    assert.equal((await enviar(conductor.token, viaje.id, '   ')).status, 400);
    assert.equal((await enviar(conductor.token, viaje.id, 'x'.repeat(501))).status, 400);
    const r = await leer(conductor.token, 999999);
    assert.equal(r.status, 404);
    assert.equal(r.body.error.codigo, 'VIAJE_NO_ENCONTRADO');
  });
});
