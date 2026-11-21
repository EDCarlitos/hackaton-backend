// Lectores de campos comunes. Cada uno devuelve el valor limpio, o null y anota el error en `errores`.
const { ValidationError } = require('../errors');
const { distanciaKm } = require('./geo');

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_CON_ZONA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const ID_RE = /^[1-9]\d{0,9}$/;
const MAX_INT = 2147483647;

// Salida: se tolera un poco de pasado ("salgo ya") y como máximo 30 días hacia adelante.
const TOLERANCIA_PASADO_MIN = 5;
const MAX_DIAS_ANTICIPACION = 30;
// Origen y destino a menos de esto se consideran el mismo lugar.
const DISTANCIA_MINIMA_KM = 0.2;

const ausente = (v) => v === undefined || v === null;
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

function lanzarSiHayErrores(errores) {
  if (Object.keys(errores).length) throw new ValidationError('Datos inválidos', { details: errores });
}

// Id de ruta o de body: entero positivo (acepta "12" o 12). Devuelve null si no es válido.
function leerId(valor) {
  const s = typeof valor === 'number' ? String(valor) : valor;
  if (typeof s !== 'string' || !ID_RE.test(s)) return null;
  const n = Number(s);
  return n <= MAX_INT ? n : null;
}

function leerIdOpcional(valor, campo, errores) {
  if (ausente(valor)) return undefined;
  const id = leerId(valor);
  if (id === null) errores[campo] = 'Debe ser un id entero positivo';
  return id;
}

function leerTexto(valor, campo, errores, { max, requerido = false }) {
  if (ausente(valor) || (typeof valor === 'string' && !valor.trim())) {
    if (requerido) errores[campo] = `Requerido, máximo ${max} caracteres`;
    return null;
  }
  if (typeof valor !== 'string' || valor.trim().length > max) {
    errores[campo] = `${requerido ? 'Requerido, máximo' : 'Máximo'} ${max} caracteres`;
    return null;
  }
  return valor.trim();
}

// { lat, lng, texto? } tal como lo entrega el mapa o el autocompletado de Places.
function leerPunto(valor, campo, errores) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    errores[campo] = 'Requerido: { lat, lng, texto? }';
    return null;
  }
  const { lat, lng, texto } = valor;
  if (!esNumero(lat) || lat < -90 || lat > 90 || !esNumero(lng) || lng < -180 || lng > 180) {
    errores[campo] = 'lat (-90 a 90) y lng (-180 a 180) deben ser números';
    return null;
  }
  const errTexto = {};
  const textoLimpio = leerTexto(texto, 'texto', errTexto, { max: 200 });
  if (errTexto.texto) {
    errores[campo] = 'texto: máximo 200 caracteres';
    return null;
  }
  return { lat, lng, texto: textoLimpio };
}

// Punto que llega por query string (?x_lat=21.18&x_lng=-86.86): todo es texto, se convierte a número.
// Devuelve null si no se mandó ninguno de los dos (y no es requerido).
const NUMERO_RE = /^-?\d{1,3}(\.\d+)?$/; // cualquier cantidad de decimales (floats de JS)
function leerPuntoDeQuery(lat, lng, campo, errores, { requerido = false } = {}) {
  if (lat === undefined && lng === undefined && !requerido) return null;
  const aNum = (x) => (typeof x === 'string' && NUMERO_RE.test(x.trim()) ? Number(x) : NaN);
  return leerPunto({ lat: aNum(lat), lng: aNum(lng) }, campo, errores);
}

// Lee origen y destino y verifica que no sean el mismo lugar.
function leerOrigenDestino(body, errores) {
  const origen = leerPunto(body.origen, 'origen', errores);
  const destino = leerPunto(body.destino, 'destino', errores);
  if (origen && destino && distanciaKm(origen, destino) < DISTANCIA_MINIMA_KM) {
    errores.destino = 'El destino debe ser distinto del origen';
  }
  return { origen, destino };
}

function leerAsientos(valor, campo, errores, { requerido = true } = {}) {
  if (ausente(valor) && !requerido) return undefined;
  if (!Number.isInteger(valor) || valor < 1 || valor > 4) {
    errores[campo] = 'Entero de 1 a 4';
    return null;
  }
  return valor;
}

// Devuelve un mensaje si la fecha de salida está fuera de la ventana permitida.
function errorVentanaSalida(fecha, ahora = Date.now()) {
  if (fecha.getTime() < ahora - TOLERANCIA_PASADO_MIN * 60_000) return 'La salida no puede estar en el pasado';
  if (fecha.getTime() > ahora + MAX_DIAS_ANTICIPACION * 86_400_000) {
    return `La salida debe ser dentro de los próximos ${MAX_DIAS_ANTICIPACION} días`;
  }
  return null;
}

// RF-06: fecha y hora en ISO 8601 CON zona (ej. 2026-11-21T07:30:00-05:00). Sin zona sería ambiguo.
function leerSalida(valor, campo, errores) {
  const fecha = typeof valor === 'string' && ISO_CON_ZONA_RE.test(valor) ? new Date(valor) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) {
    errores[campo] = 'Fecha y hora ISO 8601 con zona horaria, ej. 2026-11-21T07:30:00-05:00';
    return null;
  }
  const error = errorVentanaSalida(fecha);
  if (error) {
    errores[campo] = error;
    return null;
  }
  return fecha;
}

function leerHora(valor, campo, errores, { requerido = false } = {}) {
  if (ausente(valor) && !requerido) return undefined;
  if (typeof valor !== 'string' || !HORA_RE.test(valor)) {
    errores[campo] = 'Formato HH:MM (24 h)';
    return null;
  }
  return valor;
}

function leerCosto(valor, campo, errores) {
  if (ausente(valor)) return null;
  if (!esNumero(valor) || valor < 0 || valor > 99999) {
    errores[campo] = 'Número de 0 a 99999';
    return null;
  }
  return Math.round(valor * 100) / 100;
}

module.exports = {
  lanzarSiHayErrores,
  leerId,
  leerIdOpcional,
  leerTexto,
  leerPunto,
  leerOrigenDestino,
  leerPuntoDeQuery,
  leerAsientos,
  leerSalida,
  errorVentanaSalida,
  leerHora,
  leerCosto,
};
