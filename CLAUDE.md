# Hackatón (Yendo): monorepo

| Carpeta | Qué es |
|---|---|
| `Backend/` | API Node.js + Express 5 + PostgreSQL multi-tenant. Detalles y reglas en `Backend/CLAUDE.md` |
| `Frontend/` | React 19 + Vite + Tailwind 4, móvil primero. Cómo correrlo y pantallas ↔ requisitos en `Frontend/README.md`. Requisitos del producto en `Frontend/AGENTS.MD` (secciones 4 y 5) y diseño en `Frontend/DESIGN.MD` |

- Cada proyecto tiene su propio `package.json`, `node_modules` y `.env`. Los comandos se corren **dentro** de su carpeta (`cd Backend && npm test`, `cd Frontend && npx eslint . && npx vite build`).
- Postgres: `cd Backend && docker compose up -d`. El proyecto de Compose se llama `backend` (fijado en `docker-compose.yml`), así que el volumen `backend_postgres_data` no cambia aunque se mueva la carpeta.
- En desarrollo el frontend llama a `/api/*` y Vite lo manda a `http://localhost:3000`. En producción usa `VITE_API_URL`, y el backend tiene que listar ese origen en `CORS_ORIGINS`.
- El frontend **ya no usa datos mock**: todo sale del API. (La nota final de `Frontend/AGENTS.MD` sobre "no api calls just mock data" es anterior a esto.)
- Google Maps usa dos llaves distintas: la del frontend (`VITE_GOOGLE_MAPS_API_KEY`: Maps JavaScript, pública y restringida por dominio; sin ella se dibuja un esquema SVG) y la del backend (`GOOGLE_MAPS_API_KEY`: solo Routes API, restringida por IP). La ruta se calcula una sola vez, en el backend.
- Reglas de coincidencia (sección 5): R = 400 m y ±15 min, en `Backend/src/shared/utils/emparejamiento.js`.
