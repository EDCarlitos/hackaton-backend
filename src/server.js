const app = require('./app');
const { migratePublic, seed } = require('./db/migrate');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await migratePublic();
    if (process.env.NODE_ENV !== 'production') await seed();
  } catch (err) {
    console.error('Error preparando la base de datos:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
  });
}

start();
