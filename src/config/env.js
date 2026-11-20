// Lee y valida las variables de entorno una sola vez. El resto del código importa de aquí.

function required(name, { minLength = 1 } = {}) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name} (revisa tu .env)`);
  if (value.length < minLength) {
    throw new Error(`${name} debe tener al menos ${minLength} caracteres`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
    database: required('POSTGRES_DB'),
  },
  jwt: {
    secret: required('JWT_SECRET', { minLength: 32 }),
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  platformAdminKey: required('PLATFORM_ADMIN_KEY', { minLength: 24 }),
};

module.exports = env;
