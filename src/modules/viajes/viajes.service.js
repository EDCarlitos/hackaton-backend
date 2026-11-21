const env = require('../../config/env');
const { withTenant } = require('../../config/db');
const mapas = require('../../shared/maps');
const { NotFoundError, ForbiddenError, ConflictError } = require('../../shared/errors');
const { ESTADOS_VIAJE, ESTADOS_RESERVA, TIPOS_NOTIFICACION } = require('../../shared/constants/estados');
const v = require('../../shared/utils/validacion');
const { aNumero, aPunto, aRuta } = require('../../shared/utils/formato');
const vehiculos = require('../vehiculos/vehiculos.service');
const notificaciones = require('../notificaciones/notificaciones.service');
const repo = require('./viajes.repository');

const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS_VIAJE));
const CANCELABLES = new Set([ESTADOS_VIAJE.ABIERTO, ESTADOS_VIAJE.LLENO]);
const CUANDO_VALIDOS = new Set(['proximos', 'pasados', 'todos']);
const LIMITE_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

const formatoFecha = new Intl.DateTimeFormat('es-MX', {
  timeZone: env.zonaHoraria,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const viajeNoEncontrado = () => new NotFoundError('Viaje no encontrado', { code: 'VIAJE_NO_ENCONTRADO' });
const noEsConductor = () =>
  new ForbiddenError('Solo el conductor del viaje puede hacer esto', { code: 'NO_ES_CONDUCTOR' });

function leerViajeId(valor) {
  const id = v.leerId(valor);
  if (!id) throw viajeNoEncontrado();
  return id;
}

// ---------- Formato de salida ----------

function aViaje(f) {
  return {
    id: f.id,
    estado: f.estado,
    conductor_id: f.conductor_id,
    vehiculo_id: f.vehiculo_id,
    trayecto_id: f.trayecto_id,
    origen: aPunto(f.origen_lat, f.origen_lng, f.origen_texto),
    destino: aPunto(f.destino_lat, f.destino_lng, f.destino_texto),
    ruta: aRuta(f),
    salida_en: f.salida_en,
    asientos_ofrecidos: f.asientos_ofrecidos,
    asientos_disponibles: f.asientos_disponibles,
    costo_referencia: aNumero(f.costo_referencia),
    iniciado_en: f.iniciado_en,
    finalizado_en: f.finalizado_en,
    cancelado_en: f.cancelado_en,
    motivo_cancelacion: f.motivo_cancelacion,
    creado_en: f.creado_en,
  };
}

const contar = (reservas, estado) => reservas.filter((r) => r.estado === estado).length;

// Para "Mis viajes": el viaje con sus solicitudes entrantes y pasajeros confirmados.
function aViajeDelConductor(f) {
  return {
    ...aViaje(f),
    vehiculo: { id: f.vehiculo_id, placa_o_descripcion: f.vehiculo_descripcion },
    solicitudes_pendientes: contar(f.reservas, ESTADOS_RESERVA.SOLICITADA),
    pasajeros_confirmados: contar(f.reservas, ESTADOS_RESERVA.CONFIRMADA),
    reservas: f.reservas,
  };
}

// ---------- Publicar (RF-05, RF-06, RF-07) ----------

function validarPublicacion(body = {}) {
  const errores = {};
  const { origen, destino } = v.leerOrigenDestino(body, errores);
  const salidaEn = v.leerSalida(body.salida_en, 'salida_en', errores);
  const asientosOfrecidos = v.leerAsientos(body.asientos_ofrecidos, 'asientos_ofrecidos', errores);
  const vehiculoId = v.leerIdOpcional(body.vehiculo_id, 'vehiculo_id', errores);
  const costoReferencia = v.leerCosto(body.costo_referencia, 'costo_referencia', errores);
  v.lanzarSiHayErrores(errores);
  return { origen, destino, salidaEn, asientosOfrecidos, vehiculoId, costoReferencia };
}

async function publicar(tenant, conductorId, body) {
  const datos = validarPublicacion(body);

  // 1. Se valida el vehículo ANTES de gastar una consulta a Google.
  const vehiculo = await withTenant(tenant.schema, (db) =>
    vehiculos.resolverParaPublicar(db, conductorId, datos.vehiculoId, datos.asientosOfrecidos),
  );

  // 2. RF-07: la ruta se consulta una sola vez, y fuera de la transacción
  //    (no se retiene una conexión del pool mientras se espera a Google).
  const ruta = await mapas.calcularRuta(datos.origen, datos.destino);

  // 3. Se guarda junto con la polilínea, la distancia y la duración.
  return withTenant(tenant.schema, (db) =>
    guardarEnTransaccion(db, conductorId, { ...datos, vehiculoId: vehiculo.id, ruta, trayectoId: null }),
  );
}

// ---------- Para otros módulos (dentro de SU transacción) ----------

// Inserta un viaje con una ruta YA calculada. La usan publicar, republicar y "Salgo hoy".
// d: { vehiculoId, trayectoId, origen, destino, ruta: { polilinea, distanciaKm, duracionMin },
//      salidaEn, asientosOfrecidos, costoReferencia }
async function guardarEnTransaccion(db, conductorId, d) {
  await repo.bloquearConductor(db, conductorId);
  await vehiculos.resolverParaPublicar(db, conductorId, d.vehiculoId, d.asientosOfrecidos);

  if (await repo.hayTraslape(db, conductorId, d.salidaEn, d.ruta.duracionMin)) {
    throw new ConflictError('Ya tienes un viaje publicado que se cruza con ese horario', {
      code: 'VIAJE_TRASLAPADO',
    });
  }
  return aViaje(await repo.insertar(db, { conductorId, ...d }));
}

// Datos reutilizables de un viaje del conductor (origen, destino, ruta, vehículo, asientos).
// Lanza 404 si no existe y 403 si es de otro conductor.
async function obtenerParaClonar(db, conductorId, viajeId) {
  const f = await repo.findDetalle(db, viajeId);
  if (!f) throw viajeNoEncontrado();
  if (f.conductor_id !== conductorId) throw noEsConductor();
  return {
    vehiculoId: f.vehiculo_id,
    trayectoId: f.trayecto_id,
    origen: { lat: Number(f.origen_lat), lng: Number(f.origen_lng), texto: f.origen_texto },
    destino: { lat: Number(f.destino_lat), lng: Number(f.destino_lng), texto: f.destino_texto },
    ruta: { polilinea: f.polilinea, distanciaKm: aNumero(f.distancia_km), duracionMin: f.duracion_min },
    asientosOfrecidos: f.asientos_ofrecidos,
    costoReferencia: aNumero(f.costo_referencia),
  };
}

// ---------- Publicar de nuevo (RF-08) ----------

// Clona origen, destino, ruta, asientos y vehículo; el conductor solo elige fecha y hora.
// No consulta Google: reutiliza la ruta guardada.
async function republicar(tenant, conductorId, idParam, body = {}) {
  const id = leerViajeId(idParam);
  const errores = {};
  const salidaEn = v.leerSalida(body.salida_en, 'salida_en', errores);
  const vehiculoId = v.leerIdOpcional(body.vehiculo_id, 'vehiculo_id', errores);
  v.lanzarSiHayErrores(errores);

  return withTenant(tenant.schema, async (db) => {
    const base = await obtenerParaClonar(db, conductorId, id);
    return guardarEnTransaccion(db, conductorId, {
      ...base,
      vehiculoId: vehiculoId ?? base.vehiculoId, // por si el original quedó desactivado
      salidaEn,
    });
  });
}

// ---------- Mis viajes (RF-10) ----------

function leerFiltros({ estado, cuando = 'todos', limite } = {}) {
  const errores = {};

  let estados = null;
  if (estado !== undefined) {
    estados = [].concat(estado).flatMap((e) => String(e).split(',')).map((e) => e.trim()).filter(Boolean);
    if (!estados.length || estados.some((e) => !ESTADOS_VALIDOS.has(e))) {
      errores.estado = `Uno o varios (separados por coma) de: ${[...ESTADOS_VALIDOS].join(', ')}`;
    }
  }
  if (!CUANDO_VALIDOS.has(cuando)) errores.cuando = 'proximos, pasados o todos';
  const n = limite === undefined ? LIMITE_DEFECTO : Number(limite);
  if (!Number.isInteger(n) || n < 1 || n > LIMITE_MAXIMO) errores.limite = `Entero de 1 a ${LIMITE_MAXIMO}`;

  v.lanzarSiHayErrores(errores);
  return { estados, cuando, limite: n };
}

async function misViajes(tenant, conductorId, query) {
  const filtros = leerFiltros(query);
  const filas = await withTenant(tenant.schema, (db) => repo.listarDelConductor(db, conductorId, filtros));
  return filas.map(aViajeDelConductor);
}

// Detalle: cualquier usuario de la institución lo ve; solo el conductor ve las reservas.
async function detalle(tenant, usuarioId, idParam) {
  const id = leerViajeId(idParam);
  return withTenant(tenant.schema, async (db) => {
    const f = await repo.findDetalle(db, id);
    if (!f) throw viajeNoEncontrado();
    const viaje = {
      ...aViaje(f),
      conductor: { id: f.conductor_id, nombre_visible: f.conductor_nombre },
      vehiculo: { id: f.vehiculo_id, placa_o_descripcion: f.vehiculo_descripcion },
    };
    if (f.conductor_id === usuarioId) viaje.reservas = await repo.listarReservas(db, id);
    return viaje;
  });
}

// ---------- Cancelar (RF-11) ----------

function mensajeCancelacion(viaje, motivo) {
  const destino = viaje.destino_texto ? ` hacia ${viaje.destino_texto}` : '';
  const porque = motivo ? ` Motivo: ${motivo}` : '';
  return `${viaje.conductor_nombre} canceló el viaje del ${formatoFecha.format(viaje.salida_en)}${destino}.${porque}`;
}

// En UNA transacción: el viaje pasa a cancelado, sus reservas vigentes se cancelan y cada
// pasajero afectado (confirmado o con solicitud pendiente) recibe un aviso en la app.
async function cancelar(tenant, conductorId, idParam, body = {}) {
  const id = leerViajeId(idParam);
  const errores = {};
  const motivo = v.leerTexto(body.motivo, 'motivo', errores, { max: 300 });
  v.lanzarSiHayErrores(errores);

  return withTenant(tenant.schema, async (db) => {
    const viaje = await repo.findParaActualizar(db, id);
    if (!viaje) throw viajeNoEncontrado();
    if (viaje.conductor_id !== conductorId) throw noEsConductor();
    if (!CANCELABLES.has(viaje.estado)) {
      throw new ConflictError(`No se puede cancelar un viaje en estado "${viaje.estado}"`, {
        code: 'VIAJE_NO_CANCELABLE',
      });
    }

    const cancelado = await repo.marcarCancelado(db, id, motivo);
    const afectadas = await repo.cancelarReservasVigentes(db, id);
    const avisos = await notificaciones.crearEnTransaccion(
      db,
      afectadas.map((r) => r.pasajero_id),
      {
        tipo: TIPOS_NOTIFICACION.VIAJE_CANCELADO,
        titulo: 'Viaje cancelado',
        mensaje: mensajeCancelacion(viaje, motivo),
        viajeId: id,
      },
    );

    return {
      viaje: aViaje(cancelado),
      reservas_canceladas: afectadas.length,
      pasajeros_notificados: avisos.length,
    };
  });
}

module.exports = {
  publicar,
  republicar,
  misViajes,
  detalle,
  cancelar,
  guardarEnTransaccion,
  obtenerParaClonar,
};
