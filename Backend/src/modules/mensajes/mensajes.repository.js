// Solo SQL sobre mensajes (chat del viaje) del tenant.

// Qué papel tiene el usuario en el viaje. null si el viaje no existe.
async function participacion(db, viajeId, usuarioId) {
  const { rows } = await db.query(
    `SELECT v.id, v.estado, v.conductor_id,
            v.conductor_id = $2 AS es_conductor,
            EXISTS (SELECT 1 FROM reservas r
                     WHERE r.viaje_id = v.id AND r.pasajero_id = $2 AND r.estado = 'confirmada') AS confirmado,
            EXISTS (SELECT 1 FROM reservas r
                     WHERE r.viaje_id = v.id AND r.pasajero_id = $2 AND r.estado = 'completada') AS completado
       FROM viajes v
      WHERE v.id = $1`,
    [viajeId, usuarioId],
  );
  return rows[0] || null;
}

// Conductor + pasajeros confirmados o completados (los miembros del chat de grupo).
async function participantes(db, viajeId) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre_visible, 'conductor' AS papel
       FROM viajes v JOIN usuarios u ON u.id = v.conductor_id
      WHERE v.id = $1
     UNION ALL
     SELECT u.id, u.nombre_visible, 'pasajero'
       FROM reservas r JOIN usuarios u ON u.id = r.pasajero_id
      WHERE r.viaje_id = $1 AND r.estado IN ('confirmada', 'completada')`,
    [viajeId],
  );
  return rows;
}

// Mensajes en orden; con `despuesDe` solo los nuevos (para el polling del frontend).
async function listar(db, viajeId, { despuesDe, limite }) {
  const { rows } = await db.query(
    `SELECT m.id, m.texto, m.enviado_en, m.autor_id, u.nombre_visible AS autor_nombre
       FROM mensajes m JOIN usuarios u ON u.id = m.autor_id
      WHERE m.viaje_id = $1 AND m.id > $2
      ORDER BY m.id
      LIMIT $3`,
    [viajeId, despuesDe, limite],
  );
  return rows;
}

async function insertar(db, viajeId, autorId, texto) {
  const { rows } = await db.query(
    `WITH m AS (
       INSERT INTO mensajes (viaje_id, autor_id, texto) VALUES ($1, $2, $3)
       RETURNING id, texto, enviado_en, autor_id
     )
     SELECT m.*, u.nombre_visible AS autor_nombre FROM m JOIN usuarios u ON u.id = m.autor_id`,
    [viajeId, autorId, texto],
  );
  return rows[0];
}

module.exports = { participacion, participantes, listar, insertar };
