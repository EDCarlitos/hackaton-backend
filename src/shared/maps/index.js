// Punto único para calcular rutas de manejo. Los services llaman SIEMPRE a
// `mapas.calcularRuta(...)` (sin desestructurar) para que los tests puedan espiarla
// con mock.method y comprobar que se consulta una sola vez por publicación (RF-07).
const env = require('../../config/env');
const google = require('./google');
const simulado = require('./simulado');

const mapas = {
  proveedor: env.mapas.proveedor,

  // origen/destino: { lat, lng }. Devuelve { polilinea, distanciaKm, duracionMin }.
  // Errores: 400 RUTA_NO_ENCONTRADA, 502 MAPAS_NO_DISPONIBLE.
  calcularRuta(origen, destino) {
    if (env.mapas.proveedor === 'google') {
      return google.calcularRuta(origen, destino, { apiKey: env.mapas.googleApiKey });
    }
    return simulado.calcularRuta(origen, destino);
  },
};

module.exports = mapas;
