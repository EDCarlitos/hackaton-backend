# Backend — Hackatón

API en Node.js + Express 5 (CommonJS) con PostgreSQL 16 (`pg`). Postgres corre con `docker compose up -d`; las variables viven en `.env` (ver `.env.example`).

- `npm run dev`: modo watch. `npm start`: producción. Ambos cargan `.env` con `node --env-file`.
- Al arrancar, `src/server.js` aplica las migraciones pendientes de `src/db/public/`. Si `NODE_ENV !== 'production'`, también corre los seeds de `src/db/seeds/`.
- A mano: `npm run db:migrate`, `npm run db:seed`, `npm run db:setup` (las dos cosas).
- Acceso SQL de datos: `pg` puro, sin ORM. Las consultas siempre van parametrizadas (`$1`, `$2`).

## Migraciones y seeds

- El runner es propio: `src/db/migrate.js`. Aplica los `.sql` en orden alfabético, cada uno en su propia transacción, y los registra en `public.schema_migrations`.
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
- **Resolución del tenant:** pendiente de definir. Lo más probable es que el dominio del correo, buscado en `dominios_permitidos`, determine la institución al registrarse o hacer login. Un middleware (`shared/middlewares/tenant.js`) dejará `req.tenant = { id, schema }`.
- Por ahora no hay endpoints para crear instituciones ni dominios. Se agregan vía seed o migración.
- **Aislamiento de conexiones:** nunca hacer `SET search_path` directo sobre el pool, porque la conexión vuelve al pool y el siguiente request heredaría el schema de otro tenant. Usar siempre el helper:

  ```js
  // config/db.js
  async function withTenant(schema, fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${pg.escapeIdentifier(schema)}, public`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  ```

  El service llama a `withTenant(tenant.schema, (db) => repo.algo(db, ...))`. Los repositories nunca importan `pool` y siempre usan el `db` que reciben.
- **Seguridad:** el nombre del schema sale siempre de `public.instituciones`, nunca directo del input del usuario. Se valida con `/^[a-z_][a-z0-9_]{0,62}$/` (el mismo `chk_schema_nombre` de la BD) y se escapa con `escapeIdentifier`.
- En el SQL de los repositories no se pone el prefijo del schema en las tablas de tenant (`SELECT * FROM viajes`). El `search_path` se encarga de eso. Las tablas globales sí van calificadas (`public.instituciones`).
- **Alta de institución:** insertar en `public.instituciones` → `CREATE SCHEMA` → correr las migraciones de `db/tenant/` sobre ese schema, todo en una transacción.
- **Migraciones:** las de `db/public/` se corren una sola vez. Las de `db/tenant/` se corren sobre todos los schemas de tenant existentes, y también al crear uno nuevo.
