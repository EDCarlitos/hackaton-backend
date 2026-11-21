// Ubicación en vivo del conductor: una fila por viaje (solo la última posición).

// Viaje + papel del usuario + si "ahora" cae en la ventana para compartir:
// desde `antesMin` antes de la salida hasta que se cumple la duración más `despuesMin`.
async function contexto(db, viajeId, usuarioId, { antesMin, despuesMin }) {
  const { rows } = await db.query(
    `SELECT v.id, v.estado, v.salida_en, v.duracion_min,
            v.conductor_id = $2 AS es_conductor,
            EXISTS (SELECT 1 FROM reservas r
                     WHERE r.viaje_id = v.id AND r.pasajero_id = $2 AND r.estado = 'confirmada') AS confirmado,
            v.salida_en - make_interval(mins => $3) AS desde,
            v.salida_en + make_interval(mins => coalesce(v.duracion_min, 30) + $4) AS hasta
       FROM viajes v
      WHERE v.id = $1`,
    [viajeId, usuarioId, antesMin, despuesMin],
  );
  return rows[0] || null;
}

async function guardar(db, viajeId, { lat, lng, precisionM }) {
  const { rows } = await db.query(
    `INSERT INTO ubicaciones_viaje (viaje_id, lat, lng, precision_m, actualizada_en)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (viaje_id) DO UPDATE
        SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, precision_m = EXCLUDED.precision_m, actualizada_en = now()
     RETURNING lat, lng, precision_m, actualizada_en`,
    [viajeId, lat, lng, precisionM],
  );
  return rows[0];
}

async function buscar(db, viajeId) {
  const { rows } = await db.query(
    `SELECT lat, lng, precision_m, actualizada_en FROM ubicaciones_viaje WHERE viaje_id = $1`,
    [viajeId],
  );
  return rows[0] || null;
}

async function borrar(db, viajeId) {
  await db.query('DELETE FROM ubicaciones_viaje WHERE viaje_id = $1', [viajeId]);
}

// Borra las ubicaciones de viajes cerrados o cancelados, y las que ya pasaron su ventana.
async function borrarVencidas(db, despuesMin) {
  const { rowCount } = await db.query(
    `DELETE FROM ubicaciones_viaje u
      USING viajes v
      WHERE v.id = u.viaje_id
        AND (v.estado IN ('finalizado', 'cancelado')
             OR v.salida_en + make_interval(mins => coalesce(v.duracion_min, 30) + $1) < now())`,
    [despuesMin],
  );
  return rowCount;
}

module.exports = { contexto, guardar, buscar, borrar, borrarVencidas };
