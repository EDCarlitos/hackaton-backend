const { Pool, escapeIdentifier } = require('pg');
const env = require('./env');

const pool = new Pool(env.db);

const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/; // igual que chk_schema_nombre en public.instituciones

// Valida y escapa un nombre de schema. Lanza error si no es válido.
function quoteSchema(schema) {
  if (typeof schema !== 'string' || !SCHEMA_RE.test(schema)) {
    throw new Error(`Nombre de schema inválido: ${schema}`);
  }
  return escapeIdentifier(schema);
}

// Ejecuta fn(client) dentro de una transacción. Hace ROLLBACK si fn lanza.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Igual que withTransaction, pero con search_path apuntando al schema del tenant.
// SET LOCAL solo dura la transacción: la conexión vuelve limpia al pool.
function withTenant(schema, fn) {
  const quoted = quoteSchema(schema);
  return withTransaction(async (client) => {
    await client.query(`SET LOCAL search_path TO ${quoted}, public`);
    return fn(client);
  });
}

module.exports = { pool, withTransaction, withTenant, quoteSchema, SCHEMA_RE };
