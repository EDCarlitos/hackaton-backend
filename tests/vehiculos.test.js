const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, pool, prepararBD, cerrarBD, crearUsuario, crearConductor, auth } = require('./helpers');

before(prepararBD);
after(cerrarBD);

describe('vehículos', () => {
  it('registra un vehículo en el schema de la institución', async () => {
    const { usuario, token } = await crearUsuario();
    const res = await api()
      .post('/vehiculos')
      .set(auth(token))
      .send({ placa_o_descripcion: '  Nissan March gris  ', asientos: 4 });

    assert.equal(res.status, 201);
    assert.equal(res.body.vehiculo.placa_o_descripcion, 'Nissan March gris');
    assert.equal(res.body.vehiculo.activo, true);
    const { rows } = await pool.query('SELECT usuario_id FROM ucaribe.vehiculos WHERE id = $1', [res.body.vehiculo.id]);
    assert.equal(rows[0].usuario_id, usuario.id);
  });

  it('400 con asientos fuera de 1–4 o sin descripción, y no crea nada', async () => {
    const { usuario, token } = await crearUsuario();
    const res = await api().post('/vehiculos').set(auth(token)).send({ asientos: 5 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.codigo, 'VALIDACION');
    assert.ok(res.body.error.detalles.asientos);
    assert.ok(res.body.error.detalles.placa_o_descripcion);
    const { rowCount } = await pool.query('SELECT 1 FROM ucaribe.vehiculos WHERE usuario_id = $1', [usuario.id]);
    assert.equal(rowCount, 0);
  });

  it('lista solo los vehículos propios', async () => {
    const a = await crearConductor();
    await crearConductor();
    const res = await api().get('/vehiculos').set(auth(a.token)).expect(200);
    assert.deepEqual(
      res.body.vehiculos.map((v) => v.id),
      [a.vehiculo.id],
    );
  });

  it('DELETE desactiva (no borra); otro usuario recibe 404', async () => {
    const dueño = await crearConductor();
    const otro = await crearUsuario();

    const ajeno = await api().delete(`/vehiculos/${dueño.vehiculo.id}`).set(auth(otro.token));
    assert.equal(ajeno.status, 404);
    assert.equal(ajeno.body.error.codigo, 'VEHICULO_NO_ENCONTRADO');

    const res = await api().delete(`/vehiculos/${dueño.vehiculo.id}`).set(auth(dueño.token)).expect(200);
    assert.equal(res.body.vehiculo.activo, false);
    const { rows } = await pool.query('SELECT activo FROM ucaribe.vehiculos WHERE id = $1', [dueño.vehiculo.id]);
    assert.equal(rows[0].activo, false);
  });

  it('id no numérico → 404, sin token → 401', async () => {
    const { token } = await crearUsuario();
    const res = await api().delete('/vehiculos/abc').set(auth(token));
    assert.equal(res.status, 404);
    const sinToken = await api().get('/vehiculos');
    assert.equal(sinToken.status, 401);
    assert.equal(sinToken.body.error.codigo, 'TOKEN_REQUERIDO');
  });
});
