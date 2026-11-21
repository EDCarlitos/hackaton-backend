SELECT n.nspname AS schema,
       CASE WHEN n.nspname = 'public' THEN 'global' ELSE 'tenant' END AS tipo,
       coalesce(i.nombre, 'Catálogo de instituciones') AS institucion,
       coalesce((SELECT string_agg(d.dominio::text, ', ' ORDER BY d.dominio)
                   FROM public.dominios_permitidos d WHERE d.institucion_id = i.id), '—') AS dominios,
       (SELECT count(*) FROM pg_tables t
         WHERE t.schemaname = n.nspname AND t.tablename <> 'schema_migrations') AS tablas,
       CASE WHEN i.id IS NULL THEN '—' ELSE (xpath('/row/c/text()', query_to_xml(
         format('SELECT count(*) AS c FROM %I.usuarios', n.nspname), false, true, '')))[1]::text END AS usuarios,
       CASE WHEN i.id IS NULL THEN '—' ELSE (xpath('/row/c/text()', query_to_xml(
         format('SELECT count(*) AS c FROM %I.viajes', n.nspname), false, true, '')))[1]::text END AS viajes
  FROM pg_namespace n
  LEFT JOIN public.instituciones i ON i.schema_nombre = n.nspname
 WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
 ORDER BY (n.nspname <> 'public'), i.id;
