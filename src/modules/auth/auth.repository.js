// Solo SQL sobre tablas del tenant. `db` es el cliente que entrega withTenant.

const COLUMNAS_PUBLICAS = `id, correo, nombre_visible, rol, correo_verificado_en, acepto_terminos_en, activo, creado_en`;

async function createUsuario(db, { correo, passwordHash, nombreVisible, aceptoTerminos }) {
  const { rows } = await db.query(
    `INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
     VALUES ($1, $2, $3, CASE WHEN $4 THEN now() END)
     RETURNING ${COLUMNAS_PUBLICAS}`,
    [correo, passwordHash, nombreVisible, aceptoTerminos],
  );
  return rows[0];
}

async function findUsuarioById(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = $1`, [id]);
  return rows[0] || null;
}

module.exports = { createUsuario, findUsuarioById };
