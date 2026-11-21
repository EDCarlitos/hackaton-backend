// Datos de prueba para la demo, creados con la API real (el backend debe estar corriendo).
//
//   npm run demo:datos              agrega los datos (falla si los correos ya existen)
//   npm run demo:datos -- --limpiar BORRA todo lo de la institución ucaribe y vuelve a llenarla
//
// Qué crea (contraseña de todos: secreta123):
//   - Conductores con vehículo y 2 viajes redondos por día (casa → UCaribe → casa, dos veces)
//     durante los próximos 3 días. Los horarios se escalonan 15 min entre conductores, así que
//     de 6:30 a 19:45 siempre hay alguien saliendo: "Conductores disponibles" no se ve vacío.
//   - Usuarios que solo registraron su vehículo (sin viajes).
//   - Pasajeros sin viajes ni reservas.
//
// Ahorro de Google Maps: POST /viajes consulta Routes API, así que se llama UNA vez por ruta
// distinta (lugar → UCaribe y UCaribe → lugar). Si otro conductor sale del mismo lugar, su
// primer viaje copia la ruta ya calculada (igual que "Publicar de nuevo", pero entre usuarios),
// y los días siguientes usan POST /viajes/:id/republicar, que no consulta a Google.
// Incluye a ana.conductora@ y carla.conductora@: así los seeds demo viejos no se vuelven a insertar.

const { pool, quoteSchema } = require('../src/config/db');

const API = process.env.DEMO_API_URL || `http://localhost:${process.env.PORT || 3000}`;
const SCHEMA = 'ucaribe';
const DOMINIO = 'ucaribe.edu.mx';
const PASSWORD = 'secreta123';
const DIAS = 3; // mañana y los 2 siguientes (si ya es tarde, "hoy" no tiene sentido)
const ZONA = '-05:00'; // Cancún, sin horario de verano

// Mismos lugares que el frontend (Frontend/src/lib/geo.js).
const LUGARES = {
  ucaribe: { texto: 'Universidad del Caribe', lat: 21.2004, lng: -86.8226 },
  kabah: { texto: 'Plaza Cancún 2000 (Av. Kabah)', lat: 21.1762, lng: -86.8492 },
  otoch: { texto: 'Villas Otoch Paraíso', lat: 21.1826, lng: -86.8678 },
  talleres: { texto: 'Av. Talleres y Av. Kabah', lat: 21.1801, lng: -86.8592 },
  r96: { texto: 'Región 96', lat: 21.165, lng: -86.861 },
  americas: { texto: 'Plaza Las Américas', lat: 21.1472, lng: -86.8236 },
  m28: { texto: 'Mercado 28', lat: 21.1619, lng: -86.833 },
  sm200: { texto: 'Supermanzana 200', lat: 21.145, lng: -86.87 },
  tajamar: { texto: 'Malecón Tajamar', lat: 21.1564, lng: -86.818 },
  pjuarez: { texto: 'Puerto Juárez', lat: 21.183, lng: -86.8055 },
};

// [correo, nombre, vehículo, asientos, lugar de casa, costo]
const CONDUCTORES = [
  ['ana.conductora', 'Ana López', 'Nissan March gris · UXP-123-A', 4, 'otoch', 20],
  ['carla.conductora', 'Carla Uc', 'Kia Rio blanco · UXR-554-B', 3, 'r96', 15],
  ['luis.pech', 'Luis Pech', 'Chevrolet Aveo blanco · URT-456-C', 2, 'americas', 25],
  ['jorge.canche', 'Jorge Canché', 'VW Vento rojo · UKL-210-D', 3, 'kabah', null],
  ['rosa.tun', 'Rosa Tun', 'Toyota Yaris rojo · UKL-654-E', 2, 'sm200', 20],
  ['pedro.may', 'Pedro May', 'Nissan Versa azul · UTS-301-F', 4, 'talleres', 15],
  ['mariana.chi', 'Mariana Chi', 'Mazda 2 gris · UVM-778-G', 3, 'm28', 20],
  ['diego.ku', 'Diego Ku', 'Honda City negro · UWD-912-H', 3, 'tajamar', 25],
  ['fernanda.poot', 'Fernanda Poot', 'Hyundai Grand i10 blanco · UXF-440-J', 3, 'pjuarez', null],
  ['ricardo.cauich', 'Ricardo Cauich', 'Ford Figo plata · UYR-118-K', 4, 'otoch', 15],
  ['paola.dzib', 'Paola Dzib', 'Chevrolet Spark verde · UZP-623-L', 3, 'kabah', 10],
  ['andres.balam', 'Andrés Balam', 'Renault Logan gris · UAB-337-M', 4, 'americas', 20],
  ['karla.ek', 'Karla Ek', 'Seat Ibiza blanco · UBK-845-N', 2, 'r96', null],
  ['emilio.cen', 'Emilio Cen', 'Nissan Kicks azul · UCE-206-P', 4, 'sm200', 25],
  ['lucia.pool', 'Lucía Pool', 'Toyota Corolla gris · UDL-571-R', 3, 'talleres', 15],
  ['hector.moo', 'Héctor Moo', 'VW Gol blanco · UEH-689-S', 3, 'm28', 10],
];

// 24 conductores más, generados: reparten los 9 lugares para que casi cualquier búsqueda tenga
// resultados. No cuestan llamadas a Google (sus rutas ya existen).
const NOMBRES = ['Alejandro', 'Brenda', 'César', 'Diana', 'Eduardo', 'Fabiola', 'Gerardo', 'Itzel', 'Jesús', 'Laura', 'Manuel', 'Nayeli'];
const APELLIDOS = ['Caamal', 'Ek', 'Itzá', 'Kantún', 'Mukul', 'Pat', 'Sosa', 'Tamayo', 'Uicab', 'Yam'];
const AUTOS = [
  ['Nissan March', 4], ['Chevrolet Aveo', 4], ['Kia Rio', 3], ['VW Vento', 4], ['Toyota Yaris', 3], ['Mazda 2', 3],
  ['Hyundai Accent', 4], ['Honda City', 3], ['Renault Kwid', 2], ['Suzuki Swift', 3],
];
const COLORES = ['blanco', 'gris', 'rojo', 'azul', 'negro', 'plata'];
const CASAS = ['kabah', 'otoch', 'talleres', 'r96', 'americas', 'm28', 'sm200', 'tajamar', 'pjuarez'];
for (let i = 0; i < 24; i += 1) {
  const nombre = `${NOMBRES[i % NOMBRES.length]} ${APELLIDOS[(i * 7) % APELLIDOS.length]}`;
  const [auto, asientos] = AUTOS[i % AUTOS.length];
  const placa = `U${String.fromCharCode(75 + (i % 15))}${String.fromCharCode(65 + ((i * 3) % 26))}-${String(100 + i * 37).slice(-3)}-${String.fromCharCode(65 + (i % 26))}`;
  const usuario = nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(' ', '.');
  const costo = [null, 10, 15, 20, 25][i % 5];
  CONDUCTORES.push([`${usuario}${i}`, nombre, `${auto} ${COLORES[i % COLORES.length]} · ${placa}`, asientos, CASAS[i % CASAS.length], costo]);
}

// Horarios del conductor i: ida a las 6:30 + 15 min × i; regresa 4:30 h después, vuelve a ir
// 1:30 h más tarde y regresa 3:30 h después (de 6:30 a ~20:00 siempre sale alguien).
function horarios(i) {
  // 16 salidas cada 15 min (6:30–10:15); a partir del conductor 17 se recorren 5 y 10 min.
  const base = 6 * 60 + 30 + 15 * (i % 16) + 5 * Math.floor(i / 16);
  const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return { ida: [hhmm(base), hhmm(base + 360)], vuelta: [hhmm(base + 270), hhmm(base + 570)] };
}

// Registraron su vehículo pero todavía no publican viajes.
const SOLO_VEHICULO = [
  ['raul.couoh', 'Raúl Couoh', 'Jeep Renegade negro · UFR-102-T', 4],
  ['daniela.xool', 'Daniela Xool', 'Kia Picanto rojo · UGD-233-U', 3],
  ['oscar.tzec', 'Óscar Tzec', 'Nissan Sentra plata · UHO-364-V', 4],
  ['gabriela.noh', 'Gabriela Noh', 'Suzuki Swift azul · UIG-495-W', 3],
  ['ivan.chan', 'Iván Chan', 'Honda Fit gris · UJI-526-X', 4],
];

// Solo pasajeros: sin vehículo, sin viajes ni reservas.
const PASAJEROS = [
  ['valeria.pasajera', 'Valeria Ortiz'],
  ['sofia.pasajera', 'Sofía Hernández'],
  ['maria.canul', 'María Canul'],
  ['miguel.uc', 'Miguel Uc'],
  ['andrea.pech', 'Andrea Pech'],
  ['sebastian.cool', 'Sebastián Cool'],
  ['natalia.may', 'Natalia May'],
  ['camila.koh', 'Camila Koh'],
];

async function api(metodo, ruta, { token, body } = {}) {
  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const datos = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${metodo} ${ruta} → ${res.status} ${JSON.stringify(datos?.error ?? datos)}`);
  return datos;
}

const registrar = (usuario, nombre) =>
  api('POST', '/auth/register', {
    body: { correo: `${usuario}@${DOMINIO}`, password: PASSWORD, nombre_visible: nombre, acepto_terminos: true },
  });

// "2026-11-21T07:00:00-05:00": día `d` a partir de mañana, a la hora HH:MM de Cancún.
function salida(d, hhmm) {
  const fecha = new Date(Date.now() + (d + 1) * 86_400_000 - 5 * 3_600_000) // fecha de Cancún
    .toISOString()
    .slice(0, 10);
  return `${fecha}T${hhmm}:00${ZONA}`;
}

async function limpiar() {
  const s = quoteSchema(SCHEMA);
  await pool.query(
    `TRUNCATE ${s}.mensajes, ${s}.notificaciones, ${s}.reservas, ${s}.viajes, ${s}.trayectos, ${s}.vehiculos, ${s}.usuarios RESTART IDENTITY CASCADE`,
  );
  console.log(`Limpio: tablas de ${SCHEMA} vaciadas (migraciones e institución intactas).`);
}

// Copia la ruta de un viaje ya publicado a un viaje nuevo de otro conductor (sin consultar Google).
async function copiarViaje(origenId, { conductorId, vehiculoId, salidaEn, asientos, costo }) {
  const s = quoteSchema(SCHEMA);
  const { rows } = await pool.query(
    `INSERT INTO ${s}.viajes (conductor_id, vehiculo_id, origen_lat, origen_lng, origen_texto, destino_lat, destino_lng,
                              destino_texto, polilinea, distancia_km, duracion_min, salida_en, asientos_ofrecidos,
                              asientos_disponibles, costo_referencia)
     SELECT $1, $2, origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto, polilinea,
            distancia_km, duracion_min, $3, $4, $4, $5
       FROM ${s}.viajes WHERE id = $6
     RETURNING id`,
    [conductorId, vehiculoId, salidaEn, asientos, costo, origenId],
  );
  return rows[0].id;
}

async function main() {
  if (process.argv.includes('--limpiar')) await limpiar();

  const rutas = new Map(); // "otoch→ucaribe" → id del primer viaje con esa ruta
  let consultasGoogle = 0;
  let viajes = 0;

  for (const [i, [usuario, nombre, auto, asientos, casa, costo]] of CONDUCTORES.entries()) {
    const { ida, vuelta } = horarios(i);
    const { token, usuario: u } = await registrar(usuario, nombre);
    const { vehiculo } = await api('POST', '/vehiculos', { token, body: { placa_o_descripcion: auto, asientos } });
    const lugares = Math.max(1, asientos - 1); // deja un asiento libre de margen

    for (const [desde, hasta, [hhmm, hhmm2]] of [
      [casa, 'ucaribe', ida],
      ['ucaribe', casa, vuelta],
    ]) {
      const clave = `${desde}→${hasta}`;
      let primero;
      if (rutas.has(clave)) {
        primero = await copiarViaje(rutas.get(clave), {
          conductorId: u.id,
          vehiculoId: vehiculo.id,
          salidaEn: salida(0, hhmm),
          asientos: lugares,
          costo,
        });
      } else {
        const { viaje } = await api('POST', '/viajes', {
          token,
          body: {
            vehiculo_id: vehiculo.id,
            origen: LUGARES[desde],
            destino: LUGARES[hasta],
            salida_en: salida(0, hhmm),
            asientos_ofrecidos: lugares,
            costo_referencia: costo ?? undefined,
          },
        });
        primero = viaje.id;
        rutas.set(clave, viaje.id);
        consultasGoogle += 1;
      }
      viajes += 1;
      // El segundo viaje del día y los días siguientes: "Publicar de nuevo" (API), sin Google.
      for (let d = 0; d < DIAS; d += 1) {
        for (const h of d === 0 ? [hhmm2] : [hhmm, hhmm2]) {
          await api('POST', `/viajes/${primero}/republicar`, { token, body: { salida_en: salida(d, h) } });
          viajes += 1;
        }
      }
    }
    console.log(`  conductor ${nombre} (${LUGARES[casa].texto})`);
  }

  for (const [usuario, nombre, auto, asientos] of SOLO_VEHICULO) {
    const { token } = await registrar(usuario, nombre);
    await api('POST', '/vehiculos', { token, body: { placa_o_descripcion: auto, asientos } });
  }
  for (const [usuario, nombre] of PASAJEROS) await registrar(usuario, nombre);

  console.log(
    `Listo: ${CONDUCTORES.length} conductores, ${SOLO_VEHICULO.length} solo con vehículo, ${PASAJEROS.length} pasajeros, ` +
      `${viajes} viajes (${DIAS} días). Consultas a Google Routes: ${consultasGoogle}. Contraseña: ${PASSWORD}`,
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
