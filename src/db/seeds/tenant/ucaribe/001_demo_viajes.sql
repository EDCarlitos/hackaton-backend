-- Datos de DEMOSTRACIÓN para la Universidad del Caribe (conductores, viajes, plantillas, avisos).
-- Todos los usuarios tienen la contraseña: secreta123
--
--   admin.demo@ucaribe.edu.mx      Admin UCaribe  (rol admin)
--   ana.conductora@ucaribe.edu.mx  Ana López      conductora: Nissan March, 2 plantillas, 3 viajes
--   luis.conductor@ucaribe.edu.mx  Luis Pech      conductor: Chevrolet Aveo (+ un Tsuru desactivado), 2 viajes
--   maria.pasajera@ucaribe.edu.mx  María Canul    pasajera confirmada en el viaje de mañana de Ana
--   jorge.pasajero@ucaribe.edu.mx  Jorge Ek       solicitud PENDIENTE en el viaje de mañana de Ana
--   sofia.pasajera@ucaribe.edu.mx  Sofía Chan     tiene un AVISO de viaje cancelado sin leer
--   diego.pasajero@ucaribe.edu.mx  Diego Poot     confirmado en el viaje lleno de Luis
--
-- Idempotente: si ya existe ana.conductora@ucaribe.edu.mx, no hace nada.
-- Las fechas son relativas al PRIMER arranque (hora de America/Cancun). Para regenerarlas,
-- recrea la BD de desarrollo (docker compose down -v && docker compose up -d) y vuelve a arrancar.
-- Las rutas son aproximadas (puntos sobre avenidas de Cancún), no vienen de Google.

DO $seed$
DECLARE
  tz   constant text := 'America/Cancun';
  hoy  constant date := (now() AT TIME ZONE 'America/Cancun')::date;
  pass constant text := '$2b$10$ehlxCGN.XdzBGhJcgOCnjeU9Jd9bXHHkRCoJoiwFJgQsTJgY2TXqu'; -- secreta123

  -- Villas Otoch → Av. Talleres → Av. Kabah → Av. Chac Mool → UCaribe (y su regreso)
  pol_otoch_ucaribe   constant text := 'gfh`CvjeqOrNwt@bQk_AvLox@ox@gh@sv@o_@sl@c`@';
  pol_ucaribe_otoch   constant text := 'ouk`Cfp|pOrl@b`@rv@n_@nx@fh@wLnx@cQj_AsNvt@';
  -- Plaza Las Américas → Av. Tulum → Mercado 28 → Av. López Portillo → UCaribe
  pol_americas_ucaribe constant text := '_ia`Cnv|pOoi@fOkp@ni@ku@oFgaAoPk_AoPsv@oU';

  ana int; luis int; maria int; jorge int; sofia int; diego int;
  auto_ana int; auto_luis int;
  t_ida int; t_vuelta int; t_luis int;
  v_ayer int; v_manana int; v_cancelado int; v_luis_lleno int;
  salida timestamptz;
BEGIN
  IF EXISTS (SELECT 1 FROM usuarios WHERE correo = 'ana.conductora@ucaribe.edu.mx') THEN
    RETURN;
  END IF;

  -- ---------- Usuarios ----------
  -- DO UPDATE no cambia nada: solo sirve para que RETURNING dé el id aunque el correo ya exista.
  INSERT INTO usuarios (correo, password_hash, nombre_visible, rol, acepto_terminos_en)
  VALUES ('admin.demo@ucaribe.edu.mx', pass, 'Admin UCaribe', 'admin', now())
  ON CONFLICT (correo) DO NOTHING;

  INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
  VALUES ('ana.conductora@ucaribe.edu.mx', pass, 'Ana López', now())
  ON CONFLICT (correo) DO UPDATE SET correo = EXCLUDED.correo RETURNING id INTO ana;
  INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
  VALUES ('luis.conductor@ucaribe.edu.mx', pass, 'Luis Pech', now())
  ON CONFLICT (correo) DO UPDATE SET correo = EXCLUDED.correo RETURNING id INTO luis;
  INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
  VALUES ('maria.pasajera@ucaribe.edu.mx', pass, 'María Canul', now())
  ON CONFLICT (correo) DO UPDATE SET correo = EXCLUDED.correo RETURNING id INTO maria;
  INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
  VALUES ('jorge.pasajero@ucaribe.edu.mx', pass, 'Jorge Ek', now())
  ON CONFLICT (correo) DO UPDATE SET correo = EXCLUDED.correo RETURNING id INTO jorge;
  INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
  VALUES ('sofia.pasajera@ucaribe.edu.mx', pass, 'Sofía Chan', now())
  ON CONFLICT (correo) DO UPDATE SET correo = EXCLUDED.correo RETURNING id INTO sofia;
  INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
  VALUES ('diego.pasajero@ucaribe.edu.mx', pass, 'Diego Poot', now())
  ON CONFLICT (correo) DO UPDATE SET correo = EXCLUDED.correo RETURNING id INTO diego;

  -- ---------- Vehículos ----------
  INSERT INTO vehiculos (usuario_id, placa_o_descripcion, asientos)
  VALUES (ana, 'Nissan March gris · UXP-123-A', 4) RETURNING id INTO auto_ana;
  INSERT INTO vehiculos (usuario_id, placa_o_descripcion, asientos)
  VALUES (luis, 'Chevrolet Aveo blanco · URT-456-B', 3) RETURNING id INTO auto_luis;
  INSERT INTO vehiculos (usuario_id, placa_o_descripcion, asientos, activo)
  VALUES (luis, 'Nissan Tsuru rojo (vendido)', 4, false);

  -- ---------- Plantillas "Mi trayecto" (RF-09) ----------
  INSERT INTO trayectos (conductor_id, vehiculo_id, nombre, hora_habitual, asientos,
                         origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
                         polilinea, distancia_km, duracion_min)
  VALUES (ana, auto_ana, 'Casa → UCaribe', '07:00', 4,
          21.182600, -86.867800, 'Villas Otoch Paraíso', 21.200400, -86.822600, 'Universidad del Caribe',
          pol_otoch_ucaribe, 7.01, 15)
  RETURNING id INTO t_ida;

  INSERT INTO trayectos (conductor_id, vehiculo_id, nombre, hora_habitual, asientos,
                         origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
                         polilinea, distancia_km, duracion_min)
  VALUES (ana, auto_ana, 'UCaribe → Casa', '14:30', 4,
          21.200400, -86.822600, 'Universidad del Caribe', 21.182600, -86.867800, 'Villas Otoch Paraíso',
          pol_ucaribe_otoch, 7.01, 15)
  RETURNING id INTO t_vuelta;

  INSERT INTO trayectos (conductor_id, vehiculo_id, nombre, hora_habitual, asientos,
                         origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
                         polilinea, distancia_km, duracion_min)
  VALUES (luis, auto_luis, 'Las Américas → UCaribe', '07:15', 2,
          21.147200, -86.823600, 'Plaza Las Américas', 21.200400, -86.822600, 'Universidad del Caribe',
          pol_americas_ucaribe, 6.99, 15)
  RETURNING id INTO t_luis;

  -- ---------- Viajes ----------

  -- 1) Ana, AYER 07:00, finalizado: sirve para probar "Publicar de nuevo" (RF-08).
  salida := (hoy - 1 + time '07:00') AT TIME ZONE tz;
  INSERT INTO viajes (conductor_id, vehiculo_id, trayecto_id,
                      origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
                      polilinea, distancia_km, duracion_min, salida_en,
                      asientos_ofrecidos, asientos_disponibles, costo_referencia,
                      estado, iniciado_en, finalizado_en, creado_en)
  VALUES (ana, auto_ana, t_ida,
          21.182600, -86.867800, 'Villas Otoch Paraíso', 21.200400, -86.822600, 'Universidad del Caribe',
          pol_otoch_ucaribe, 7.01, 15, salida,
          4, 2, 20, 'finalizado', salida + interval '3 min', salida + interval '19 min', salida - interval '1 day')
  RETURNING id INTO v_ayer;

  INSERT INTO reservas (viaje_id, pasajero_id, recogida_lat, recogida_lng, recogida_texto, estado, solicitada_en, respondida_en)
  VALUES (v_ayer, maria, 21.180100, -86.859200, 'Av. Talleres y Av. Kabah', 'completada', salida - interval '20 hours', salida - interval '19 hours'),
         (v_ayer, sofia, 21.177200, -86.848900, 'Plaza Cancún 2000', 'completada', salida - interval '15 hours', salida - interval '14 hours');

  -- 2) Ana, MAÑANA 07:00, abierto: 1 pasajera confirmada + 1 solicitud entrante (RF-10).
  salida := (hoy + 1 + time '07:00') AT TIME ZONE tz;
  INSERT INTO viajes (conductor_id, vehiculo_id, trayecto_id,
                      origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
                      polilinea, distancia_km, duracion_min, salida_en,
                      asientos_ofrecidos, asientos_disponibles, costo_referencia)
  VALUES (ana, auto_ana, t_ida,
          21.182600, -86.867800, 'Villas Otoch Paraíso', 21.200400, -86.822600, 'Universidad del Caribe',
          pol_otoch_ucaribe, 7.01, 15, salida,
          4, 3, 20)
  RETURNING id INTO v_manana;

  INSERT INTO reservas (viaje_id, pasajero_id, recogida_lat, recogida_lng, recogida_texto, estado, solicitada_en, respondida_en)
  VALUES (v_manana, maria, 21.180100, -86.859200, 'Av. Talleres y Av. Kabah', 'confirmada', now() - interval '2 hours', now() - interval '1 hour'),
         (v_manana, jorge, 21.177200, -86.848900, 'Plaza Cancún 2000', 'solicitada', now() - interval '30 min', NULL);

  INSERT INTO mensajes (viaje_id, autor_id, texto, enviado_en)
  VALUES (v_manana, ana,   'Hola María, paso por ti a las 7:05 en la esquina de Talleres.', now() - interval '50 min'),
         (v_manana, maria, '¡Perfecto, ahí estaré! Gracias.', now() - interval '45 min');

  -- 3) Ana, PASADO MAÑANA 14:30, CANCELADO: Sofía estaba confirmada y tiene el aviso sin leer (RF-11).
  salida := (hoy + 2 + time '14:30') AT TIME ZONE tz;
  INSERT INTO viajes (conductor_id, vehiculo_id, trayecto_id,
                      origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
                      polilinea, distancia_km, duracion_min, salida_en,
                      asientos_ofrecidos, asientos_disponibles, costo_referencia,
                      estado, cancelado_en, motivo_cancelacion)
  VALUES (ana, auto_ana, t_vuelta,
          21.200400, -86.822600, 'Universidad del Caribe', 21.182600, -86.867800, 'Villas Otoch Paraíso',
          pol_ucaribe_otoch, 7.01, 15, salida,
          4, 3, 20, 'cancelado', now() - interval '10 min', 'Tengo que llevar el auto al taller')
  RETURNING id INTO v_cancelado;

  INSERT INTO reservas (viaje_id, pasajero_id, recogida_lat, recogida_lng, recogida_texto, estado, solicitada_en, respondida_en)
  VALUES (v_cancelado, sofia, 21.200400, -86.822600, 'Entrada principal UCaribe', 'cancelada', now() - interval '3 hours', now() - interval '2 hours');

  INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, viaje_id, creada_en)
  VALUES (sofia, 'viaje_cancelado', 'Viaje cancelado',
          'Ana López canceló el viaje del ' || to_char(salida AT TIME ZONE tz, 'DD/MM HH24:MI')
            || ' hacia Villas Otoch Paraíso. Motivo: Tengo que llevar el auto al taller',
          v_cancelado, now() - interval '10 min');

  -- 4) Luis, MAÑANA 07:15, LLENO (2 de 2 asientos confirmados).
  salida := (hoy + 1 + time '07:15') AT TIME ZONE tz;
  INSERT INTO viajes (conductor_id, vehiculo_id, trayecto_id,
                      origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
                      polilinea, distancia_km, duracion_min, salida_en,
                      asientos_ofrecidos, asientos_disponibles, costo_referencia, estado)
  VALUES (luis, auto_luis, t_luis,
          21.147200, -86.823600, 'Plaza Las Américas', 21.200400, -86.822600, 'Universidad del Caribe',
          pol_americas_ucaribe, 6.99, 15, salida,
          2, 0, 25, 'lleno')
  RETURNING id INTO v_luis_lleno;

  INSERT INTO reservas (viaje_id, pasajero_id, recogida_lat, recogida_lng, recogida_texto, estado, solicitada_en, respondida_en)
  VALUES (v_luis_lleno, diego, 21.161900, -86.833000, 'Mercado 28', 'confirmada', now() - interval '5 hours', now() - interval '4 hours'),
         (v_luis_lleno, sofia, 21.154000, -86.826200, 'Av. Tulum y Av. Cobá', 'confirmada', now() - interval '4 hours', now() - interval '3 hours');

  -- 5) Luis, EN UNA SEMANA 07:15, abierto y sin reservas.
  salida := (hoy + 7 + time '07:15') AT TIME ZONE tz;
  INSERT INTO viajes (conductor_id, vehiculo_id, trayecto_id,
                      origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
                      polilinea, distancia_km, duracion_min, salida_en,
                      asientos_ofrecidos, asientos_disponibles, costo_referencia)
  VALUES (luis, auto_luis, t_luis,
          21.147200, -86.823600, 'Plaza Las Américas', 21.200400, -86.822600, 'Universidad del Caribe',
          pol_americas_ucaribe, 6.99, 15, salida,
          3, 3, NULL);

  RAISE NOTICE 'Datos demo de ucaribe creados (contraseña: secreta123)';
END
$seed$;
