const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const { signToken } = require('../src/shared/utils/jwt');
const { requireAuth, requireRole } = require('../src/shared/middlewares/auth');
const { errorHandler } = require('../src/shared/middlewares/errorHandler');
const { ROLES } = require('../src/shared/constants/roles');
const { api, pool, prepararBD, cerrarBD, crearUsuario, crearInstitucion, unico } = require('./helpers');

before(prepararBD);
after(cerrarBD);

// App mínima para probar los middlewares sin depender de endpoints de negocio.
const appPrueba = express();
appPrueba.get('/solo-admin', requireAuth, requireRole(ROLES.ADMIN), (req, res) =>
  res.json({ auth: req.auth, tenant: req.tenant }),
);
appPrueba.get('/cualquier-rol', requireAuth, requireRole(ROLES.USUARIO, ROLES.ADMIN), (req, res) =>
  res.json({ auth: req.auth }),
);
appPrueba.use(errorHandler);

const conToken = (ruta, token) => request(appPrueba).get(ruta).set('Authorization', `Bearer ${token}`);

async function idInstitucion(schema) {
  const { rows } = await pool.query('SELECT id FROM public.instituciones WHERE schema_nombre = $1', [schema]);
  return rows[0].id;
}

describe('requireAuth (autenticación)', () => {
  it('deja req.auth y req.tenant con datos de la BD', async () => {
    const { usuario, token } = await crearUsuario({ rol: 'admin' });
    const res = await conToken('/solo-admin', token);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.auth, { usuarioId: usuario.id, rol: 'admin' });
    assert.deepEqual(res.body.tenant, { id: await idInstitucion('ucaribe'), schema: 'ucaribe' });
  });

  it('401 TOKEN_INVALIDO con token expirado', async () => {
    const { usuario } = await crearUsuario();
    const inst = await idInstitucion('ucaribe');
    const token = jwt.sign({ institucion_id: inst, rol: 'usuario' }, env.jwt.secret, {
      subject: String(usuario.id),
      expiresIn: -10,
    });
    const res = await api().get('/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.codigo, 'TOKEN_INVALIDO');
  });

  it('401 TOKEN_INVALIDO si el token está firmado con otro secret', async () => {
    const token = jwt.sign({ institucion_id: 1, rol: 'admin' }, 'x'.repeat(40), { subject: '1' });
    const res = await api().get('/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.body.error.codigo, 'TOKEN_INVALIDO');
  });

  it('401 TOKEN_INVALIDO con alg "none" (sin firma)', async () => {
    const token = jwt.sign({ institucion_id: 1, rol: 'admin' }, null, { algorithm: 'none', subject: '1' });
    const res = await api().get('/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.codigo, 'TOKEN_INVALIDO');
  });

  it('401 TOKEN_INVALIDO (no 500) si los claims tienen tipos raros', async () => {
    for (const claims of [
      { usuarioId: 'abc', institucionId: 1 },
      { usuarioId: 1, institucionId: "1; DROP TABLE usuarios" },
      { usuarioId: -5, institucionId: 1 },
    ]) {
      const token = signToken({ ...claims, rol: 'usuario' });
      const res = await api().get('/auth/me').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 401, JSON.stringify(claims));
      assert.equal(res.body.error.codigo, 'TOKEN_INVALIDO');
    }
  });

  it('401 USUARIO_INVALIDO si el usuario se desactiva después de recibir el token', async () => {
    const { usuario, token } = await crearUsuario();
    await api().get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    await pool.query('UPDATE ucaribe.usuarios SET activo = false WHERE id = $1', [usuario.id]);

    const res = await api().get('/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.codigo, 'USUARIO_INVALIDO');
  });

  it('401 INSTITUCION_INVALIDA si la institución se desactiva', async () => {
    const schema = `apagada_${unico()}`;
    const dominio = `${schema.replaceAll('_', '')}.edu.mx`;
    await crearInstitucion({ nombre: 'Apagada', schema_nombre: schema, dominios: [dominio] }).expect(201);
    const { body } = await api()
      .post('/auth/register')
      .send({ correo: `a@${dominio}`, password: 'secreta123', nombre_visible: 'A' })
      .expect(201);

    await pool.query('UPDATE public.instituciones SET activo = false WHERE schema_nombre = $1', [schema]);

    const res = await api().get('/auth/me').set('Authorization', `Bearer ${body.token}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.codigo, 'INSTITUCION_INVALIDA');
  });

  it('aislamiento: un token de otra institución no ve usuarios de ucaribe con el mismo id', async () => {
    const schema = `aislada_${unico()}`;
    const dominio = `${schema.replaceAll('_', '')}.edu.mx`;
    await crearInstitucion({ nombre: 'Aislada', schema_nombre: schema, dominios: [dominio] }).expect(201);
    const { usuario } = await crearUsuario(); // en ucaribe

    // Token válido con el id del usuario de ucaribe, pero de la otra institución.
    const token = signToken({ usuarioId: usuario.id, institucionId: await idInstitucion(schema), rol: 'admin' });
    const res = await api().get('/auth/me').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.error.codigo, 'USUARIO_INVALIDO');
  });
});

describe('requireRole (autorización)', () => {
  it('admin pasa a una ruta solo-admin', async () => {
    const { token } = await crearUsuario({ rol: 'admin' });
    const res = await conToken('/solo-admin', token);
    assert.equal(res.status, 200);
  });

  it('usuario recibe 403 ROL_INSUFICIENTE en una ruta solo-admin', async () => {
    const { token } = await crearUsuario({ rol: 'usuario' });
    const res = await conToken('/solo-admin', token);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.codigo, 'ROL_INSUFICIENTE');
  });

  it('el rol sale de la BD, no del token: un token que dice "admin" no basta', async () => {
    const { usuario } = await crearUsuario({ rol: 'usuario' });
    const token = signToken({ usuarioId: usuario.id, institucionId: await idInstitucion('ucaribe'), rol: 'admin' });
    const res = await conToken('/solo-admin', token);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.codigo, 'ROL_INSUFICIENTE');
  });

  it('si a un admin le quitan el rol, pierde el acceso en el siguiente request', async () => {
    const { usuario, token } = await crearUsuario({ rol: 'admin' });
    await conToken('/solo-admin', token).expect(200);

    await pool.query("UPDATE ucaribe.usuarios SET rol = 'usuario' WHERE id = $1", [usuario.id]);

    const res = await conToken('/solo-admin', token);
    assert.equal(res.status, 403);
  });

  it('acepta varios roles', async () => {
    const { token } = await crearUsuario({ rol: 'usuario' });
    await conToken('/cualquier-rol', token).expect(200);
  });

  it('falla al configurar la ruta si el rol no existe', () => {
    assert.throws(() => requireRole('superadmin'), /roles inválidos/);
    assert.throws(() => requireRole(), /roles inválidos/);
  });
});
