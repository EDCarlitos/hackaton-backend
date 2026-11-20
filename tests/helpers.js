const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const { pool } = require('../src/config/db');
const { setupDatabase } = require('../src/db/migrate');

// Migraciones + seeds (institución ucaribe con dominio ucaribe.edu.mx).
function prepararBD() {
  return setupDatabase({ withSeeds: true });
}

function cerrarBD() {
  return pool.end();
}

const api = () => request(app);

function crearInstitucion(body, adminKey = env.platformAdminKey) {
  return api().post('/instituciones').set('X-Admin-Key', adminKey).send(body);
}

// Sufijo único para que cada test use datos distintos y no choque con otros.
let contador = 0;
function unico() {
  contador += 1;
  return `${process.pid}_${contador}`;
}

async function schemaExiste(nombre) {
  const { rowCount } = await pool.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [nombre]);
  return rowCount === 1;
}

const PASSWORD = 'secreta123';

// Registra un usuario en ucaribe y le ajusta estado/rol directo en la BD.
// Devuelve { correo, password, usuario, token }.
async function crearUsuario({ verificado = true, activo = true, rol = 'usuario' } = {}) {
  const correo = `u_${unico()}@ucaribe.edu.mx`;
  const { body } = await api()
    .post('/auth/register')
    .send({ correo, password: PASSWORD, nombre_visible: 'Usuario Prueba' })
    .expect(201);
  await pool.query(
    `UPDATE ucaribe.usuarios
        SET correo_verificado_en = CASE WHEN $2 THEN now() END, activo = $3, rol = $4
      WHERE id = $1`,
    [body.usuario.id, verificado, activo, rol],
  );
  return { correo, password: PASSWORD, usuario: body.usuario, token: body.token };
}

module.exports = { api, pool, prepararBD, cerrarBD, crearInstitucion, crearUsuario, unico, schemaExiste };
