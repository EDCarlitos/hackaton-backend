// Borra y recrea la base de datos de tests antes de cada corrida de `npm test`.
// Se conecta a la base "postgres" porque no se puede borrar la base a la que estás conectado.
const { Client, escapeIdentifier } = require('pg');

const dbName = process.env.POSTGRES_DB;

if (!dbName || !dbName.endsWith('_test')) {
  console.error(`Abortado: POSTGRES_DB="${dbName}" no termina en _test. ¿Cargaste .env.test?`);
  process.exit(1);
}

(async () => {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(dbName)} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${escapeIdentifier(dbName)}`);
    console.log(`Base de datos de tests lista: ${dbName}`);
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error('No se pudo preparar la base de tests:', err.message);
  process.exit(1);
});
