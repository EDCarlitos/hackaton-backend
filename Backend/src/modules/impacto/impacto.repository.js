// Solo SQL: totales de impacto a partir de reservas COMPLETADAS (viajes cerrados con el pasajero confirmado).

// usuarioId = null → toda la institución; si no, solo viajes donde fue conductor o pasajero.
async function totales(db, usuarioId) {
  const { rows } = await db.query(
    `SELECT count(DISTINCT v.id)::int              AS viajes_compartidos,
            count(r.id)::int                       AS asientos_ocupados,
            coalesce(sum(v.distancia_km), 0)::float AS km_compartidos
       FROM reservas r
       JOIN viajes v ON v.id = r.viaje_id
      WHERE r.estado = 'completada'
        AND ($1::int IS NULL OR r.pasajero_id = $1 OR v.conductor_id = $1)`,
    [usuarioId],
  );
  return rows[0];
}

module.exports = { totales };
