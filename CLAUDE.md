# Backend — Hackatón

API en Node.js + Express 5 (CommonJS) con PostgreSQL 16 (`pg`). Postgres corre con `docker compose up -d`; las variables viven en `.env` (ver `.env.example`).

- `npm test`: tests de integración (ver sección Tests).
- `npm run dev`: modo watch. `npm start`: producción. Ambos cargan `.env` con `node --env-file`.
- Al arrancar, `src/server.js` corre `setupDatabase`: migraciones de `public` → seeds (solo si `NODE_ENV !== 'production'`) → crea el schema de cada institución y le aplica `src/db/tenant/`.
- A mano: `npm run db:migrate` (public + tenants), `npm run db:seed`, `npm run db:setup` (todo).
- Variables de entorno: se leen solo en `src/config/env.js`. Si agregas una, agrégala también a `.env.example`. `.env` está en `.gitignore`.
- Acceso SQL de datos: `pg` puro, sin ORM. Las consultas siempre van parametrizadas (`$1`, `$2`).

## Migraciones y seeds

- El runner es propio: `src/db/migrate.js`. Aplica los `.sql` en orden alfabético, cada uno en su propia transacción. Los de `public` se registran en `public.schema_migrations` y los de tenant en `<schema>.schema_migrations`.
- Las migraciones de `db/tenant/` no llevan prefijo de schema (`CREATE TABLE usuarios`): el runner fija el `search_path`.
- Formato del nombre: `NNN_descripcion.sql`. **Nunca editar una migración ya aplicada.** Para cambiar algo se crea una nueva.
- Los seeds deben ser idempotentes (`ON CONFLICT DO NOTHING`), porque corren en cada arranque en dev.
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
│   ├── middlewares/        # tenant, errorHandler, auth, validación
│   └── utils/
├── db/
│   ├── migrate.js          # runner de migraciones y seeds
│   ├── public/             # migraciones del schema public (instituciones, dominios, enums)
│   ├── seeds/              # datos de prueba idempotentes
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
- Archivos con el formato `<modulo>.<capa>.js`. Nombres de módulo en plural y en minúsculas (`users`, `projects`).

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

## Autenticación (módulo `auth`)

- JWT HS256 firmado con `JWT_SECRET`, con expiración `JWT_EXPIRES_IN`. Payload: `sub` = id del usuario, `institucion_id`, `rol`. Helpers en `shared/utils/jwt.js`.
- Contraseñas con `bcryptjs` (10 rounds): mínimo 8 caracteres, máximo 72 bytes.
- Endpoints:
  - `POST /auth/register` → 201 `{ usuario, token }`. Errores: 400 datos inválidos, 403 dominio no permitido, 409 correo ya registrado.
  - `GET /auth/me` → requiere `Authorization: Bearer <token>`.
- `requireAuth` deja `req.auth = { usuarioId, rol }` y `req.tenant = { id, schema }`.
- **Pendiente:** verificación de correo. Por ahora el registro devuelve token aunque `correo_verificado_en` sea NULL. Cuando exista el login, debe rechazar a los usuarios no verificados o inactivos.

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
- Archivos: `tests/<modulo>.<tema>.test.js`, con helpers comunes en `tests/helpers.js`. Cada archivo hace `before(prepararBD)` y `after(cerrarBD)`.
- Cada test usa datos únicos (`unico()`) para no depender del orden. Los archivos corren en serie (`--test-concurrency=1`).
- Además del status HTTP, verificar `error.codigo` y el efecto real en la BD (fila creada en el schema correcto, nada creado en los casos de error).
