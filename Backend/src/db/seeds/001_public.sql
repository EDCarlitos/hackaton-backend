-- Datos de prueba. Idempotente: se puede correr varias veces sin duplicar.

INSERT INTO public.instituciones (nombre, schema_nombre)
VALUES ('Universidad del Caribe', 'ucaribe')
ON CONFLICT (schema_nombre) DO NOTHING;

INSERT INTO public.dominios_permitidos (institucion_id, dominio)
SELECT id, 'ucaribe.edu.mx'
FROM public.instituciones
WHERE schema_nombre = 'ucaribe'
ON CONFLICT (dominio) DO NOTHING;
