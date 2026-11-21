// Solo SQL sobre trayectos (plantillas de ruta) del tenant.

const SELECT_TRAYECTO = `
  SELECT t.*, ve.placa_o_descripcion AS vehiculo_descripcion, ve.activo AS vehiculo_activo
    FROM trayectos t
    JOIN vehiculos ve ON ve.id = t.vehiculo_id`;

async function insertar(db, d) {
  const { rows } = await db.query(
    `WITH t AS (
       INSERT INTO trayectos
         (conductor_id, vehiculo_id, nombre, hora_habitual, asientos,
          origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
          polilinea, distancia_km, duracion_min)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *
     )
     SELECT t.*, ve.placa_o_descripcion AS vehiculo_descripcion, ve.activo AS vehiculo_activo
       FROM t JOIN vehiculos ve ON ve.id = t.vehiculo_id`,
    [
      d.conductorId,
      d.vehiculoId,
      d.nombre,
      d.horaHabitual,
      d.asientos,
      d.origen.lat,
      d.origen.lng,
      d.origen.texto,
      d.destino.lat,
      d.destino.lng,
      d.destino.texto,
      d.ruta.polilinea,
      d.ruta.distanciaKm,
      d.ruta.duracionMin,
    ],
  );
  return rows[0];
}

async function listarDelConductor(db, conductorId) {
  const { rows } = await db.query(`${SELECT_TRAYECTO} WHERE t.conductor_id = $1 ORDER BY t.hora_habitual NULLS LAST, t.id`, [
    conductorId,
  ]);
  return rows;
}

async function findDelConductor(db, conductorId, id) {
  const { rows } = await db.query(`${SELECT_TRAYECTO} WHERE t.id = $1 AND t.conductor_id = $2`, [id, conductorId]);
  return rows[0] || null;
}

async function eliminar(db, conductorId, id) {
  const { rowCount } = await db.query('DELETE FROM trayectos WHERE id = $1 AND conductor_id = $2', [id, conductorId]);
  return rowCount === 1;
}

// "Hoy a las HH:MM" en la zona horaria dada, como timestamptz (respeta cambios de horario).
async function salidaHoy(db, hora, zonaHoraria) {
  const { rows } = await db.query(
    'SELECT ((now() AT TIME ZONE $2)::date + $1::time) AT TIME ZONE $2 AS salida_en',
    [hora, zonaHoraria],
  );
  return rows[0].salida_en;
}

module.exports = { insertar, listarDelConductor, findDelConductor, eliminar, salidaHoy };
