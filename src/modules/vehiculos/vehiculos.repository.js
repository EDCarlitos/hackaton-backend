// Solo SQL sobre la tabla vehiculos del tenant. `db` es el cliente que entrega withTenant.

const COLUMNAS = 'id, usuario_id, placa_o_descripcion, asientos, activo';

async function insertar(db, { usuarioId, placaODescripcion, asientos }) {
  const { rows } = await db.query(
    `INSERT INTO vehiculos (usuario_id, placa_o_descripcion, asientos)
     VALUES ($1, $2, $3)
     RETURNING ${COLUMNAS}`,
    [usuarioId, placaODescripcion, asientos],
  );
  return rows[0];
}

async function listarDelUsuario(db, usuarioId, { soloActivos = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS} FROM vehiculos
      WHERE usuario_id = $1 AND (activo OR NOT $2)
      ORDER BY activo DESC, id`,
    [usuarioId, soloActivos],
  );
  return rows;
}

async function findDelUsuario(db, usuarioId, id) {
  const { rows } = await db.query(`SELECT ${COLUMNAS} FROM vehiculos WHERE id = $1 AND usuario_id = $2`, [
    id,
    usuarioId,
  ]);
  return rows[0] || null;
}

async function desactivar(db, usuarioId, id) {
  const { rows } = await db.query(
    `UPDATE vehiculos SET activo = false
      WHERE id = $1 AND usuario_id = $2
      RETURNING ${COLUMNAS}`,
    [id, usuarioId],
  );
  return rows[0] || null;
}

module.exports = { insertar, listarDelUsuario, findDelUsuario, desactivar };
