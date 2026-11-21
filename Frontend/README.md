# RutaCaribe — Frontend

React 19 + Vite + Tailwind 4. Diseño móvil primero (ver `DESIGN.MD`). Consume el API de `../Backend`.

## Correr en local

```bash
# 1. Backend (en otra terminal)
cd ../Backend && docker compose up -d && npm run dev     # http://localhost:3000

# 2. Frontend
npm install
npm run dev                                              # http://localhost:5173
```

En desarrollo, Vite manda `/api/*` a `http://localhost:3000` (ver `vite.config.js`), así que no hace falta CORS.
En la pantalla de acceso hay botones para entrar con las **cuentas demo** (contraseña `secreta123`):

- `valeria.pasajera@ucaribe.edu.mx`: pasajera sin reservas; úsala para la demo completa.
- `carla.conductora@ucaribe.edu.mx`: conductora con viaje mañana a las 07:12 e historial para el impacto.

Demo en dos dispositivos: Valeria busca desde **Plaza Cancún 2000 (Av. Kabah)** para mañana a las **07:00** →
solicita el viaje de Carla → Carla lo acepta en *Mis viajes → detalle* → los dos chatean en el viaje.

## Variables (`.env.local`, ver `.env.example`)

| Variable | Para qué |
|---|---|
| `VITE_API_URL` | URL del backend en producción (vacía en dev). Agrega este origen a `CORS_ORIGINS` del backend |
| `VITE_GOOGLE_MAPS_API_KEY` | Llave de navegador (Maps JavaScript API), restringida por dominio. Sin ella, los mapas son un **esquema en SVG** y los lugares se eligen de una lista |

La ruta de manejo **nunca** se pide desde el navegador: el backend la calcula una vez al publicar (RF-07) y el
frontend solo dibuja la polilínea guardada.

## Pantallas ↔ requisitos

| Pantalla | Archivo | Requisitos |
|---|---|---|
| Acceso / registro | `pages/LoginPage.jsx` | RF-01, RF-02 (nombre visible y términos) |
| Inicio (buscar) | `pages/HomePage.jsx` + `modals/RideModal.jsx` | RF-12, RF-13, RF-14, RF-15 (solicitar), RF-19, RF-22 (el error se muestra) |
| Publicar / Salgo hoy | `pages/PublishPage.jsx` | RF-03 (alta de vehículo), RF-05, RF-06, RF-07, RF-09 (resumen antes de publicar) |
| Mis viajes | `pages/HistoryPage.jsx` + `modals/RepublishModal.jsx` | RF-08, RF-10 |
| Detalle (conductor) | `pages/DriverDetailPage.jsx` | RF-11, RF-16, RF-17, RF-18, RF-21, RF-23 (chat) |
| Detalle (pasajero) | `pages/TripDetailPage.jsx` | RF-15 (cancelar), RF-18, RF-23 (chat) |
| Impacto | `pages/ImpactPage.jsx` | RF-23, RF-24 (fórmula, factor, fuente y supuestos; "Estimación") |
| Perfil | `modals/ProfileModal.jsx` | RF-03, RNF-04 (aviso de privacidad) |
| Notificaciones | `modals/NotificationsModal.jsx` | Avisos de RF-11, RF-16, RF-21 |

## Estructura

- `lib/api.js`: único cliente HTTP (token, `ApiError` con `codigo`/`mensaje`/`detalles`, cierre de sesión con 401).
- `context/AuthContext.jsx`: sesión (`useAuth`).
- `hooks/useAsync.js`: datos del API con recarga y polling. `hooks/useChat.js`: chat con polling cada 4 s.
- `components/map/RouteMap.jsx`: Google Maps si hay llave; si no, esquema SVG. `components/forms/PointPicker.jsx`: elegir un punto (lista, mi ubicación o tocar el mapa).
- `lib/format.js`: fechas, distancias y etiquetas de estado. `lib/geo.js`: polilíneas y lugares de Cancún.

Antes de subir cambios: `npx eslint .` y `npx vite build`.
