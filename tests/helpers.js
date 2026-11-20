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

module.exports = { api, pool, prepararBD, cerrarBD, crearInstitucion, unico, schemaExiste };
