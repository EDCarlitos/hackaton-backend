// Solo SQL sobre tablas de public. `db` puede ser el pool o un cliente en transacción.

async function insertInstitucion(db, { nombre, schemaNombre }) {
  const { rows } = await db.query(
    `INSERT INTO public.instituciones (nombre, schema_nombre)
     VALUES ($1, $2)
     RETURNING id, nombre, schema_nombre, activo, creado_en`,
    [nombre, schemaNombre],
  );
  return rows[0];
}

async function insertDominios(db, institucionId, dominios) {
  if (!dominios.length) return [];
  const { rows } = await db.query(
    `INSERT INTO public.dominios_permitidos (institucion_id, dominio)
     SELECT $1, unnest($2::text[])
     RETURNING id, dominio, activo`,
    [institucionId, dominios],
  );
  return rows;
}

async function findActivaPorDominio(db, dominio) {
  const { rows } = await db.query(
    `SELECT i.id, i.schema_nombre
       FROM public.dominios_permitidos d
       JOIN public.instituciones i ON i.id = d.institucion_id
      WHERE d.dominio = $1 AND d.activo AND i.activo`,
    [dominio],
  );
  return rows[0] || null;
}

async function findActivaPorId(db, id) {
  const { rows } = await db.query(
    'SELECT id, schema_nombre FROM public.instituciones WHERE id = $1 AND activo',
    [id],
  );
  return rows[0] || null;
}

async function listarActivas(db) {
  const { rows } = await db.query('SELECT id, schema_nombre FROM public.instituciones WHERE activo ORDER BY id');
  return rows;
}

module.exports = { insertInstitucion, insertDominios, findActivaPorDominio, findActivaPorId, listarActivas };
