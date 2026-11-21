-- RF-17 / RNF-05: nunca más reservas confirmadas que asientos ofrecidos.
-- Express ya lo cuida (bloquea el viaje y descuenta asientos_disponibles en la misma transacción),
-- pero este trigger lo garantiza también ante SQL directo o un bug: bloquea la fila del viaje,
-- así que dos confirmaciones simultáneas se serializan y la segunda ve a la primera.

CREATE FUNCTION verificar_cupo_reservas() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ofrecidos smallint;
  confirmadas int;
BEGIN
  -- TG_TABLE_SCHEMA = schema del tenant que disparó el trigger; así no depende del search_path
  -- de la sesión (funciona igual desde withTenant que con SQL calificado como ucaribe.reservas).
  EXECUTE format('SELECT asientos_ofrecidos FROM %I.viajes WHERE id = $1 FOR UPDATE', TG_TABLE_SCHEMA)
    INTO ofrecidos USING NEW.viaje_id;

  EXECUTE format(
    'SELECT count(*) FROM %I.reservas WHERE viaje_id = $1 AND estado = ''confirmada'' AND id <> $2',
    TG_TABLE_SCHEMA)
    INTO confirmadas USING NEW.viaje_id, NEW.id;

  IF confirmadas + 1 > ofrecidos THEN
    RAISE EXCEPTION 'El viaje % ya tiene sus % asientos confirmados', NEW.viaje_id, ofrecidos
      USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_cupo_confirmadas';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reservas_cupo
  BEFORE INSERT OR UPDATE OF estado ON reservas
  FOR EACH ROW
  WHEN (NEW.estado = 'confirmada')
  EXECUTE FUNCTION verificar_cupo_reservas();

-- RF-20: el cierre automático busca viajes vencidos por estado y hora (ya existe idx_viajes_estado_salida_en).
-- RF-22: el traslape de reservas del pasajero usa idx_reservas_pasajero_estado.
