-- Datos de DEMOSTRACIÓN para la búsqueda (RF-12 a RF-15) y el contador de impacto (RF-23/24).
-- Contraseña: secreta123. Se suma a 001_demo_viajes.sql.
--
-- Viajes de MAÑANA temprano hacia UCaribe:
--   carla.conductora@ucaribe.edu.mx  Carla Uc    07:12  Región 96 → Av. Kabah → UCaribe       3 asientos, $15
--   pedro.conductor@ucaribe.edu.mx   Pedro May   06:50  SM 200 → López Portillo → UCaribe     2 asientos, $25
--   rosa.conductora@ucaribe.edu.mx   Rosa Tun    07:05  UCaribe → Av. Kabah → Región 96       2 asientos (sentido contrario)
--
--   valeria.pasajera@ucaribe.edu.mx  Valeria Ku  pasajera SIN reservas: úsala para el flujo completo de la demo
--     (los demás pasajeros ya tienen reservas mañana temprano y RF-22 no les deja pedir otra que se cruce).
--
-- Búsqueda de ejemplo (como valeria.pasajera, cerca de Plaza Cancún 2000, mañana 07:00 hora local).
-- Reglas de la sección 5: recogida a < 400 m de la ruta y salida a ±15 min.
--   GET /viajes/buscar?recogida_lat=21.1762&recogida_lng=-86.8492&salida_en=<mañana>T07:00:00-05:00
--     → Rosa (86 m, +5 min), Carla (86 m, +12 min), Ana (115 m, 0 min). Pedro NO sale: su ruta pasa a 524 m.
--   ...&bajada_lat=21.2000&bajada_lng=-86.8230   (UCaribe)
--     → Rosa desaparece (va en sentido contrario): Carla, Ana
--
-- Historial para el impacto: Carla hizo el trayecto los últimos 10 días con 1 a 3 pasajeros
-- (Jorge, Sofía, Diego), todos completados.
--
-- Idempotente: si ya existe carla.conductora@ucaribe.edu.mx, no hace nada.
-- Fechas relativas al PRIMER arranque (America/Cancun). Rutas aproximadas, no vienen de Google.

DO $seed$
DECLARE
  tz   constant text := 'America/Cancun';
  hoy  constant date := (now() AT TIME ZONE 'America/Cancun')::date;
  pass constant text := '$2b$10$ehlxCGN.XdzBGhJcgOCnjeU9Jd9bXHHkRCoJoiwFJgQsTJgY2TXqu'; -- secreta123

  pol_carla constant text := 'gxd`Cf`dqOg^wj@sg@we@ct@whAsq@sq@sl@c`@';
  pol_pedro constant text := 'g{``CnxeqOw|Ag^syA_Xo}@_cBwt@{iBsl@c`@';
  pol_rosa  constant text := 'ouk`Cfp|pOrl@b`@rq@rq@bt@vhArg@ve@f^vj@';

  carla int; pedro int; rosa int;
  auto_carla int; auto_pedro int; auto_rosa int;
  jorge int; sofia int; diego int;
  pasajeros int[];
  salida timestamptz;
  vid int;
BEGIN
  IF EXISTS (SELECT 1 FROM usuarios WHERE correo = 'carla.conductora@ucaribe.edu.mx') THEN
    RETURN;
  END IF;

  INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
  VALUES ('carla.conductora@ucaribe.edu.mx', pass, 'Carla Uc', now())
  ON CONFLICT (correo) DO UPDATE SET correo = EXCLUDED.correo RETURNING id INTO carla;
  INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
  VALUES ('pedro.conductor@ucaribe.edu.mx', pass, 'Pedro May', now())
  ON CONFLICT (correo) DO UPDATE SET correo = EXCLUDED.correo RETURNING id INTO pedro;
  INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
  VALUES ('rosa.conductora@ucaribe.edu.mx', pass, 'Rosa Tun', now())
  ON CONFLICT (correo) DO UPDATE SET correo = EXCLUDED.correo RETURNING id INTO rosa;

  INSERT INTO usuarios (correo, password_hash, nombre_visible, acepto_terminos_en)
  VALUES ('valeria.pasajera@ucaribe.edu.mx', pass, 'Valeria Ku', now())
  ON CONFLICT (correo) DO NOTHING;

  INSERT INTO vehiculos (usuario_id, placa_o_descripcion, asientos)
  VALUES (carla, 'Kia Rio azul · UVB-789-C', 4) RETURNING id INTO auto_carla;
  INSERT INTO vehiculos (usuario_id, placa_o_descripcion, asientos)
  VALUES (pedro, 'VW Vento negro · UNM-321-D', 2) RETURNING id INTO auto_pedro;
  INSERT INTO vehiculos (usuario_id, placa_o_descripcion, asientos)
  VALUES (rosa, 'Toyota Yaris rojo · UKL-654-E', 3) RETURNING id INTO auto_rosa;

  INSERT INTO viajes (conductor_id, vehiculo_id,
                      origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
                      polilinea, distancia_km, duracion_min, salida_en,
                      asientos_ofrecidos, asientos_disponibles, costo_referencia)
  VALUES (carla, auto_carla,
          21.165000, -86.861000, 'Región 96', 21.200400, -86.822600, 'Universidad del Caribe',
          pol_carla, 6.20, 13, (hoy + 1 + time '07:12') AT TIME ZONE tz,
          3, 3, 15),
         (pedro, auto_pedro,
          21.145000, -86.870000, 'Supermanzana 200', 21.200400, -86.822600, 'Universidad del Caribe',
          pol_pedro, 9.24, 20, (hoy + 1 + time '06:50') AT TIME ZONE tz,
          2, 2, 25),
         (rosa, auto_rosa,
          21.200400, -86.822600, 'Universidad del Caribe', 21.165000, -86.861000, 'Región 96',
          pol_rosa, 6.20, 13, (hoy + 1 + time '07:05') AT TIME ZONE tz,
          2, 2, NULL);

  -- ---------- Historial (impacto): Carla, últimos 10 días a las 07:10 ----------
  SELECT id INTO jorge FROM usuarios WHERE correo = 'jorge.pasajero@ucaribe.edu.mx';
  SELECT id INTO sofia FROM usuarios WHERE correo = 'sofia.pasajera@ucaribe.edu.mx';
  SELECT id INTO diego FROM usuarios WHERE correo = 'diego.pasajero@ucaribe.edu.mx';

  FOR d IN 1..10 LOOP
    pasajeros := CASE d % 3 WHEN 0 THEN ARRAY[jorge, diego]
                            WHEN 1 THEN ARRAY[sofia]
                            ELSE        ARRAY[jorge, sofia, diego] END;
    pasajeros := array_remove(pasajeros, NULL); -- por si 001 no creó a alguno
    salida := (hoy - d + time '07:10') AT TIME ZONE tz;

    INSERT INTO viajes (conductor_id, vehiculo_id,
                        origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
                        polilinea, distancia_km, duracion_min, salida_en,
                        asientos_ofrecidos, asientos_disponibles, costo_referencia,
                        estado, iniciado_en, finalizado_en, creado_en)
    VALUES (carla, auto_carla,
            21.165000, -86.861000, 'Región 96', 21.200400, -86.822600, 'Universidad del Caribe',
            pol_carla, 6.20, 13, salida,
            3, 3 - cardinality(pasajeros), 15,
            'finalizado', salida, salida + interval '15 min', salida - interval '1 day')
    RETURNING id INTO vid;

    INSERT INTO reservas (viaje_id, pasajero_id, recogida_lat, recogida_lng, recogida_texto,
                          distancia_pie_m, estado, solicitada_en, respondida_en)
    SELECT vid, p, 21.176500, -86.847800, 'Av. Kabah y Av. Chac Mool', 90, 'completada',
           salida - interval '12 hours', salida - interval '11 hours'
      FROM unnest(pasajeros) AS p;
  END LOOP;
END
$seed$;
