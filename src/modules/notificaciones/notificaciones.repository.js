// Solo SQL sobre la tabla notificaciones del tenant.

const COLUMNAS = 'id, tipo, titulo, mensaje, viaje_id, leida_en, creada_en';

// Una notificación igual para cada usuario de la lista.
async function insertarParaUsuarios(db, usuarioIds, { tipo, titulo, mensaje, viajeId }) {
  if (!usuarioIds.length) return [];
  const { rows } = await db.query(
    `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, viaje_id)
     SELECT u, $2, $3, $4, $5 FROM unnest($1::int[]) AS u
     RETURNING usuario_id, ${COLUMNAS}`,
    [usuarioIds, tipo, titulo, mensaje, viajeId],
  );
  return rows;
}

async function listarDelUsuario(db, usuarioId, { soloNoLeidas, limite }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS} FROM notificaciones
      WHERE usuario_id = $1 AND (leida_en IS NULL OR NOT $2)
      ORDER BY creada_en DESC, id DESC
      LIMIT $3`,
    [usuarioId, soloNoLeidas, limite],
  );
  return rows;
}

async function contarNoLeidas(db, usuarioId) {
  const { rows } = await db.query(
    'SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND leida_en IS NULL',
    [usuarioId],
  );
  return rows[0].n;
}

async function marcarLeida(db, usuarioId, id) {
  const { rows } = await db.query(
    `UPDATE notificaciones SET leida_en = coalesce(leida_en, now())
      WHERE id = $1 AND usuario_id = $2
      RETURNING ${COLUMNAS}`,
    [id, usuarioId],
  );
  return rows[0] || null;
}

module.exports = { insertarParaUsuarios, listarDelUsuario, contarNoLeidas, marcarLeida };
