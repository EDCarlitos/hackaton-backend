Project Yendo {
database_type: 'PostgreSQL'
Note: '''
Multi-tenant por schema.

- public: catálogo global (instituciones, lista blanca de dominios, enums compartidos,
  administradores de plataforma).
- tenant: plantilla; se crea un schema igual por institución (ej. ucaribe).

Login: 1. lower(dominio del correo) -> public.dominios_permitidos (activo) -> institución (activa) 2. SET LOCAL search_path TO <schema_nombre>, public (dentro de la transacción) 3. buscar en <schema>.usuarios; exigir correo_verificado_en IS NOT NULL y activo = true
El dominio decide el tenant, así que cada usuario pertenece a una sola institución
y los usuarios pueden vivir dentro del schema del tenant.

Requiere: CREATE EXTENSION IF NOT EXISTS citext;
Búsqueda por cercanía a la ruta: se calcula en Express (turf), sin PostGIS.
'''
}

// ===================== ENUMS (en public: una sola definición para todos los tenants) =====================
// Si viven en cada schema, cada ALTER TYPE ... ADD VALUE se tiene que repetir N veces.

Enum public.rol_usuario {
usuario
admin [note: 'admin de la institución']
}

Enum public.estado_viaje {
abierto [note: 'acepta reservas']
lleno [note: 'sin asientos']
en_curso [note: 'iniciado; reservas solo hasta reservas_cierran_en']
finalizado
cancelado
}

Enum public.estado_reserva {
solicitada
confirmada
rechazada
cancelada
completada
expirada
}

// ===================== SCHEMA PUBLIC (global) =====================

Table public.instituciones {
id int [pk, increment]
nombre varchar(150) [not null]
schema*nombre varchar(63) [not null, unique, note: 'ej. ucaribe; validar ^[a-z*][a-z0-9_]\*$ antes de usarlo en SQL']
activo boolean [not null, default: true]
creado_en timestamptz [not null, default: now()]

checks {
schema*nombre ~ '^[a-z*][a-z0-9_]{0,62}$' [name: 'chk_schema_nombre']
}
}

Table public.dominios_permitidos {
id int [pk, increment]
institucion_id int [not null]
dominio citext [not null, unique, note: 'ej. ucaribe.edu.mx; registrar también subdominios (alumnos.ucaribe.edu.mx)']
activo boolean [not null, default: true]
creado_en timestamptz [not null, default: now()]

Indexes {
institucion_id
}
}

Ref: public.dominios_permitidos.institucion_id > public.instituciones.id [delete: restrict]

Table public.admins_plataforma {
id int [pk, increment]
correo citext [not null, unique]
password_hash varchar(255) [not null, note: 'bcrypt']
activo boolean [not null, default: true]
creado_en timestamptz [not null, default: now()]
Note: 'Superadmins de Yendo (dan de alta instituciones y dominios). No pertenecen a ningún tenant.'
}

// ===================== SCHEMA TENANT (uno por institución) =====================

Table tenant.usuarios {
id int [pk, increment]
correo citext [not null, unique, note: 'su dominio debe estar en dominios_permitidos de ESTA institución (validar en Express al registrar)']
password_hash varchar(255) [not null, note: 'bcrypt']
nombre_visible varchar(100) [not null]
rol public.rol_usuario [not null, default: 'usuario']
correo_verificado_en timestamptz [note: 'NULL = no puede iniciar sesión; prueba que el correo institucional es suyo']
acepto_terminos_en timestamptz
activo boolean [not null, default: true, note: 'suspender sin borrar historial']
creado_en timestamptz [not null, default: now()]
}

Table tenant.tokens_correo {
id int [pk, increment]
usuario_id int [not null]
tipo public.tipo_token [not null]
token_hash varchar(255) [not null, unique, note: 'guardar hash (sha256), nunca el token en claro']
expira_en timestamptz [not null]
usado_en timestamptz
creado_en timestamptz [not null, default: now()]

Indexes {
(usuario_id, tipo)
}
}

Table tenant.vehiculos {
id int [pk, increment]
usuario_id int [not null]
placa_o_descripcion varchar(100) [not null]
asientos smallint [not null, check: asientos BETWEEN 1 AND 4]
activo boolean [not null, default: true, note: 'desactivar en vez de borrar: viajes pasados lo referencian']

Indexes {
usuario_id
(id, usuario_id) [unique, note: 'destino de la FK compuesta desde viajes']
}
}

Table tenant.trayectos {
id int [pk, increment]
conductor_id int [not null]
nombre varchar(80) [not null, note: 'ej. "Casa → UCaribe"']
origen_lat numeric(9,6) [not null, check: origen_lat BETWEEN -90 AND 90]
origen_lng numeric(9,6) [not null, check: origen_lng BETWEEN -180 AND 180]
origen_texto varchar(200)
destino_lat numeric(9,6) [not null, check: destino_lat BETWEEN -90 AND 90]
destino_lng numeric(9,6) [not null, check: destino_lng BETWEEN -180 AND 180]
destino_texto varchar(200)
polilinea text [not null]
hora_habitual time

Indexes {
conductor_id
}
Note: 'Opcional (RF-09 "Salgo hoy")'
}

Table tenant.viajes {
id int [pk, increment]
conductor_id int [not null]
vehiculo_id int [not null]
trayecto_id int [note: 'si se publicó desde una plantilla']
origen_lat numeric(9,6) [not null, check: origen_lat BETWEEN -90 AND 90]
origen_lng numeric(9,6) [not null, check: origen_lng BETWEEN -180 AND 180]
origen_texto varchar(200) [note: 'aproximado, sin domicilio exacto']
destino_lat numeric(9,6) [not null, check: destino_lat BETWEEN -90 AND 90]
destino_lng numeric(9,6) [not null, check: destino_lng BETWEEN -180 AND 180]
destino_texto varchar(200)
polilinea text [not null, note: 'overview_polyline de Google Maps; se consulta 1 vez']
distancia_km numeric(6,2)
duracion_min int
salida_en timestamptz [not null]
asientos_ofrecidos smallint [not null]
asientos_disponibles smallint [not null, note: 'actualizar junto con reservas en la misma transacción (SELECT ... FOR UPDATE sobre el viaje)']
costo_referencia numeric(8,2) [note: 'no vinculante']
estado public.estado_viaje [not null, default: 'abierto']
iniciado_en timestamptz [note: 'cuando el conductor presiona "Iniciar viaje"']
reservas_cierran_en timestamptz [note: 'iniciado_en + 4 min']
finalizado_en timestamptz
creado_en timestamptz [not null, default: now()]

checks {
asientos_ofrecidos BETWEEN 1 AND 4 [name: 'chk_asientos_ofrecidos']
asientos_disponibles BETWEEN 0 AND asientos_ofrecidos [name: 'chk_asientos_disponibles']
costo_referencia IS NULL OR costo_referencia >= 0 [name: 'chk_costo']
estado NOT IN ('en_curso','finalizado') OR iniciado_en IS NOT NULL [name: 'chk_iniciado']
estado <> 'finalizado' OR finalizado_en IS NOT NULL [name: 'chk_finalizado']
}

Indexes {
(estado, salida_en)
conductor_id
trayecto_id
}
}

Table tenant.reservas {
id int [pk, increment]
viaje_id int [not null]
pasajero_id int [not null, note: 'distinto de viajes.conductor_id (validar en Express o con trigger)']
recogida_lat numeric(9,6) [not null, check: recogida_lat BETWEEN -90 AND 90]
recogida_lng numeric(9,6) [not null, check: recogida_lng BETWEEN -180 AND 180]
recogida_texto varchar(200)
bajada_lat numeric(9,6) [check: bajada_lat BETWEEN -90 AND 90]
bajada_lng numeric(9,6) [check: bajada_lng BETWEEN -180 AND 180]
distancia_pie_m int [check: distancia_pie_m >= 0]
estado public.estado_reserva [not null, default: 'solicitada']
solicitada_en timestamptz [not null, default: now()]
respondida_en timestamptz

checks {
(bajada_lat IS NULL) = (bajada_lng IS NULL) [name: 'chk_bajada_completa']
}

Indexes {
(viaje_id, estado)
(pasajero_id, estado)
}
Note: '''
Una sola reserva ACTIVA por pasajero y viaje, pero se permite volver a pedir tras cancelar/rechazar.
DBML no soporta índices parciales; crear a mano:
CREATE UNIQUE INDEX ux_reserva_activa ON reservas (viaje_id, pasajero_id)
WHERE estado IN ('solicitada', 'confirmada');
'''
}

Table tenant.mensajes {
id int [pk, increment]
viaje_id int [not null]
autor_id int [not null, note: 'conductor o pasajero con reserva confirmada (validar en Express)']
texto varchar(500) [not null, check: length(trim(texto)) > 0]
enviado_en timestamptz [not null, default: now()]

Indexes {
(viaje_id, enviado_en)
}
Note: 'Opcional (RF-23 chat del viaje)'
}

// ===================== RELACIONES =====================

Ref: tenant.tokens_correo.usuario_id > tenant.usuarios.id [delete: cascade]
Ref: tenant.vehiculos.usuario_id > tenant.usuarios.id [delete: restrict]
Ref: tenant.trayectos.conductor_id > tenant.usuarios.id [delete: cascade]
Ref: tenant.viajes.conductor_id > tenant.usuarios.id [delete: restrict]
// FK compuesta: el vehículo del viaje tiene que ser del conductor
Ref: tenant.viajes.(vehiculo_id, conductor_id) > tenant.vehiculos.(id, usuario_id) [delete: restrict]
Ref: tenant.viajes.trayecto_id > tenant.trayectos.id [delete: set null]
Ref: tenant.reservas.viaje_id > tenant.viajes.id [delete: cascade]
Ref: tenant.reservas.pasajero_id > tenant.usuarios.id [delete: restrict]
Ref: tenant.mensajes.viaje_id > tenant.viajes.id [delete: cascade]
Ref: tenant.mensajes.autor_id > tenant.usuarios.id [delete: restrict]
