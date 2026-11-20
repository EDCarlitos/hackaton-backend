const env = require('./config/env');
const app = require('./app');
const { setupDatabase } = require('./db/migrate');

async function start() {
  try {
    await setupDatabase({ withSeeds: env.nodeEnv !== 'production' });
  } catch (err) {
    console.error('Error preparando la base de datos:', err.message);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`Servidor escuchando en http://localhost:${env.port}`);
  });
}

start();
