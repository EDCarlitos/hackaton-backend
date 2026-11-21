const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { api, pool, prepararBD, cerrarBD, crearInstitucion, unico, schemaExiste } = require('./helpers');

before(prepararBD);
after(cerrarBD);

describe('POST /instituciones', () => {
  it('rechaza sin X-Admin-Key (401) y no crea nada', async () => {
    const schema = `sinclave_${unico()}`;
    const res = await api().post('/instituciones').send({ nombre: 'X', schema_nombre: schema });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.codigo, 'ADMIN_KEY_INVALIDA');
    assert.equal(await schemaExiste(schema), false);
  });

  it('rechaza con X-Admin-Key incorrecta (401)', async () => {
    const res = await crearInstitucion({ nombre: 'X', schema_nombre: `mala_${unico()}` }, 'clave-incorrecta');
    assert.equal(res.status, 401);
  });

  it('crea la institución, sus dominios y su schema con las tablas del tenant', async () => {
    const schema = `uni_${unico()}`;
    const dominio = `${schema.replaceAll('_', '')}.edu.mx`;

    const res = await crearInstitucion({ nombre: 'Universidad Nueva', schema_nombre: schema, dominios: [dominio] });

    assert.equal(res.status, 201);
    assert.equal(res.body.institucion.schema_nombre, schema);
    assert.equal(res.body.institucion.activo, true);
    assert.deepEqual(res.body.institucion.dominios.map((d) => d.dominio), [dominio]);

    // Fila en public.instituciones
    const inst = await pool.query('SELECT * FROM public.instituciones WHERE schema_nombre = $1', [schema]);
    assert.equal(inst.rowCount, 1);

    // Schema creado, con las tablas del tenant y las migraciones registradas
    assert.equal(await schemaExiste(schema), true);
    const tablas = await pool.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name',
      [schema],
    );
    assert.deepEqual(
      tablas.rows.map((r) => r.table_name),
      ['mensajes', 'notificaciones', 'reservas', 'schema_migrations', 'trayectos', 'ubicaciones_viaje', 'usuarios', 'vehiculos', 'viajes'],
    );
    const migs = await pool.query(`SELECT nombre FROM "${schema}".schema_migrations ORDER BY nombre`);
    const esperadas = fs.readdirSync(path.join(__dirname, '../src/db/tenant')).filter((f) => f.endsWith('.sql')).sort();
    assert.deepEqual(migs.rows.map((r) => r.nombre), esperadas);
  });

  it('permite crear sin dominios', async () => {
    const res = await crearInstitucion({ nombre: 'Sin dominios', schema_nombre: `sindom_${unico()}` });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.institucion.dominios, []);
  });

  it('valida los datos (400) e indica qué campos fallan', async () => {
    const res = await crearInstitucion({ nombre: '', schema_nombre: 'Con-Mayus', dominios: ['no es dominio'] });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.codigo, 'VALIDACION');
    assert.ok(res.body.error.detalles.nombre);
    assert.ok(res.body.error.detalles.schema_nombre);
    assert.ok(res.body.error.detalles.dominios);
  });

  for (const reservado of ['public', 'information_schema', 'pg_algo']) {
    it(`rechaza el schema reservado "${reservado}" (400)`, async () => {
      const res = await crearInstitucion({ nombre: 'X', schema_nombre: reservado });
      assert.equal(res.status, 400);
      assert.match(res.body.error.detalles.schema_nombre, /reservado/);
    });
  }

  it('rechaza schema_nombre duplicado (409 SCHEMA_DUPLICADO)', async () => {
    const res = await crearInstitucion({ nombre: 'Copia', schema_nombre: 'ucaribe' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'SCHEMA_DUPLICADO');
  });

  it('rechaza un schema que ya existe en la BD aunque no sea institución (409)', async () => {
    const schema = `huerfano_${unico()}`;
    await pool.query(`CREATE SCHEMA "${schema}"`);

    const res = await crearInstitucion({ nombre: 'X', schema_nombre: schema });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'SCHEMA_DUPLICADO');
    const inst = await pool.query('SELECT 1 FROM public.instituciones WHERE schema_nombre = $1', [schema]);
    assert.equal(inst.rowCount, 0, 'no debe quedar la institución a medias');
  });

  it('si un dominio ya es de otra institución: 409 y NO crea ni la institución ni el schema', async () => {
    const schema = `rollback_${unico()}`;

    const res = await crearInstitucion({ nombre: 'X', schema_nombre: schema, dominios: ['ucaribe.edu.mx'] });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'DOMINIO_DUPLICADO');
    const inst = await pool.query('SELECT 1 FROM public.instituciones WHERE schema_nombre = $1', [schema]);
    assert.equal(inst.rowCount, 0);
    assert.equal(await schemaExiste(schema), false);
  });
});
