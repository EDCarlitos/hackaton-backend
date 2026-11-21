const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { verifyToken } = require('../src/shared/utils/jwt');
const { api, pool, prepararBD, cerrarBD, crearUsuario, unico } = require('./helpers');

before(prepararBD);
after(cerrarBD);

const login = (body) => api().post('/auth/login').send(body);

describe('POST /auth/login', () => {
  describe('con credenciales correctas', () => {
    it('responde 200 con el usuario (sin password_hash) y un JWT válido', async () => {
      const { correo, password, usuario } = await crearUsuario();

      const res = await login({ correo, password });

      assert.equal(res.status, 200);
      assert.equal(res.body.usuario.id, usuario.id);
      assert.equal(res.body.usuario.password_hash, undefined, 'nunca devolver el hash');

      const inst = await pool.query("SELECT id FROM public.instituciones WHERE schema_nombre = 'ucaribe'");
      const payload = verifyToken(res.body.token);
      assert.equal(payload.sub, String(usuario.id));
      assert.equal(payload.institucion_id, inst.rows[0].id);
      assert.equal(payload.rol, 'usuario');
    });

    it('el token del login sirve para GET /auth/me', async () => {
      const { correo, password } = await crearUsuario();
      const { body } = await login({ correo, password }).expect(200);

      const res = await api().get('/auth/me').set('Authorization', `Bearer ${body.token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.usuario.correo, correo);
    });

    it('normaliza el correo (mayúsculas y espacios)', async () => {
      const { correo, password } = await crearUsuario();
      const res = await login({ correo: `  ${correo.toUpperCase()} `, password });
      assert.equal(res.status, 200);
    });

    it('el token lleva el rol de la BD (admin)', async () => {
      const { correo, password } = await crearUsuario({ rol: 'admin' });
      const { body } = await login({ correo, password }).expect(200);
      assert.equal(verifyToken(body.token).rol, 'admin');
    });
  });

  describe('credenciales inválidas: siempre 401 CREDENCIALES_INVALIDAS (no revela qué falló)', () => {
    it('contraseña incorrecta', async () => {
      const { correo } = await crearUsuario();
      const res = await login({ correo, password: 'otra-cosa-123' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.codigo, 'CREDENCIALES_INVALIDAS');
      assert.equal(res.body.token, undefined);
    });

    it('correo no registrado en un dominio permitido', async () => {
      const res = await login({ correo: `nadie_${unico()}@ucaribe.edu.mx`, password: 'secreta123' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.codigo, 'CREDENCIALES_INVALIDAS');
    });

    it('dominio que no pertenece a ninguna institución', async () => {
      const res = await login({ correo: `x_${unico()}@gmail.com`, password: 'secreta123' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.codigo, 'CREDENCIALES_INVALIDAS');
    });

    it('mismo mensaje en los tres casos', async () => {
      const { correo } = await crearUsuario();
      const respuestas = await Promise.all([
        login({ correo, password: 'incorrecta1' }),
        login({ correo: `nadie_${unico()}@ucaribe.edu.mx`, password: 'incorrecta1' }),
        login({ correo: `x_${unico()}@gmail.com`, password: 'incorrecta1' }),
      ]);
      const cuerpos = new Set(respuestas.map((r) => JSON.stringify(r.body)));
      assert.equal(cuerpos.size, 1);
    });
  });

  describe('estado de la cuenta (solo con la contraseña correcta)', () => {
    it('un usuario recién registrado puede iniciar sesión de inmediato', async () => {
      const correo = `nuevo_${unico()}@ucaribe.edu.mx`;
      await api()
        .post('/auth/register')
        .send({ correo, password: 'secreta123', nombre_visible: 'Nuevo' })
        .expect(201);
      const res = await login({ correo, password: 'secreta123' });
      assert.equal(res.status, 200);
      assert.ok(res.body.token);
    });

    it('403 USUARIO_INACTIVO si la cuenta está desactivada', async () => {
      const { correo, password } = await crearUsuario({ activo: false });
      const res = await login({ correo, password });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.codigo, 'USUARIO_INACTIVO');
      assert.equal(res.body.token, undefined);
    });

    it('con contraseña incorrecta NO revela que está desactivada', async () => {
      const { correo } = await crearUsuario({ activo: false });
      const res = await login({ correo, password: 'incorrecta1' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.codigo, 'CREDENCIALES_INVALIDAS');
    });
  });

  describe('validación', () => {
    it('400 VALIDACION con detalle por campo', async () => {
      const res = await login({ correo: 'no-es-correo' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.codigo, 'VALIDACION');
      assert.deepEqual(Object.keys(res.body.error.detalles).sort(), ['correo', 'password']);
    });

    it('400 con tipos incorrectos (objeto en vez de string)', async () => {
      const res = await login({ correo: { $ne: null }, password: { $ne: null } });
      assert.equal(res.status, 400);
    });

    it('400 sin body', async () => {
      const res = await api().post('/auth/login');
      assert.equal(res.status, 400);
    });

    it('un correo con SQL no inicia sesión', async () => {
      const res = await login({ correo: "' OR 1=1 --@ucaribe.edu.mx", password: "' OR '1'='1" });
      assert.ok([400, 401].includes(res.status));
      assert.equal(res.body.token, undefined);
    });
  });
});
