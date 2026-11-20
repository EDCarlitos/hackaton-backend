const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { verifyToken } = require('../src/shared/utils/jwt');
const { api, pool, prepararBD, cerrarBD, crearInstitucion, unico } = require('./helpers');

before(prepararBD);
after(cerrarBD);

const registrar = (body) => api().post('/auth/register').send(body);

function datos(correo, extra = {}) {
  return { correo, password: 'secreta123', nombre_visible: 'Persona Prueba', ...extra };
}

async function contarUsuarios(schema, correo) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM "${schema}".usuarios WHERE correo = $1`, [correo]);
  return rows[0].n;
}

describe('POST /auth/register', () => {
  describe('cuando el dominio NO está en dominios_permitidos', () => {
    it('responde 403 DOMINIO_NO_PERMITIDO', async () => {
      const res = await registrar(datos(`alguien_${unico()}@gmail.com`));

      assert.equal(res.status, 403);
      assert.deepEqual(Object.keys(res.body), ['error']);
      assert.equal(res.body.error.codigo, 'DOMINIO_NO_PERMITIDO');
      assert.equal(typeof res.body.error.mensaje, 'string');
      assert.equal(res.body.token, undefined);
    });

    it('no acepta subdominios que no estén registrados explícitamente', async () => {
      const res = await registrar(datos(`a_${unico()}@alumnos.ucaribe.edu.mx`));
      assert.equal(res.status, 403);
      assert.equal(res.body.error.codigo, 'DOMINIO_NO_PERMITIDO');
    });

    it('rechaza dominios de una institución inactiva', async () => {
      const schema = `inactiva_${unico()}`;
      const dominio = `${schema.replaceAll('_', '')}.edu.mx`;
      await crearInstitucion({ nombre: 'Inactiva', schema_nombre: schema, dominios: [dominio] }).expect(201);
      await pool.query('UPDATE public.instituciones SET activo = false WHERE schema_nombre = $1', [schema]);

      const correo = `a@${dominio}`;
      const res = await registrar(datos(correo));

      assert.equal(res.status, 403);
      assert.equal(await contarUsuarios(schema, correo), 0);
    });

    it('rechaza dominios desactivados', async () => {
      const schema = `domoff_${unico()}`;
      const dominio = `${schema.replaceAll('_', '')}.edu.mx`;
      await crearInstitucion({ nombre: 'Dominio off', schema_nombre: schema, dominios: [dominio] }).expect(201);
      await pool.query('UPDATE public.dominios_permitidos SET activo = false WHERE dominio = $1', [dominio]);

      const res = await registrar(datos(`a@${dominio}`));
      assert.equal(res.status, 403);
    });
  });

  describe('cuando el dominio SÍ está permitido', () => {
    it('guarda el usuario en la tabla usuarios del schema de su institución', async () => {
      const correo = `ana_${unico()}@ucaribe.edu.mx`;

      const res = await registrar(datos(correo, { acepto_terminos: true }));

      assert.equal(res.status, 201);
      assert.equal(res.body.usuario.correo, correo);
      assert.equal(res.body.usuario.rol, 'usuario');
      assert.equal(res.body.usuario.correo_verificado_en, null);
      assert.ok(res.body.usuario.acepto_terminos_en);
      assert.equal(res.body.usuario.password_hash, undefined, 'nunca devolver el hash');

      const { rows } = await pool.query('SELECT * FROM ucaribe.usuarios WHERE correo = $1', [correo]);
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].password_hash, 'secreta123');
      assert.equal(await bcrypt.compare('secreta123', rows[0].password_hash), true);
    });

    it('devuelve un JWT con el usuario y la institución', async () => {
      const res = await registrar(datos(`jwt_${unico()}@ucaribe.edu.mx`));
      const inst = await pool.query("SELECT id FROM public.instituciones WHERE schema_nombre = 'ucaribe'");

      const payload = verifyToken(res.body.token);
      assert.equal(payload.sub, String(res.body.usuario.id));
      assert.equal(payload.institucion_id, inst.rows[0].id);
      assert.equal(payload.rol, 'usuario');
    });

    it('normaliza el correo (mayúsculas/espacios) y detecta duplicados (409 CORREO_DUPLICADO)', async () => {
      const base = `dup_${unico()}`;
      await registrar(datos(`  ${base.toUpperCase()}@UCaribe.EDU.mx `)).expect(201);

      const res = await registrar(datos(`${base}@ucaribe.edu.mx`));

      assert.equal(res.status, 409);
      assert.equal(res.body.error.codigo, 'CORREO_DUPLICADO');
      assert.equal(await contarUsuarios('ucaribe', `${base}@ucaribe.edu.mx`), 1);
    });

    it('cada institución guarda sus usuarios en su propio schema (aislamiento)', async () => {
      const schema = `otra_${unico()}`;
      const dominio = `${schema.replaceAll('_', '')}.edu.mx`;
      await crearInstitucion({ nombre: 'Otra Uni', schema_nombre: schema, dominios: [dominio] }).expect(201);

      const correo = `luis@${dominio}`;
      const res = await registrar(datos(correo));

      assert.equal(res.status, 201);
      assert.equal(await contarUsuarios(schema, correo), 1);
      assert.equal(await contarUsuarios('ucaribe', correo), 0);
    });
  });

  describe('validación', () => {
    it('responde 400 VALIDACION con detalle por campo', async () => {
      const res = await registrar({ correo: 'no-es-correo', password: '123', acepto_terminos: 'si' });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.codigo, 'VALIDACION');
      assert.deepEqual(Object.keys(res.body.error.detalles).sort(), [
        'acepto_terminos',
        'correo',
        'nombre_visible',
        'password',
      ]);
    });

    it('rechaza contraseñas de más de 72 bytes (límite de bcrypt)', async () => {
      const res = await registrar(datos(`largo_${unico()}@ucaribe.edu.mx`, { password: 'a'.repeat(73) }));
      assert.equal(res.status, 400);
      assert.ok(res.body.error.detalles.password);
    });

    it('responde 400 si no hay body', async () => {
      const res = await api().post('/auth/register');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.codigo, 'VALIDACION');
    });

    it('rechaza tipos incorrectos (objetos/números en vez de strings)',async () => {
      const res = await registrar({
        correo: { $ne: null },
        password: 12345678,
        nombre_visible: ['x'],
      });
      assert.equal(res.status, 400);
      assert.deepEqual(Object.keys(res.body.error.detalles).sort(), ['correo', 'nombre_visible', 'password']);
    });

    it('acepta exactamente 8 caracteres de contraseña y rechaza 7', async () => {
      await registrar(datos(`p8_${unico()}@ucaribe.edu.mx`, { password: '12345678' })).expect(201);
      const res = await registrar(datos(`p7_${unico()}@ucaribe.edu.mx`, { password: '1234567' }));
      assert.equal(res.status, 400);
      assert.ok(res.body.error.detalles.password);
    });

    it('rechaza nombre_visible vacío o de más de 100 caracteres y no crea el usuario', async () => {
      for (const nombre_visible of ['   ', 'a'.repeat(101)]) {
        const correo = `nom_${unico()}@ucaribe.edu.mx`;
        const res = await registrar(datos(correo, { nombre_visible }));
        assert.equal(res.status, 400);
        assert.ok(res.body.error.detalles.nombre_visible);
        assert.equal(await contarUsuarios('ucaribe', correo), 0);
      }
    });

    it('guarda nombre_visible recortado y acepto_terminos_en NULL si no se envía', async () => {
      const res = await registrar(datos(`trim_${unico()}@ucaribe.edu.mx`, { nombre_visible: '  Ana  ' }));
      assert.equal(res.status, 201);
      assert.equal(res.body.usuario.nombre_visible, 'Ana');
      assert.equal(res.body.usuario.acepto_terminos_en, null);
    });
  });

  describe('inyección SQL', () => {
    it('un correo con SQL se rechaza en la validación y la tabla sigue intacta', async () => {
      const antes = await pool.query('SELECT count(*)::int AS n FROM ucaribe.usuarios');

      const res = await registrar(datos("x' OR '1'='1'; DROP TABLE usuarios; --@ucaribe.edu.mx"));

      assert.equal(res.status, 400);
      const despues = await pool.query('SELECT count(*)::int AS n FROM ucaribe.usuarios');
      assert.equal(despues.rows[0].n, antes.rows[0].n);
    });

    it('nombre_visible con SQL se guarda literal (va parametrizado)', async () => {
      const payload = "Robert'); DROP TABLE usuarios; --";
      const correo = `bobby_${unico()}@ucaribe.edu.mx`;

      const res = await registrar(datos(correo, { nombre_visible: payload }));

      assert.equal(res.status, 201);
      const { rows } = await pool.query('SELECT nombre_visible FROM ucaribe.usuarios WHERE correo = $1', [correo]);
      assert.equal(rows[0].nombre_visible, payload);
    });
  });

  describe('JSON', () => {
    it('responde 400 JSON_INVALIDO si el body no es JSON válido', async () => {
      const res = await api().post('/auth/register').set('Content-Type', 'application/json').send('{malo');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.codigo, 'JSON_INVALIDO');
    });
  });
});

describe('GET /auth/me', () => {
  it('devuelve el perfil con un token válido', async () => {
    const correo = `me_${unico()}@ucaribe.edu.mx`;
    const { body } = await registrar(datos(correo)).expect(201);

    const res = await api().get('/auth/me').set('Authorization', `Bearer ${body.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.usuario.correo, correo);
  });

  it('401 TOKEN_REQUERIDO sin token', async () => {
    const res = await api().get('/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.codigo, 'TOKEN_REQUERIDO');
  });

  it('401 TOKEN_INVALIDO con token falso', async () => {
    const res = await api().get('/auth/me').set('Authorization', 'Bearer abc.def.ghi');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.codigo, 'TOKEN_INVALIDO');
  });
});
