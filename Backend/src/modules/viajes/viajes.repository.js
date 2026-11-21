// Solo SQL sobre viajes (y sus reservas) del tenant. `db` es el cliente que entrega withTenant.

const ESTADOS_ACTIVOS = ['abierto', 'lleno', 'en_curso'];
const DURACION_DEFECTO_MIN = 30; // para el traslape, si el viaje no tiene duración guardada

// Subconsulta: reservas del viaje `v` cuyos estados vienen en el parámetro `paramEstados` (ej. '$5'),
// como arreglo JSON con el pasajero y el punto de recogida.
const reservasJson = (paramEstados) => `
  coalesce((
    SELECT json_agg(json_build_object(
             'id', r.id,
             'estado', r.estado,
             'solicitada_en', r.solicitada_en,
             'respondida_en', r.respondida_en,
             'recogida', json_build_object('lat', r.recogida_lat, 'lng', r.recogida_lng, 'texto', r.recogida_texto),
             'pasajero', json_build_object('id', p.id, 'nombre_visible', p.nombre_visible)
           ) ORDER BY r.solicitada_en, r.id)
      FROM reservas r
      JOIN usuarios p ON p.id = r.pasajero_id
     WHERE r.viaje_id = v.id AND r.estado = ANY(${paramEstados}::estado_reserva[])
  ), '[]'::json)`;

async function insertar(db, d) {
  const { rows } = await db.query(
    `INSERT INTO viajes
       (conductor_id, vehiculo_id, trayecto_id,
        origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
        polilinea, distancia_km, duracion_min,
        salida_en, asientos_ofrecidos, asientos_disponibles, costo_referencia)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $15)
     RETURNING *`,
    [
      d.conductorId,
      d.vehiculoId,
      d.trayectoId,
      d.origen.lat,
      d.origen.lng,
      d.origen.texto,
      d.destino.lat,
      d.destino.lng,
      d.destino.texto,
      d.ruta.polilinea,
      d.ruta.distanciaKm,
      d.ruta.duracionMin,
      d.salidaEn,
      d.asientosOfrecidos,
      d.costoReferencia,
    ],
  );
  return rows[0];
}

// Serializa las publicaciones de un mismo conductor (evita duplicados por doble clic).
// FOR NO KEY UPDATE no bloquea los FK de otras tablas que apuntan al usuario.
async function bloquearConductor(db, conductorId) {
  await db.query('SELECT 1 FROM usuarios WHERE id = $1 FOR NO KEY UPDATE', [conductorId]);
}

// ¿El conductor ya tiene un viaje activo que se cruza con [salida, salida + duración]?
async function hayTraslape(db, conductorId, salidaEn, duracionMin) {
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM viajes
        WHERE conductor_id = $1
          AND estado = ANY($4::estado_viaje[])
          AND salida_en < $2::timestamptz + make_interval(mins => $3)
          AND salida_en + make_interval(mins => coalesce(duracion_min, $5)) > $2::timestamptz
     ) AS hay`,
    [conductorId, salidaEn, duracionMin ?? DURACION_DEFECTO_MIN, ESTADOS_ACTIVOS, DURACION_DEFECTO_MIN],
  );
  return rows[0].hay;
}

// Viaje con el nombre del conductor y la descripción del vehículo.
async function findDetalle(db, id) {
  const { rows } = await db.query(
    `SELECT v.*, u.nombre_visible AS conductor_nombre, ve.placa_o_descripcion AS vehiculo_descripcion
       FROM viajes v
       JOIN usuarios u   ON u.id = v.conductor_id
       JOIN vehiculos ve ON ve.id = v.vehiculo_id
      WHERE v.id = $1`,
    [id],
  );
  return rows[0] || null;
}

// Igual que findDetalle pero bloquea la fila del viaje hasta el fin de la transacción.
async function findParaActualizar(db, id) {
  const { rows } = await db.query(
    `SELECT v.*, u.nombre_visible AS conductor_nombre
       FROM viajes v
       JOIN usuarios u ON u.id = v.conductor_id
      WHERE v.id = $1
      FOR UPDATE OF v`,
    [id],
  );
  return rows[0] || null;
}

// RF-10 "Mis viajes": viajes del conductor con sus reservas vigentes.
// cuando: 'proximos' (salida >= ahora, ascendente) | 'pasados' (descendente) | 'todos' (descendente).
async function listarDelConductor(db, conductorId, { estados, cuando, limite }) {
  const { rows } = await db.query(
    `SELECT v.*, ve.placa_o_descripcion AS vehiculo_descripcion,
            ${reservasJson('$5')} AS reservas
       FROM viajes v
       JOIN vehiculos ve ON ve.id = v.vehiculo_id
      WHERE v.conductor_id = $1
        AND ($2::estado_viaje[] IS NULL OR v.estado = ANY($2::estado_viaje[]))
        AND CASE $3::text
              WHEN 'proximos' THEN v.salida_en >= now()
              WHEN 'pasados'  THEN v.salida_en <  now()
              ELSE true
            END
      ORDER BY CASE WHEN $3::text = 'proximos' THEN v.salida_en END ASC,
               v.salida_en DESC
      LIMIT $4`,
    [conductorId, estados, cuando, limite, ['solicitada', 'confirmada']],
  );
  return rows;
}

// Todas las reservas del viaje (cualquier estado), para el detalle que ve el conductor.
async function listarReservas(db, viajeId) {
  const { rows } = await db.query(
    `SELECT ${reservasJson('$2')} AS reservas FROM viajes v WHERE v.id = $1`,
    [viajeId, ['solicitada', 'confirmada', 'rechazada', 'cancelada', 'completada', 'expirada']],
  );
  return rows[0] ? rows[0].reservas : [];
}

async function marcarCancelado(db, id, motivo) {
  const { rows } = await db.query(
    `UPDATE viajes
        SET estado = 'cancelado', cancelado_en = now(), motivo_cancelacion = $2
      WHERE id = $1
      RETURNING *`,
    [id, motivo],
  );
  return rows[0];
}

// Cancela las reservas vigentes del viaje y devuelve a quién afectó y en qué estado estaba.
async function cancelarReservasVigentes(db, viajeId) {
  const { rows } = await db.query(
    `WITH vigentes AS (
       SELECT id, estado FROM reservas
        WHERE viaje_id = $1 AND estado IN ('solicitada', 'confirmada')
        FOR UPDATE
     )
     UPDATE reservas r
        SET estado = 'cancelada'
       FROM vigentes
      WHERE r.id = vigentes.id
     RETURNING r.id, r.pasajero_id, vigentes.estado AS estado_anterior`,
    [viajeId],
  );
  return rows;
}

// RF-13: candidatos para un pasajero. Filtra en SQL lo barato (estado, asientos, ventana de hora,
// que no sea su propio viaje); la distancia a la ruta se calcula después en JS con la polilínea.
// Debe coincidir con esReservable() de shared/utils/emparejamiento.js.
async function listarCandidatos(db, { pasajeroId, desde, hasta, deseada, limite }) {
  const { rows } = await db.query(
    `SELECT v.*, u.nombre_visible AS conductor_nombre, ve.placa_o_descripcion AS vehiculo_descripcion,
            r.id AS mi_reserva_id, r.estado AS mi_reserva_estado
       FROM viajes v
       JOIN usuarios u   ON u.id = v.conductor_id
       JOIN vehiculos ve ON ve.id = v.vehiculo_id
       LEFT JOIN reservas r
              ON r.viaje_id = v.id AND r.pasajero_id = $1 AND r.estado IN ('solicitada', 'confirmada')
      WHERE v.conductor_id <> $1
        AND v.asientos_disponibles > 0
        AND v.salida_en BETWEEN $2 AND $3
        AND (   (v.estado = 'abierto'  AND v.salida_en > now())
             OR (v.estado = 'en_curso' AND v.reservas_cierran_en > now()))
      ORDER BY abs(extract(epoch FROM v.salida_en - $4::timestamptz)), v.id
      LIMIT $5`,
    [pasajeroId, desde, hasta, deseada, limite],
  );
  return rows;
}

// Última reserva del usuario en este viaje (para el detalle que ve el pasajero).
async function findMiReserva(db, viajeId, pasajeroId) {
  const { rows } = await db.query(
    `SELECT id, estado, recogida_lat, recogida_lng, recogida_texto, distancia_pie_m
       FROM reservas WHERE viaje_id = $1 AND pasajero_id = $2
      ORDER BY id DESC LIMIT 1`,
    [viajeId, pasajeroId],
  );
  return rows[0] || null;
}

// RF-20: cierra los viajes cuya salida pasó hace más de `margenMin` minutos.
// En la misma sentencia: confirmadas → completada (suman al impacto) y solicitadas → expirada.
// Aparte, las solicitudes de viajes que YA salieron expiran aunque el viaje aún no se cierre:
// el conductor ya no puede aceptarlas.
async function cerrarVencidos(db, margenMin) {
  const { rows } = await db.query(
    `WITH cerrados AS (
       UPDATE viajes
          SET estado = 'finalizado',
              iniciado_en = coalesce(iniciado_en, salida_en),
              finalizado_en = now()
        WHERE estado IN ('abierto', 'lleno', 'en_curso')
          AND salida_en + make_interval(mins => $1) < now()
        RETURNING id
     ),
     completadas AS (
       UPDATE reservas SET estado = 'completada'
        WHERE estado = 'confirmada' AND viaje_id IN (SELECT id FROM cerrados)
        RETURNING id
     ),
     expiradas AS (
       UPDATE reservas r SET estado = 'expirada'
         FROM viajes v
        WHERE r.viaje_id = v.id AND r.estado = 'solicitada'
          AND (v.salida_en < now() OR v.id IN (SELECT id FROM cerrados))
        RETURNING r.id
     )
     SELECT (SELECT count(*) FROM cerrados)::int    AS viajes,
            (SELECT count(*) FROM completadas)::int AS completadas,
            (SELECT count(*) FROM expiradas)::int   AS expiradas`,
    [margenMin],
  );
  return rows[0];
}

module.exports = {
  insertar,
  findMiReserva,
  cerrarVencidos,
  listarCandidatos,
  bloquearConductor,
  hayTraslape,
  findDetalle,
  findParaActualizar,
  listarDelConductor,
  listarReservas,
  marcarCancelado,
  cancelarReservasVigentes,
};
