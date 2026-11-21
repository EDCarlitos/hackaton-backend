# Backend — Hackatón

API en Node.js + Express 5 (CommonJS) con PostgreSQL 16 (`pg`). Postgres corre con `docker compose up -d`; las variables viven en `.env` (ver `.env.example`).

- `npm test`: tests de integración (ver sección Tests).
- `npm run dev`: modo watch. `npm start`: producción. Ambos cargan `.env` con `node --env-file`.
- `http://localhost:3000/prueba`: página HTML (`public/prueba.html`) para probar registro y login a mano. Solo existe fuera de producción. Swagger en `/docs`.
- Al arrancar, `src/server.js` corre `setupDatabase`: migraciones de `public` → seeds de `public` → crea el schema de cada institución y le aplica `src/db/tenant/` → seeds de tenant. Los seeds solo corren si `NODE_ENV !== 'production'`.
- A mano: `npm run db:migrate` (public + tenants), `npm run db:seed`, `npm run db:setup` (todo).
- Variables de entorno: se leen solo en `src/config/env.js`. Si agregas una, agrégala también a `.env.example`. `.env` está en `.gitignore`.
- Acceso SQL de datos: `pg` puro, sin ORM. Las consultas siempre van parametrizadas (`$1`, `$2`).

## Migraciones y seeds

- El runner es propio: `src/db/migrate.js`. Aplica los `.sql` en orden alfabético, cada uno en su propia transacción. Los de `public` se registran en `public.schema_migrations` y los de tenant en `<schema>.schema_migrations`.
- Las migraciones de `db/tenant/` no llevan prefijo de schema (`CREATE TABLE usuarios`): el runner fija el `search_path`.
- Formato del nombre: `NNN_descripcion.sql`. **Nunca editar una migración ya aplicada.** Para cambiar algo se crea una nueva.
- Los seeds deben ser idempotentes (`ON CONFLICT DO NOTHING`), porque corren en cada arranque en dev.
- Seeds de `public`: `src/db/seeds/*.sql`, van antes de los tenants porque pueden dar de alta instituciones.
- Seeds de tenant: `src/db/seeds/tenant/<schema>/*.sql`, van después de migrar los tenants, cada archivo en su transacción y con `search_path = <schema>, public`. Si el schema no es una institución, la carpeta se ignora.
- Datos demo: `seeds/tenant/ucaribe/001_demo_viajes.sql` (un bloque `DO` que no hace nada si ya existe `ana.conductora@ucaribe.edu.mx`). Contraseña de todos: `secreta123`. Trae conductores, pasajeros, vehículos, plantillas, viajes en todos los estados, reservas, mensajes y un aviso sin leer. Las fechas son relativas al **primer** arranque; para regenerarlas, recrea la BD.
- Los enums (`rol_usuario`, `estado_viaje`, `estado_reserva`) y la extensión `citext` viven en `public`. Los schemas de tenant los usan porque `public` va en el `search_path`.

## Arquitectura: modular (por funcionalidad)

Cada funcionalidad vive en su propia carpeta dentro de `src/modules/`. **No** usamos hexagonal: se descartó por demasiado costosa para el hackatón.

```
src/
├── app.js                  # crea la app Express, middlewares globales, monta rutas
├── server.js               # arranque: prueba la BD y hace listen
├── config/
│   ├── env.js              # lee/valida variables de entorno
│   └── db.js               # Pool de pg + helper withTenant
├── shared/
│   ├── constants/          # roles, estados de viaje/reserva, tipos de notificación
│   ├── middlewares/        # tenant, errorHandler, auth, validación
│   ├── maps/               # cálculo de rutas: Google Routes API o simulado (ver Google Maps)
│   └── utils/              # jwt, geo (polilíneas, haversine), validacion, formato
├── docs/
│   └── openapi.js          # spec OpenAPI; se sirve en /docs (Swagger UI) y /docs.json
├── db/
│   ├── migrate.js          # runner de migraciones y seeds
│   ├── public/             # migraciones del schema public (instituciones, dominios, enums)
│   ├── seeds/              # datos de prueba idempotentes (public y tenant/<schema>/)
│   └── tenant/             # migraciones que se aplican a CADA schema de tenant
└── modules/
    └── <modulo>/
        ├── <modulo>.routes.js      # endpoints → controller
        ├── <modulo>.controller.js  # req/res, status codes, sin lógica de negocio
        ├── <modulo>.service.js     # reglas de negocio, abre withTenant
        └── <modulo>.repository.js  # solo SQL; recibe `db` como primer parámetro
```

Reglas:
- La dependencia va en un solo sentido: routes → controller → service → repository.
- El SQL solo vive en los repositories. Los services nunca tocan `req` ni `res`.
- Un módulo no importa el repository de otro módulo; si necesita algo, usa su service.
- Al agregar o cambiar un endpoint, actualiza su contrato en `src/docs/openapi.js`.
- Archivos con el formato `<modulo>.<capa>.js`. Nombres de módulo en plural y en minúsculas (`users`, `projects`).
- Si otro módulo necesita trabajar **en la misma transacción**, el service expone una función que recibe `db` (ej. `vehiculos.resolverParaPublicar(db, ...)`, `viajes.guardarEnTransaccion(db, ...)`, `notificaciones.crearEnTransaccion(db, ...)`). Esas funciones no abren `withTenant`.
- Módulos: `auth`, `instituciones`, `vehiculos`, `viajes`, `trayectos` y `notificaciones`. Dependencias entre services: `trayectos → viajes → vehiculos, notificaciones`. No debe haber ciclos.

## Multi-tenant: un schema por tenant

- El tenant es la **institución**. El schema `public` guarda lo global:
  - `public.instituciones`: id, nombre, `schema_nombre`, activo.
  - `public.dominios_permitidos`: la whitelist de dominios de correo por institución (`citext`, único).
- Cada institución tiene su propio schema, con nombre `instituciones.schema_nombre` (ej. `ucaribe`, sin prefijo) y las mismas tablas de negocio.
- **Resolución del tenant:**
  - Al registrarse, el dominio del correo (match exacto en `dominios_permitidos`, activo y con la institución activa) determina la institución. Los subdominios se registran como filas aparte.
  - En los requests autenticados, el JWT trae `institucion_id` y `requireAuth` (`shared/middlewares/auth.js`) busca el schema en `public.instituciones`.
- **Alta de institución:** `POST /instituciones`, protegido con el header `X-Admin-Key` (= `PLATFORM_ADMIN_KEY`). Body: `{ nombre, schema_nombre, dominios?: string[] }`. En UNA transacción inserta la institución y sus dominios, crea el schema (`createTenantSchema` de `db/migrate.js`) y le aplica todas las migraciones de `db/tenant/`. Si algo falla, no queda nada a medias. Se rechazan los schemas reservados (`public`, `information_schema`, `pg_*`) y los que ya existen.
- **Aislamiento de conexiones:** nunca hacer `SET search_path` directo sobre el pool, porque la conexión vuelve al pool y el siguiente request heredaría el schema de otro tenant. Usar siempre `withTenant(schema, fn)` de `config/db.js`: abre una transacción con `SET LOCAL search_path` y libera la conexión al terminar.

  El service llama a `withTenant(tenant.schema, (db) => repo.algo(db, ...))`. Los repositories nunca importan `pool` y siempre usan el `db` que reciben.
- **Seguridad:** el nombre del schema sale siempre de `public.instituciones`, nunca directo del input del usuario. Se valida con `/^[a-z_][a-z0-9_]{0,62}$/` (el mismo `chk_schema_nombre` de la BD) y se escapa con `escapeIdentifier`. Ambas cosas las hace `quoteSchema()` de `config/db.js`.
- En el SQL de los repositories no se pone el prefijo del schema en las tablas de tenant (`SELECT * FROM viajes`). El `search_path` se encarga de eso. Las tablas globales sí van calificadas (`public.instituciones`).
- **Migraciones:** las de `db/public/` se corren una sola vez. Las de `db/tenant/` se corren sobre todos los schemas de tenant existentes, y también al crear uno nuevo.

## Modelo de datos

- **public:** `instituciones`, `dominios_permitidos` y los enums.
- **tenant** (cada institución): `usuarios`, `vehiculos`, `trayectos` (plantillas de ruta con vehículo, asientos y ruta ya calculada), `viajes`, `reservas`, `mensajes` (chat del viaje), `notificaciones` (avisos dentro de la app).
- Reglas que ya garantiza la BD:
  - `viajes (vehiculo_id, conductor_id)` y `trayectos (vehiculo_id, conductor_id)` → `vehiculos (id, usuario_id)`: el vehículo tiene que ser del conductor.
  - `ux_reserva_activa`: una sola reserva `solicitada`/`confirmada` por pasajero y viaje.
  - Los checks de asientos (1–4), de coordenadas y de estado (`chk_iniciado`, `chk_finalizado`, `chk_cancelado`).
- Reglas que **debe validar Express** (la BD no las cubre): el pasajero no puede ser el conductor del viaje; solo el conductor o un pasajero con reserva confirmada escribe en `mensajes`; `asientos_disponibles` se actualiza junto con la reserva en la misma transacción (`SELECT ... FOR UPDATE` sobre el viaje).
- Más reglas que valida Express al publicar: el vehículo tiene que estar activo y `asientos_ofrecidos` no puede pasar de los asientos del vehículo. Un conductor no puede tener dos viajes activos (`abierto`/`lleno`/`en_curso`) que se crucen en `[salida_en, salida_en + duracion_min]`: da 409 `VIAJE_TRASLAPADO`. La verificación se serializa con `FOR NO KEY UPDATE` sobre la fila del conductor, y eso también evita el doble clic.
- Las columnas `numeric` (coordenadas, costo, distancia) llegan de `pg` como **string**. `shared/utils/formato.js` las convierte a number antes de responder. Los puntos se exponen como `{ lat, lng, texto }` y la ruta como `{ polilinea, distancia_km, duracion_min }`.
- Fechas de salida: ISO 8601 **con zona** (`Z` o `-05:00`), desde 5 min en el pasado hasta 30 días adelante (`shared/utils/validacion.js`). "Salgo hoy" calcula "hoy a las HH:MM" en Postgres, con `APP_TIMEZONE`.
- Auth simple: registro y login con JWT. No hay verificación de correo, tokens de correo, recuperación de contraseña ni admins de plataforma (el alta de instituciones usa `X-Admin-Key`).

## Google Maps (rutas)

- El **frontend** usa su propia llave (Maps JavaScript + Places) para el mapa y el autocompletado, y manda `{ lat, lng, texto }` (RF-05). El backend no geocodifica.
- El **backend** usa `GOOGLE_MAPS_API_KEY`, una llave de servidor distinta, restringida por IP y con solo **Routes API** habilitada. Llama a `computeRoutes` con un field mask mínimo (`routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline`), que también define el SKU que se cobra. Ver `shared/maps/google.js`.
- **Una sola consulta por ruta (RF-07):** solo `POST /viajes` y `POST /trayectos` (con origen/destino) llaman a Google. "Publicar de nuevo", "Salgo hoy" y "guardar plantilla desde un viaje" reutilizan la polilínea guardada. La llamada va **fuera** de la transacción, para no retener una conexión del pool mientras se espera a Google, y después de validar el body y el vehículo.
- Los services llaman siempre a `mapas.calcularRuta(origen, destino)` (`require('shared/maps')`, sin desestructurar), para que los tests la espíen con `mock.method` y cuenten las llamadas.
- `MAPS_PROVIDER=simulado` traza una "L" entre los puntos, sin red. Es el valor por defecto si no hay llave y lo que usan los tests (`.env.test`). En producción, sin llave, la app no arranca salvo que pongas `MAPS_PROVIDER=simulado` a propósito.
- Errores: sin ruta en auto → 400 `RUTA_NO_ENCONTRADA`; Google caído, timeout (8 s), cuota o llave inválida → 502 `MAPAS_NO_DISPONIBLE` (el detalle va solo al log, vía `cause`).
- La polilínea es el *Encoded Polyline* de Google. En el frontend se dibuja con `google.maps.geometry.encoding.decodePath(polilinea)`.

## Conductor: publicar viajes (RF-05 a RF-11)

| RF | Endpoint |
|---|---|
| — | `POST /vehiculos`, `GET /vehiculos`, `DELETE /vehiculos/:id` (desactiva, no borra) |
| 05–07 | `POST /viajes`: `{ vehiculo_id?, origen, destino, salida_en, asientos_ofrecidos, costo_referencia? }`. `vehiculo_id` es opcional si hay un solo vehículo activo |
| 08 | `POST /viajes/:id/republicar`: `{ salida_en, vehiculo_id? }`. Clona el resto |
| 09 | `POST /trayectos` (con origen/destino, o `desde_viaje_id`), `GET /trayectos`, `DELETE /trayectos/:id`. `GET /trayectos/:id/salgo-hoy?hora=` da el resumen para confirmar y `POST /trayectos/:id/salgo-hoy` `{ hora?, asientos_ofrecidos? }` publica |
| 10 | `GET /viajes/mios?estado=&cuando=proximos\|pasados\|todos&limite=`: cada viaje trae `reservas` vigentes, `solicitudes_pendientes` y `pasajeros_confirmados`. `GET /viajes/:id`: las reservas solo las ve el conductor |
| 11 | `POST /viajes/:id/cancelar` `{ motivo? }`: en una transacción, viaje → `cancelado`, reservas vigentes → `cancelada`, y una `notificaciones` para cada pasajero afectado (confirmado o con solicitud pendiente). `GET /notificaciones`, `POST /notificaciones/:id/leida` |

- Solo el conductor del viaje republica o cancela (403 `NO_ES_CONDUCTOR`). Solo se cancela un viaje en `abierto`/`lleno` (409 `VIAJE_NO_CANCELABLE`).
- Las plantillas son privadas: la de otro da 404 `TRAYECTO_NO_ENCONTRADO`.

## Autenticación y autorización (módulo `auth`)

- JWT HS256 firmado con `JWT_SECRET`, con expiración `JWT_EXPIRES_IN`. Payload: `sub` = id del usuario, `institucion_id`, `rol`. Helpers en `shared/utils/jwt.js`.
- Contraseñas con `bcryptjs` (10 rounds): mínimo 8 caracteres, máximo 72 bytes.
- Endpoints:
  - `POST /auth/register` → 201 `{ usuario, token }`. Errores: 400 datos inválidos, 403 dominio no permitido, 409 correo ya registrado.
  - `POST /auth/login` → 200 `{ usuario, token }`. El dominio del correo decide en qué schema se busca. Dominio, correo o contraseña incorrectos dan siempre el mismo 401 `CREDENCIALES_INVALIDAS` (y bcrypt corre igual con un hash de relleno, para no revelar qué correos existen). Solo con la contraseña correcta se responde 403 `USUARIO_INACTIVO` si la cuenta está desactivada.
  - `GET /auth/me` → requiere `Authorization: Bearer <token>`.
- **Roles** (`shared/constants/roles.js`, igual al enum `public.rol_usuario`): `usuario` y `admin` (admin de SU institución). El admin de la plataforma no es un rol: usa `X-Admin-Key`.
- **`requireAuth`** (`shared/middlewares/auth.js`) llama a `auth.service.autenticar(token)`: valida firma, expiración y tipos de los claims; busca la institución activa en `public.instituciones` y carga al usuario de su schema. Deja `req.auth = { usuarioId, rol }`, `req.tenant = { id, schema }` y `req.usuario`. El rol y el estado se leen de la BD en cada request, **no del token**: desactivar o cambiar de rol a alguien aplica al instante.
- **`requireRole(...roles)`** va después de `requireAuth`: `router.delete('/x', requireAuth, requireRole(ROLES.ADMIN), ...)`. Si el rol no alcanza: 403 `ROL_INSUFICIENTE`. Si se le pasa un rol que no existe, lanza al arrancar.

## Errores personalizados

- Están en `src/shared/errors/index.js`. Todos extienden de `AppError`, que **extiende de `Error`**:

  | Clase | Status | `code` por defecto |
  |---|---|---|
  | `AppError` | 500 | `ERROR_INTERNO` |
  | `ValidationError` | 400 | `VALIDACION` |
  | `UnauthorizedError` | 401 | `NO_AUTENTICADO` |
  | `ForbiddenError` | 403 | `PROHIBIDO` |
  | `NotFoundError` | 404 | `NO_ENCONTRADO` |
  | `ConflictError` | 409 | `CONFLICTO` |
  | `BadGatewayError` | 502 | `SERVICIO_EXTERNO` |

- Uso: `throw new ForbiddenError('mensaje', { code: 'DOMINIO_NO_PERMITIDO', details, cause })`. El `code` debe ser específico, estable y en MAYÚSCULAS; es lo que lee el frontend.
- Se lanzan desde services y middlewares. **Nunca** se responde un error a mano en el controller.
- `shared/middlewares/errorHandler.js` arma TODAS las respuestas de error con el mismo formato:
  `{ "error": { "codigo": "...", "mensaje": "...", "detalles": { ... } } }` (`detalles` es opcional; en validación trae un mensaje por campo).
- Si un error no es `AppError`, se loguea y se responde 500 genérico, sin filtrar el detalle interno.
- Los errores de Postgres se traducen en el service: `23505` (unique, se distingue por `err.constraint`) → `ConflictError`; `42P06` (schema duplicado) → `ConflictError`.
- Express 5 ya propaga solos los errores de los handlers async: no hace falta try/catch ni `next(err)`.
- Para un caso nuevo, primero se reutiliza una clase existente con otro `code`. Solo se crea una subclase si el status es distinto.

## Tests

- `npm test` usa `node:test` + `supertest` y corre los tests de integración contra Postgres real.
- `.env.test` (commiteado, sin secretos reales) se carga después de `.env` y cambia `POSTGRES_DB=hackaton_test`. El `pretest` (`tests/setup-db.js`) **borra y recrea** esa base en cada corrida, y aborta si el nombre no termina en `_test`.
- Archivos: `tests/<modulo>.<tema>.test.js`, con helpers comunes en `tests/helpers.js` (`crearUsuario`, `crearConductor`, `publicarViaje`, `crearReserva`, `enHoras`, `auth`). Cada archivo que usa la BD hace `before(prepararBD)` y `after(cerrarBD)`. `mapas.test.js` es unitario: simula `fetch` y no toca la BD.
- Para verificar cuántas veces se consulta Google: `const espia = mock.method(mapas, 'calcularRuta')`, luego `espia.mock.callCount()`, y `afterEach(() => mock.restoreAll())`. Para simular una falla, pásale una implementación que lance.
- Cada test usa datos únicos (`unico()`) para no depender del orden. Los archivos corren en serie (`--test-concurrency=1`).
- Además del status HTTP, verificar `error.codigo` y el efecto real en la BD (fila creada en el schema correcto, nada creado en los casos de error).
