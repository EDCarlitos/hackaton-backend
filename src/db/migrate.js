const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../config/db');

const PUBLIC_DIR = path.join(__dirname, 'public');
const SEEDS_DIR = path.join(__dirname, 'seeds');
const LOCK_ID = 727001; // evita que dos procesos migren al mismo tiempo

async function sqlFiles(dir) {
  const files = await fs.readdir(dir);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

// Aplica en orden los .sql de src/db/public que aún no se han corrido.
// Cada archivo corre en su propia transacción y queda registrado en public.schema_migrations.
async function migratePublic() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        nombre      text PRIMARY KEY,
        aplicado_en timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT nombre FROM public.schema_migrations');
    const aplicadas = new Set(rows.map((r) => r.nombre));

    for (const file of await sqlFiles(PUBLIC_DIR)) {
      if (aplicadas.has(file)) continue;
      const sql = await fs.readFile(path.join(PUBLIC_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations (nombre) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Migración aplicada: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falló la migración ${file}: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

// Corre todos los seeds. Deben ser idempotentes (ON CONFLICT DO NOTHING).
async function seed() {
  for (const file of await sqlFiles(SEEDS_DIR)) {
    const sql = await fs.readFile(path.join(SEEDS_DIR, file), 'utf8');
    await pool.query(sql);
    console.log(`Seed aplicado: ${file}`);
  }
}

module.exports = { migratePublic, seed };

// Uso por CLI: node src/db/migrate.js [migrate|seed|setup]
if (require.main === module) {
  const cmd = process.argv[2] || 'migrate';
  (async () => {
    if (cmd === 'migrate' || cmd === 'setup') await migratePublic();
    if (cmd === 'seed' || cmd === 'setup') await seed();
  })()
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
