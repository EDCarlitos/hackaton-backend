// Proveedor de rutas falso para desarrollo y tests: no usa red ni gasta cuota.
// Traza una "L" (primero en latitud, luego en longitud) y estima el tiempo a velocidad urbana.
const { distanciaKm, codificarPolilinea } = require('../utils/geo');

const VELOCIDAD_KMH = 30;

async function calcularRuta(origen, destino) {
  const esquina = { lat: destino.lat, lng: origen.lng };
  const km = distanciaKm(origen, esquina) + distanciaKm(esquina, destino);
  return {
    polilinea: codificarPolilinea([origen, esquina, destino]),
    distanciaKm: Math.round(km * 100) / 100,
    duracionMin: Math.max(1, Math.round((km / VELOCIDAD_KMH) * 60)),
  };
}

module.exports = { calcularRuta };
