const fs = require('node:fs/promises');
const path = require('node:path');
const { pool, quoteSchema } = require('../config/db');

const PUBLIC_DIR = path.join(__dirname, 'public');
const TENANT_DIR = path.join(__dirname, 'tenant');
const SEEDS_DIR = path.join(__dirname, 'seeds');
const LOCK_ID = 727001; // evita que dos procesos migren al mismo tiempo

async function sqlFiles(dir) {
  const files = await fs.readdir(dir);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

// Aplica en orden los .sql de `dir` que no estén en `trackingTable`.
// Cada archivo corre en su propia transacción. `searchPath` (ya escapado) se fija con SET LOCAL.
async function applyPending(client, { dir, trackingTable, searchPath, label }) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${trackingTable} (
      nombre      text PRIMARY KEY,
      aplicado_en timestamptz NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await client.query(`SELECT nombre FROM ${trackingTable}`);
  const aplicadas = new Set(rows.map((r) => r.nombre));

  for (const file of await sqlFiles(dir)) {
    if (aplicadas.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    try {
      await client.query('BEGIN');
      if (searchPath) await client.query(`SET LOCAL search_path TO ${searchPath}`);
      await client.query(sql);
      await client.query(`INSERT INTO ${trackingTable} (nombre) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      console.log(`Migración aplicada [${label}]: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Falló la migración ${file} en ${label}: ${err.message}`);
    }
  }
}

async function withLock(fn) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    return await fn(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

// Migraciones de src/db/public (una sola vez).
function migratePublic() {
  return withLock((client) =>
    applyPending(client, {
      dir: PUBLIC_DIR,
      trackingTable: 'public.schema_migrations',
      label: 'public',
    }),
  );
}

// Crea el schema de cada institución (si falta) y le aplica src/db/tenant.
function migrateTenants() {
  return withLock(async (client) => {
    const { rows } = await client.query('SELECT schema_nombre FROM public.instituciones ORDER BY id');
    for (const { schema_nombre } of rows) {
      const schema = quoteSchema(schema_nombre);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await applyPending(client, {
        dir: TENANT_DIR,
        trackingTable: `${schema}.schema_migrations`,
        searchPath: `${schema}, public`,
        label: schema_nombre,
      });
    }
  });
}

// Crea el schema de UNA institución nueva y le aplica todas las migraciones de src/db/tenant.
// Debe llamarse DENTRO de una transacción abierta (ej. withTransaction): si algo falla,
// el ROLLBACK deshace también el schema y sus tablas.
// Usa CREATE SCHEMA sin IF NOT EXISTS: si ya existe, falla con código 42P06.
async function createTenantSchema(client, schemaNombre) {
  const schema = quoteSchema(schemaNombre);
  await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`
    CREATE TABLE ${schema}.schema_migrations (
      nombre      text PRIMARY KEY,
      aplicado_en timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`SET LOCAL search_path TO ${schema}, public`);
  for (const file of await sqlFiles(TENANT_DIR)) {
    const sql = await fs.readFile(path.join(TENANT_DIR, file), 'utf8');
    await client.query(sql);
    await client.query(`INSERT INTO ${schema}.schema_migrations (nombre) VALUES ($1)`, [file]);
  }
  await client.query('SET LOCAL search_path TO public');
}

// Corre todos los seeds. Deben ser idempotentes (ON CONFLICT DO NOTHING).
async function seed() {
  for (const file of await sqlFiles(SEEDS_DIR)) {
    const sql = await fs.readFile(path.join(SEEDS_DIR, file), 'utf8');
    await pool.query(sql);
    console.log(`Seed aplicado: ${file}`);
  }
}

// Orden completo: public → seeds (opcional) → schemas de institución.
// Los seeds van antes de los tenants porque pueden dar de alta instituciones.
async function setupDatabase({ withSeeds }) {
  await migratePublic();
  if (withSeeds) await seed();
  await migrateTenants();
}

module.exports = { migratePublic, migrateTenants, createTenantSchema, seed, setupDatabase };

// Uso por CLI: node src/db/migrate.js [migrate|seed|setup]
if (require.main === module) {
  const cmd = process.argv[2] || 'migrate';
  const tasks = {
    migrate: () => setupDatabase({ withSeeds: false }),
    seed: () => seed().then(migrateTenants),
    setup: () => setupDatabase({ withSeeds: true }),
  };
  if (!tasks[cmd]) {
    console.error(`Comando desconocido: ${cmd}. Usa migrate, seed o setup.`);
    process.exit(1);
  }
  tasks[cmd]()
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
