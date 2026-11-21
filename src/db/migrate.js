const fs = require('node:fs/promises');
const path = require('node:path');
const { pool, quoteSchema } = require('../config/db');

const PUBLIC_DIR = path.join(__dirname, 'public');
const TENANT_DIR = path.join(__dirname, 'tenant');
const SEEDS_DIR = path.join(__dirname, 'seeds');
const TENANT_SEEDS_DIR = path.join(SEEDS_DIR, 'tenant'); // una carpeta por schema: seeds/tenant/<schema>/*.sql
const LOCK_ID = 727001; // evita que dos procesos migren al mismo tiempo

async function sqlFiles(dir) {
  const files = await fs.readdir(dir);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

// Destino de las migraciones: `null` = public; si no, el nombre CRUDO del schema del tenant.
// Todo identificador se escapa aquí con quoteSchema; nunca se recibe SQL ya armado.
function target(schemaNombre) {
  if (schemaNombre === null) {
    return { trackingTable: 'public.schema_migrations', searchPath: null };
  }
  const schema = quoteSchema(schemaNombre);
  return { trackingTable: `${schema}.schema_migrations`, searchPath: `${schema}, public` };
}

async function ensureTrackingTable(client, trackingTable) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${trackingTable} (
      nombre      text PRIMARY KEY,
      aplicado_en timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function applyFile(client, { dir, file, trackingTable }) {
  const sql = await fs.readFile(path.join(dir, file), 'utf8');
  await client.query(sql);
  await client.query(`INSERT INTO ${trackingTable} (nombre) VALUES ($1)`, [file]);
}

// Aplica en orden los .sql de `dir` que aún no estén registrados.
// Cada archivo corre en su propia transacción.
async function applyPending(client, { dir, schemaNombre, label }) {
  const { trackingTable, searchPath } = target(schemaNombre);
  await ensureTrackingTable(client, trackingTable);
  const { rows } = await client.query(`SELECT nombre FROM ${trackingTable}`);
  const aplicadas = new Set(rows.map((r) => r.nombre));

  for (const file of await sqlFiles(dir)) {
    if (aplicadas.has(file)) continue;
    try {
      await client.query('BEGIN');
      if (searchPath) await client.query(`SET LOCAL search_path TO ${searchPath}`);
      await applyFile(client, { dir, file, trackingTable });
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
  return withLock((client) => applyPending(client, { dir: PUBLIC_DIR, schemaNombre: null, label: 'public' }));
}

// Crea el schema de cada institución (si falta) y le aplica src/db/tenant.
function migrateTenants() {
  return withLock(async (client) => {
    const { rows } = await client.query('SELECT schema_nombre FROM public.instituciones ORDER BY id');
    for (const { schema_nombre } of rows) {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteSchema(schema_nombre)}`);
      await applyPending(client, { dir: TENANT_DIR, schemaNombre: schema_nombre, label: schema_nombre });
    }
  });
}

// Crea el schema de UNA institución nueva y le aplica todas las migraciones de src/db/tenant.
// Debe llamarse DENTRO de una transacción abierta (ej. withTransaction): si algo falla,
// el ROLLBACK deshace también el schema y sus tablas.
// Usa CREATE SCHEMA sin IF NOT EXISTS: si ya existe, falla con código 42P06.
async function createTenantSchema(client, schemaNombre) {
  const { trackingTable, searchPath } = target(schemaNombre);
  await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
  await client.query(`CREATE SCHEMA ${quoteSchema(schemaNombre)}`);
  await ensureTrackingTable(client, trackingTable);
  await client.query(`SET LOCAL search_path TO ${searchPath}`);
  for (const file of await sqlFiles(TENANT_DIR)) {
    await applyFile(client, { dir: TENANT_DIR, file, trackingTable });
  }
  await client.query('SET LOCAL search_path TO public');
}

// Corre los seeds de public (src/db/seeds/*.sql). Deben ser idempotentes (ON CONFLICT DO NOTHING).
async function seed() {
  for (const file of await sqlFiles(SEEDS_DIR)) {
    const sql = await fs.readFile(path.join(SEEDS_DIR, file), 'utf8');
    await pool.query(sql);
    console.log(`Seed aplicado: ${file}`);
  }
}

// Corre src/db/seeds/tenant/<schema>/*.sql sobre cada schema que ya sea institución
// (las carpetas de schemas que no existen se ignoran). Cada archivo va en su transacción
// con search_path = <schema>, public. También deben ser idempotentes.
async function seedTenants() {
  const carpetas = await fs.readdir(TENANT_SEEDS_DIR, { withFileTypes: true }).catch(() => []);
  const { rows } = await pool.query('SELECT schema_nombre FROM public.instituciones');
  const existentes = new Set(rows.map((r) => r.schema_nombre));

  for (const carpeta of carpetas) {
    if (!carpeta.isDirectory() || !existentes.has(carpeta.name)) continue;
    const dir = path.join(TENANT_SEEDS_DIR, carpeta.name);
    const searchPath = `${quoteSchema(carpeta.name)}, public`;
    for (const file of await sqlFiles(dir)) {
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL search_path TO ${searchPath}`);
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`Seed aplicado [${carpeta.name}]: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Falló el seed ${file} en ${carpeta.name}: ${err.message}`);
      } finally {
        client.release();
      }
    }
  }
}

// Orden completo: public → seeds de public (opcional) → schemas de institución → seeds de tenant (opcional).
// Los seeds de public van antes de los tenants porque pueden dar de alta instituciones;
// los de tenant van al final porque necesitan sus tablas.
async function setupDatabase({ withSeeds }) {
  await migratePublic();
  if (withSeeds) await seed();
  await migrateTenants();
  if (withSeeds) await seedTenants();
}

module.exports = { migratePublic, migrateTenants, createTenantSchema, seed, seedTenants, setupDatabase };

// Uso por CLI: node src/db/migrate.js [migrate|seed|setup]
if (require.main === module) {
  const cmd = process.argv[2] || 'migrate';
  const tasks = {
    migrate: () => setupDatabase({ withSeeds: false }),
    seed: () => seed().then(migrateTenants).then(seedTenants),
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
