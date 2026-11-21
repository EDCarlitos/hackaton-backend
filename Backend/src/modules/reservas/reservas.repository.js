// Solo SQL sobre reservas (y la fila del viaje que se bloquea) del tenant.

const COLUMNAS = `id, viaje_id, pasajero_id, recogida_lat, recogida_lng, recogida_texto,
  bajada_lat, bajada_lng, distancia_pie_m, estado, solicitada_en, respondida_en`;

// Bloquea el viaje hasta el fin de la transacción: serializa solicitudes, cancelaciones y
// cambios de asientos_disponibles sobre el mismo viaje.
async function bloquearViaje(db, viajeId) {
  const { rows } = await db.query(
    `SELECT v.id, v.conductor_id, v.estado, v.salida_en, v.reservas_cierran_en, v.asientos_disponibles,
            v.asientos_ofrecidos, v.duracion_min, v.polilinea, v.destino_texto
       FROM viajes v
      WHERE v.id = $1
      FOR UPDATE`,
    [viajeId],
  );
  return rows[0] || null;
}

async function findVigente(db, viajeId, pasajeroId) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS} FROM reservas
      WHERE viaje_id = $1 AND pasajero_id = $2 AND estado IN ('solicitada', 'confirmada')`,
    [viajeId, pasajeroId],
  );
  return rows[0] || null;
}

async function insertar(db, d) {
  const { rows } = await db.query(
    `INSERT INTO reservas
       (viaje_id, pasajero_id, recogida_lat, recogida_lng, recogida_texto, bajada_lat, bajada_lng, distancia_pie_m)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNAS}`,
    [
      d.viajeId,
      d.pasajeroId,
      d.recogida.lat,
      d.recogida.lng,
      d.recogida.texto,
      d.bajada?.lat ?? null,
      d.bajada?.lng ?? null,
      d.distanciaPieM,
    ],
  );
  return rows[0];
}

// `bloquear`: FOR UPDATE. Bloquear el viaje ANTES que la reserva (mismo orden que al cancelar
// un viaje) para no provocar deadlocks.
async function findDelPasajero(db, pasajeroId, id, { bloquear = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS} FROM reservas WHERE id = $1 AND pasajero_id = $2 ${bloquear ? 'FOR UPDATE' : ''}`,
    [id, pasajeroId],
  );
  return rows[0] || null;
}

async function marcarCancelada(db, id) {
  const { rows } = await db.query(
    `UPDATE reservas SET estado = 'cancelada' WHERE id = $1 RETURNING ${COLUMNAS}`,
    [id],
  );
  return rows[0];
}

// Al cancelar una reserva confirmada: se libera el asiento y, si el viaje estaba lleno, se reabre.
async function liberarAsiento(db, viajeId) {
  await db.query(
    `UPDATE viajes
        SET asientos_disponibles = asientos_disponibles + 1,
            estado = CASE WHEN estado = 'lleno' THEN 'abierto'::estado_viaje ELSE estado END
      WHERE id = $1`,
    [viajeId],
  );
}

// Reserva de un viaje del conductor. `bloquear`: FOR UPDATE (después de bloquear el viaje).
async function findParaConductor(db, conductorId, id, { bloquear = false } = {}) {
  const { rows } = await db.query(
    `SELECT r.id, r.viaje_id, r.pasajero_id, r.recogida_lat, r.recogida_lng, r.recogida_texto,
            r.bajada_lat, r.bajada_lng, r.distancia_pie_m, r.estado, r.solicitada_en, r.respondida_en
       FROM reservas r
       JOIN viajes v ON v.id = r.viaje_id
      WHERE r.id = $1 AND v.conductor_id = $2
      ${bloquear ? 'FOR UPDATE OF r' : ''}`,
    [id, conductorId],
  );
  return rows[0] || null;
}

async function responder(db, id, estado) {
  const { rows } = await db.query(
    `UPDATE reservas SET estado = $2, respondida_en = now() WHERE id = $1 RETURNING ${COLUMNAS}`,
    [id, estado],
  );
  return rows[0];
}

// Descuenta un asiento; si llega a 0 el viaje pasa a lleno. El CHECK chk_asientos_disponibles
// impide bajar de 0 aunque algo falle antes.
async function ocuparAsiento(db, viajeId) {
  const { rows } = await db.query(
    `UPDATE viajes
        SET asientos_disponibles = asientos_disponibles - 1,
            estado = CASE WHEN asientos_disponibles - 1 = 0 THEN 'lleno'::estado_viaje ELSE estado END
      WHERE id = $1
      RETURNING id, estado, asientos_disponibles, asientos_ofrecidos`,
    [viajeId],
  );
  return rows[0];
}

// RF-21: al llenarse, las solicitudes que siguen pendientes se rechazan.
async function rechazarPendientes(db, viajeId) {
  const { rows } = await db.query(
    `UPDATE reservas SET estado = 'rechazada', respondida_en = now()
      WHERE viaje_id = $1 AND estado = 'solicitada'
      RETURNING id, pasajero_id`,
    [viajeId],
  );
  return rows;
}

// Serializa las solicitudes de un mismo pasajero (RF-22). FOR NO KEY UPDATE no bloquea FKs.
async function bloquearUsuario(db, id) {
  await db.query('SELECT 1 FROM usuarios WHERE id = $1 FOR NO KEY UPDATE', [id]);
}

// RF-22: ¿el pasajero ya tiene una reserva vigente en otro viaje que se cruza con este?
// Cada viaje ocupa [salida_en, salida_en + duracion_min] (30 min si no hay duración).
async function hayTraslapeDelPasajero(db, pasajeroId, viajeId) {
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1
         FROM viajes v
         JOIN reservas r   ON r.pasajero_id = $1 AND r.estado IN ('solicitada', 'confirmada')
         JOIN viajes otro  ON otro.id = r.viaje_id AND otro.id <> v.id
        WHERE v.id = $2
          AND otro.salida_en < v.salida_en + make_interval(mins => coalesce(v.duracion_min, 30))
          AND otro.salida_en + make_interval(mins => coalesce(otro.duracion_min, 30)) > v.salida_en
     ) AS hay`,
    [pasajeroId, viajeId],
  );
  return rows[0].hay;
}

// Detalle para el pasajero o el conductor del viaje (RF-18). null si no es ninguno de los dos.
async function findDetalle(db, usuarioId, id) {
  const { rows } = await db.query(
    `SELECT r.id, r.viaje_id, r.pasajero_id, r.recogida_lat, r.recogida_lng, r.recogida_texto,
            r.bajada_lat, r.bajada_lng, r.distancia_pie_m, r.estado, r.solicitada_en, r.respondida_en,
            p.nombre_visible AS pasajero_nombre,
            v.estado AS viaje_estado, v.salida_en, v.costo_referencia, v.polilinea, v.distancia_km, v.duracion_min,
            v.origen_lat, v.origen_lng, v.origen_texto, v.destino_lat, v.destino_lng, v.destino_texto,
            v.conductor_id, u.nombre_visible AS conductor_nombre, ve.placa_o_descripcion AS vehiculo_descripcion
       FROM reservas r
       JOIN usuarios p   ON p.id = r.pasajero_id
       JOIN viajes v     ON v.id = r.viaje_id
       JOIN usuarios u   ON u.id = v.conductor_id
       JOIN vehiculos ve ON ve.id = v.vehiculo_id
      WHERE r.id = $1 AND (r.pasajero_id = $2 OR v.conductor_id = $2)`,
    [id, usuarioId],
  );
  return rows[0] || null;
}

async function nombreDeUsuario(db, id) {
  const { rows } = await db.query('SELECT nombre_visible FROM usuarios WHERE id = $1', [id]);
  return rows[0]?.nombre_visible ?? 'Un pasajero';
}

// Reservas del pasajero con el resumen del viaje.
// cuando: 'proximas' (viaje aún no sale, ascendente) | 'pasadas' | 'todas' (descendente).
async function listarDelPasajero(db, pasajeroId, { cuando, limite }) {
  const { rows } = await db.query(
    `SELECT r.id, r.viaje_id, r.pasajero_id, r.recogida_lat, r.recogida_lng, r.recogida_texto,
            r.bajada_lat, r.bajada_lng, r.distancia_pie_m, r.estado, r.solicitada_en, r.respondida_en,
            v.estado AS viaje_estado, v.salida_en, v.costo_referencia, v.polilinea, v.distancia_km, v.duracion_min,
            v.origen_lat, v.origen_lng, v.origen_texto, v.destino_lat, v.destino_lng, v.destino_texto,
            v.conductor_id, u.nombre_visible AS conductor_nombre, ve.placa_o_descripcion AS vehiculo_descripcion
       FROM reservas r
       JOIN viajes v     ON v.id = r.viaje_id
       JOIN usuarios u   ON u.id = v.conductor_id
       JOIN vehiculos ve ON ve.id = v.vehiculo_id
      WHERE r.pasajero_id = $1
        AND CASE $2::text
              WHEN 'proximas' THEN v.salida_en >= now()
              WHEN 'pasadas'  THEN v.salida_en <  now()
              ELSE true
            END
      ORDER BY CASE WHEN $2::text = 'proximas' THEN v.salida_en END ASC,
               v.salida_en DESC, r.id DESC
      LIMIT $3`,
    [pasajeroId, cuando, limite],
  );
  return rows;
}

module.exports = {
  bloquearViaje,
  findVigente,
  insertar,
  findDelPasajero,
  marcarCancelada,
  liberarAsiento,
  nombreDeUsuario,
  listarDelPasajero,
  findParaConductor,
  responder,
  ocuparAsiento,
  rechazarPendientes,
  bloquearUsuario,
  hayTraslapeDelPasajero,
  findDetalle,
};
