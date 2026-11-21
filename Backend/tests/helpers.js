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

const PASSWORD = 'secreta123';

// Registra un usuario en ucaribe y le ajusta activo/rol directo en la BD.
// Devuelve { correo, password, usuario, token }.
async function crearUsuario({ activo = true, rol = 'usuario' } = {}) {
  const correo = `u_${unico()}@ucaribe.edu.mx`;
  const { body } = await api()
    .post('/auth/register')
    .send({ correo, password: PASSWORD, nombre_visible: 'Usuario Prueba' })
    .expect(201);
  await pool.query(
    `UPDATE ucaribe.usuarios
        SET activo = $2, rol = $3
      WHERE id = $1`,
    [body.usuario.id, activo, rol],
  );
  return { correo, password: PASSWORD, usuario: body.usuario, token: body.token };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Usuario de ucaribe con un vehículo registrado por la API. Devuelve { ...crearUsuario(), vehiculo }.
async function crearConductor({ asientos = 4 } = {}) {
  const u = await crearUsuario();
  const { body } = await api()
    .post('/vehiculos')
    .set(auth(u.token))
    .send({ placa_o_descripcion: 'Auto de prueba', asientos })
    .expect(201);
  return { ...u, vehiculo: body.vehiculo };
}

// Fecha ISO (con Z) a `horas` de ahora.
const enHoras = (horas) => new Date(Date.now() + horas * 3_600_000).toISOString();

const ORIGEN = { lat: 21.1826, lng: -86.8678, texto: 'Villas Otoch' };
const DESTINO = { lat: 21.2004, lng: -86.8226, texto: 'Universidad del Caribe' };

const datosViaje = (extra = {}) => ({
  origen: ORIGEN,
  destino: DESTINO,
  salida_en: enHoras(24),
  asientos_ofrecidos: 3,
  ...extra,
});

function publicarViaje(token, extra) {
  return api().post('/viajes').set(auth(token)).send(datosViaje(extra));
}

// Reserva insertada directo en la BD (el módulo de reservas es de otro requisito).
async function crearReserva(viajeId, pasajeroId, estado = 'solicitada') {
  const { rows } = await pool.query(
    `INSERT INTO ucaribe.reservas (viaje_id, pasajero_id, recogida_lat, recogida_lng, recogida_texto, estado)
     VALUES ($1, $2, 21.18, -86.85, 'Parada de prueba', $3) RETURNING *`,
    [viajeId, pasajeroId, estado],
  );
  return rows[0];
}

// Zona geográfica exclusiva (cada llamada se desplaza ~11 km al sur de Cancún), para que las
// búsquedas de un test no vean los viajes de otros. La ruta simulada es una "L": sube por la
// longitud del origen y luego va al este por la latitud del destino.
// Origen y destino ya caen en la cuadrícula de 3 decimales, así que el redondeo de privacidad
// (geo.aproximar) no los mueve y las distancias de abajo se conservan.
let zonas = 0;
function zonaDePrueba() {
  zonas += 1;
  const lat = 19 + zonas * 0.1;
  const r6 = (x) => Math.round(x * 1e6) / 1e6; // igual que numeric(9,6) de la BD
  return {
    origen: { lat: r6(lat), lng: -86.868, texto: 'Origen de prueba' },
    destino: { lat: r6(lat + 0.018), lng: -86.823, texto: 'Destino de prueba' },
    cerca: { lat: r6(lat + 0.008), lng: -86.8672, texto: 'Esquina cercana' }, // ~84 m del tramo vertical
    cercaDelInicio: { lat: r6(lat + 0.001), lng: -86.8674 }, // ~63 m, al principio de la ruta
    cercaDelDestino: { lat: r6(lat + 0.0172), lng: -86.83 }, // ~89 m, al final de la ruta
    lejos: { lat: r6(lat + 0.008), lng: -86.85 }, // ~1.8 km
  };
}

// Publica un viaje en la zona dada. Devuelve el viaje.
async function publicarEnZona(conductor, zona, extra = {}) {
  const res = await publicarViaje(conductor.token, { origen: zona.origen, destino: zona.destino, ...extra });
  if (res.status !== 201) throw new Error(`No se pudo publicar: ${JSON.stringify(res.body)}`);
  return res.body.viaje;
}

module.exports = {
  zonaDePrueba,
  publicarEnZona,
  api,
  pool,
  prepararBD,
  cerrarBD,
  crearInstitucion,
  crearUsuario,
  crearConductor,
  crearReserva,
  publicarViaje,
  datosViaje,
  enHoras,
  auth,
  ORIGEN,
  DESTINO,
  unico,
  schemaExiste,
};
