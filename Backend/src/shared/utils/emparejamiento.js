// Reglas de coincidencia pasajero ↔ viaje (sección 5 de los requisitos, Frontend/AGENTS.MD):
//   1. El punto de recogida está a MENOS de R metros de la ruta (R inicial: 400 m; ajustar probando en Cancún).
//   2. La salida está dentro de ±15 minutos de la hora deseada.
//   3. Queda al menos 1 asiento y el conductor no es el pasajero.
// Además (criterio de aceptación del MVP): si el pasajero da punto de bajada, también debe quedar
// cerca de la ruta y DESPUÉS de la recogida en el sentido del viaje.
// La búsqueda (RF-13) y la solicitud de asiento (RF-15) usan EXACTAMENTE estas reglas,
// así que un viaje que aparece en la búsqueda también se puede solicitar.
// Si cambian las reglas, cambia los números de aquí: los tests leen REGLAS.
const { decodificarPolilinea, proyectarEnRuta } = require('./geo');
const { ESTADOS_VIAJE } = require('../constants/estados');

const REGLAS = Object.freeze({
  // R: distancia en línea recta del punto de recogida (y de bajada) a la ruta; debe ser MENOR que esto.
  MAX_DISTANCIA_PIE_M: 400,
  // Se buscan viajes que salgan dentro de ± esta ventana respecto a la hora deseada.
  VENTANA_HORA_MIN: 15,
  // Tope de viajes que se evalúan por búsqueda (los más cercanos en hora).
  MAX_CANDIDATOS: 300,
});

// ¿El viaje acepta solicitudes ahora? Abierto y sin salir todavía, o recién iniciado
// dentro del margen de reservas_cierran_en. (La consulta de candidatos aplica lo mismo en SQL.)
function esReservable(viaje, ahora = Date.now()) {
  if (viaje.estado === ESTADOS_VIAJE.ABIERTO) return new Date(viaje.salida_en).getTime() > ahora;
  if (viaje.estado === ESTADOS_VIAJE.EN_CURSO) {
    return Boolean(viaje.reservas_cierran_en) && new Date(viaje.reservas_cierran_en).getTime() > ahora;
  }
  return false;
}

const redondear = ({ lat, lng }) => ({ lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 });

// Evalúa la recogida (y la bajada, si se da) contra la polilínea del viaje.
// Devuelve { compatible, motivo?, distanciaPieM, puntoAbordaje, distanciaBajadaM?, puntoBajada? }.
// motivo: 'RECOGIDA_LEJOS' | 'BAJADA_LEJOS' | 'SENTIDO_CONTRARIO'.
function evaluarRuta(polilinea, recogida, bajada = null) {
  const puntos = decodificarPolilinea(polilinea || '');
  const sube = proyectarEnRuta(puntos, recogida);
  if (!sube) return { compatible: false, motivo: 'RECOGIDA_LEJOS', distanciaPieM: null };

  const r = { distanciaPieM: Math.round(sube.distanciaM), puntoAbordaje: redondear(sube.punto) };
  if (sube.distanciaM >= REGLAS.MAX_DISTANCIA_PIE_M) return { ...r, compatible: false, motivo: 'RECOGIDA_LEJOS' };

  if (bajada) {
    const baja = proyectarEnRuta(puntos, bajada);
    r.distanciaBajadaM = Math.round(baja.distanciaM);
    r.puntoBajada = redondear(baja.punto);
    if (baja.distanciaM >= REGLAS.MAX_DISTANCIA_PIE_M) return { ...r, compatible: false, motivo: 'BAJADA_LEJOS' };
    // La ruta tiene que pasar primero por la recogida y después por la bajada.
    if (baja.avanceM <= sube.avanceM) return { ...r, compatible: false, motivo: 'SENTIDO_CONTRARIO' };
  }
  return { ...r, compatible: true };
}

// RF-18: punto acordado = punto de la ruta más cercano a la recogida del pasajero.
function puntoDeAbordaje(polilinea, recogida) {
  const p = proyectarEnRuta(decodificarPolilinea(polilinea || ''), recogida);
  return p ? redondear(p.punto) : null;
}

module.exports = { REGLAS, esReservable, evaluarRuta, puntoDeAbordaje };
