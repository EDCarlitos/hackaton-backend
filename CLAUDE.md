# Hackatón — monorepo

| Carpeta | Qué es |
|---|---|
| `Backend/` | API Node.js + Express 5 + PostgreSQL multi-tenant. Detalles y reglas en `Backend/CLAUDE.md` |
| `Frontend/` | (pendiente) |

- Cada proyecto tiene su propio `package.json`, `node_modules` y `.env`. Los comandos se corren **dentro** de su carpeta (`cd Backend && npm test`).
- Postgres: `cd Backend && docker compose up -d`. El proyecto de Compose se llama `backend` (fijado en `docker-compose.yml`), así que el volumen `backend_postgres_data` no cambia aunque se mueva la carpeta.
- Google Maps usa dos llaves distintas: la del frontend (Maps JavaScript + Places, pública y restringida por dominio) y la del backend (`GOOGLE_MAPS_API_KEY`, solo Routes API, restringida por IP). Ver `Backend/CLAUDE.md` → "Google Maps".
