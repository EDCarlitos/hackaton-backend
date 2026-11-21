// Cliente mínimo de Google Routes API (computeRoutes).
// https://developers.google.com/maps/documentation/routes/compute_route_directions
const { ValidationError, BadGatewayError } = require('../errors');

const URL_ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
// Pedimos solo los campos que guardamos: el field mask es obligatorio y además define el SKU que se cobra.
const FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';
const TIMEOUT_MS = 8000;

const aWaypoint = ({ lat, lng }) => ({ location: { latLng: { latitude: lat, longitude: lng } } });

const noDisponible = (cause) =>
  new BadGatewayError('No se pudo calcular la ruta en este momento; intenta de nuevo', {
    code: 'MAPAS_NO_DISPONIBLE',
    cause,
  });

// Devuelve { polilinea, distanciaKm, duracionMin } de la ruta en auto entre dos puntos.
async function calcularRuta(origen, destino, { apiKey }) {
  let res;
  try {
    res = await fetch(URL_ROUTES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        origin: aWaypoint(origen),
        destination: aWaypoint(destino),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
        languageCode: 'es-MX',
        units: 'METRIC',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw noDisponible(err); // red caída o timeout
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // 400 (petición inválida), 403 (llave inválida/API no habilitada), 429 (cuota), 5xx.
    const detalle = body?.error ? `${body.error.status}: ${body.error.message}` : 'sin cuerpo';
    throw noDisponible(new Error(`Routes API respondió ${res.status} (${detalle})`));
  }

  // Sin ruta posible (ej. un punto en el mar) Google responde 200 con {}.
  const ruta = body?.routes?.[0];
  if (!ruta?.polyline?.encodedPolyline) {
    throw new ValidationError('No hay una ruta en auto entre el origen y el destino', {
      code: 'RUTA_NO_ENCONTRADA',
    });
  }

  // proto3 omite los ceros: distanceMeters puede no venir. duration viene como "1234s".
  const metros = ruta.distanceMeters || 0;
  const segundos = Number.parseInt(ruta.duration, 10) || 0;
  return {
    polilinea: ruta.polyline.encodedPolyline,
    distanciaKm: Math.round(metros / 10) / 100,
    duracionMin: Math.max(1, Math.round(segundos / 60)),
  };
}

module.exports = { calcularRuta, URL_ROUTES, FIELD_MASK };
