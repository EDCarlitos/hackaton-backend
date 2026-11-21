// Lee y valida las variables de entorno una sola vez. El resto del código importa de aquí.

function required(name, { minLength = 1 } = {}) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name} (revisa tu .env)`);
  if (value.length < minLength) {
    throw new Error(`${name} debe tener al menos ${minLength} caracteres`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';

// Proveedor de rutas: "google" (Routes API) o "simulado" (línea quebrada + haversine, sin red).
// Sin MAPS_PROVIDER: google si hay API key; si no, simulado (prohibido en producción).
function leerMapas() {
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  const proveedor = process.env.MAPS_PROVIDER || (googleApiKey ? 'google' : 'simulado');

  if (!['google', 'simulado'].includes(proveedor)) {
    throw new Error(`MAPS_PROVIDER inválido: "${proveedor}" (usa google o simulado)`);
  }
  if (proveedor === 'google' && !googleApiKey) {
    throw new Error('MAPS_PROVIDER=google requiere GOOGLE_MAPS_API_KEY');
  }
  if (proveedor === 'simulado' && nodeEnv === 'production' && !process.env.MAPS_PROVIDER) {
    throw new Error('En producción falta GOOGLE_MAPS_API_KEY (o pon MAPS_PROVIDER=simulado a propósito)');
  }
  return { proveedor, googleApiKey };
}

// Zona horaria para "Salgo hoy" y para los textos de las notificaciones.
function leerZonaHoraria() {
  const zona = process.env.APP_TIMEZONE || 'America/Cancun';
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: zona });
  } catch {
    throw new Error(`APP_TIMEZONE inválida: "${zona}" (ej. America/Cancun)`);
  }
  return zona;
}

const env = {
  nodeEnv,
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
  mapas: leerMapas(),
  zonaHoraria: leerZonaHoraria(),
};

module.exports = env;
