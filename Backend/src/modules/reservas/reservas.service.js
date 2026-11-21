const { withTenant } = require('../../config/db');
const { ValidationError, NotFoundError, ConflictError } = require('../../shared/errors');
const { ESTADOS_RESERVA, ESTADOS_VIAJE, TIPOS_NOTIFICACION } = require('../../shared/constants/estados');
const { REGLAS, esReservable, evaluarRuta, puntoDeAbordaje } = require('../../shared/utils/emparejamiento');
const v = require('../../shared/utils/validacion');
const { aNumero, aPunto, aRuta, fechaHoraLegible } = require('../../shared/utils/formato');
const notificaciones = require('../notificaciones/notificaciones.service');
const repo = require('./reservas.repository');

const VIGENTES = new Set([ESTADOS_RESERVA.SOLICITADA, ESTADOS_RESERVA.CONFIRMADA]);
const CUANDO_VALIDOS = new Set(['proximas', 'pasadas', 'todas']);
const LIMITE_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

const viajeNoEncontrado = () => new NotFoundError('Viaje no encontrado', { code: 'VIAJE_NO_ENCONTRADO' });
const reservaNoEncontrada = () => new NotFoundError('Reserva no encontrada', { code: 'RESERVA_NO_ENCONTRADA' });
const duplicada = (cause) =>
  new ConflictError('Ya tienes una solicitud vigente en este viaje', { code: 'RESERVA_DUPLICADA', cause });

function aReserva(f) {
  return {
    id: f.id,
    viaje_id: f.viaje_id,
    estado: f.estado,
    recogida: aPunto(f.recogida_lat, f.recogida_lng, f.recogida_texto),
    bajada: f.bajada_lat === null ? null : aPunto(f.bajada_lat, f.bajada_lng, null),
    distancia_pie_m: f.distancia_pie_m,
    solicitada_en: f.solicitada_en,
    respondida_en: f.respondida_en,
  };
}

function aReservaConViaje(f) {
  const recogida = { lat: Number(f.recogida_lat), lng: Number(f.recogida_lng) };
  return {
    ...aReserva(f),
    punto_abordaje: puntoDeAbordaje(f.polilinea, recogida),
    viaje: {
      id: f.viaje_id,
      estado: f.viaje_estado,
      salida_en: f.salida_en,
      costo_referencia: aNumero(f.costo_referencia),
      origen: aPunto(f.origen_lat, f.origen_lng, f.origen_texto),
      destino: aPunto(f.destino_lat, f.destino_lng, f.destino_texto),
      ruta: aRuta(f),
      conductor: { id: f.conductor_id, nombre_visible: f.conductor_nombre },
      vehiculo: { placa_o_descripcion: f.vehiculo_descripcion },
    },
  };
}

// ---------- Solicitar un asiento (RF-15) ----------

function validarSolicitud(body = {}) {
  const errores = {};
  const viajeId = v.leerId(body.viaje_id);
  if (!viajeId) errores.viaje_id = 'Requerido: id entero positivo';
  const recogida = v.leerPunto(body.recogida, 'recogida', errores);
  const bajada = body.bajada === undefined || body.bajada === null ? null : v.leerPunto(body.bajada, 'bajada', errores);
  v.lanzarSiHayErrores(errores);
  return { viajeId, recogida, bajada };
}

// Traduce el motivo de evaluarRuta a un error con un mensaje por campo.
function errorDeRuta(ev) {
  const max = REGLAS.MAX_DISTANCIA_PIE_M;
  if (ev.motivo === 'SENTIDO_CONTRARIO') {
    return new ValidationError('El viaje va en sentido contrario', {
      code: 'SENTIDO_CONTRARIO',
      details: { bajada: 'La ruta pasa por tu punto de bajada antes que por tu punto de recogida' },
    });
  }
  const campo = ev.motivo === 'BAJADA_LEJOS' ? 'bajada' : 'recogida';
  const metros = campo === 'bajada' ? ev.distanciaBajadaM : ev.distanciaPieM;
  return new ValidationError('El punto queda lejos de la ruta del viaje', {
    code: 'FUERA_DE_RUTA',
    details: { [campo]: `Queda a ${metros ?? '?'} m de la ruta (máximo ${max} m)` },
  });
}

// Una solicitud = un asiento. El asiento se descuenta cuando el conductor CONFIRMA, no aquí;
// pero si ya no quedan asientos, no se acepta la solicitud.
async function solicitar(tenant, pasajeroId, body) {
  const { viajeId, recogida, bajada } = validarSolicitud(body);

  try {
    return await withTenant(tenant.schema, async (db) => {
      const viaje = await repo.bloquearViaje(db, viajeId);
      if (!viaje) throw viajeNoEncontrado();
      if (viaje.conductor_id === pasajeroId) {
        throw new ConflictError('No puedes pedir asiento en tu propio viaje', { code: 'ES_TU_VIAJE' });
      }
      if (viaje.estado === ESTADOS_VIAJE.LLENO || viaje.asientos_disponibles < 1) {
        throw new ConflictError('El viaje ya no tiene asientos disponibles', { code: 'VIAJE_LLENO' });
      }
      if (!esReservable(viaje)) {
        throw new ConflictError('El viaje ya no acepta solicitudes', { code: 'VIAJE_NO_DISPONIBLE' });
      }
      if (await repo.findVigente(db, viajeId, pasajeroId)) throw duplicada();

      // RF-22: no dos reservas vigentes en la misma ventana de tiempo.
      await repo.bloquearUsuario(db, pasajeroId);
      if (await repo.hayTraslapeDelPasajero(db, pasajeroId, viajeId)) {
        throw new ConflictError('Ya tienes otra reserva en un viaje que se cruza con este horario', {
          code: 'RESERVA_TRASLAPADA',
        });
      }

      const ev = evaluarRuta(viaje.polilinea, recogida, bajada);
      if (!ev.compatible) throw errorDeRuta(ev);

      const reserva = await repo.insertar(db, {
        viajeId,
        pasajeroId,
        recogida,
        bajada,
        distanciaPieM: ev.distanciaPieM,
      });

      const nombre = await repo.nombreDeUsuario(db, pasajeroId);
      await notificaciones.crearEnTransaccion(db, [viaje.conductor_id], {
        tipo: TIPOS_NOTIFICACION.RESERVA_SOLICITADA,
        titulo: 'Nueva solicitud de asiento',
        mensaje: `${nombre} pidió un asiento en tu viaje del ${fechaHoraLegible(viaje.salida_en)}.`,
        viajeId,
      });

      return aReserva(reserva);
    });
  } catch (err) {
    // Dos solicitudes simultáneas del mismo pasajero: la segunda choca con el índice único.
    if (err.code === '23505' && err.constraint === 'ux_reserva_activa') throw duplicada(err);
    throw err;
  }
}

// ---------- Cancelar (RF-15) ----------

// El pasajero cancela su solicitud o su lugar confirmado, siempre que el viaje no haya salido.
// Si estaba confirmada, el asiento vuelve a quedar libre (y un viaje lleno se reabre).
async function cancelar(tenant, pasajeroId, idParam) {
  const id = v.leerId(idParam);
  if (!id) throw reservaNoEncontrada();

  return withTenant(tenant.schema, async (db) => {
    const previa = await repo.findDelPasajero(db, pasajeroId, id);
    if (!previa) throw reservaNoEncontrada();

    // Orden de bloqueo: viaje → reserva.
    const viaje = await repo.bloquearViaje(db, previa.viaje_id);
    const reserva = await repo.findDelPasajero(db, pasajeroId, id, { bloquear: true });

    if (!VIGENTES.has(reserva.estado)) {
      throw new ConflictError(`La reserva ya está ${reserva.estado}`, { code: 'RESERVA_NO_CANCELABLE' });
    }
    const salio = new Date(viaje.salida_en).getTime() <= Date.now();
    if (salio || ![ESTADOS_VIAJE.ABIERTO, ESTADOS_VIAJE.LLENO].includes(viaje.estado)) {
      throw new ConflictError('El viaje ya salió: no se puede cancelar', { code: 'RESERVA_NO_CANCELABLE' });
    }

    const cancelada = await repo.marcarCancelada(db, id);
    const estabaConfirmada = reserva.estado === ESTADOS_RESERVA.CONFIRMADA;
    if (estabaConfirmada) await repo.liberarAsiento(db, viaje.id);

    const nombre = await repo.nombreDeUsuario(db, pasajeroId);
    await notificaciones.crearEnTransaccion(db, [viaje.conductor_id], {
      tipo: TIPOS_NOTIFICACION.RESERVA_CANCELADA,
      titulo: estabaConfirmada ? 'Un pasajero canceló' : 'Solicitud retirada',
      mensaje: `${nombre} canceló su ${estabaConfirmada ? 'lugar' : 'solicitud'} en tu viaje del ${fechaHoraLegible(viaje.salida_en)}.`,
      viajeId: viaje.id,
    });

    return aReserva(cancelada);
  });
}

// ---------- Aceptar / rechazar (conductor, RF-16, RF-17, RF-21) ----------

const noPendiente = (estado) =>
  new ConflictError(`La solicitud ya no está pendiente (estado: ${estado})`, { code: 'RESERVA_NO_PENDIENTE' });

const viajeLleno = (cause) =>
  new ConflictError('El viaje ya no tiene asientos disponibles', { code: 'VIAJE_LLENO', cause });

// Bloquea viaje → reserva (mismo orden que en el resto) y devuelve ambos.
async function bloquearParaResponder(db, conductorId, id) {
  const previa = await repo.findParaConductor(db, conductorId, id);
  if (!previa) throw reservaNoEncontrada();
  const viaje = await repo.bloquearViaje(db, previa.viaje_id);
  const reserva = await repo.findParaConductor(db, conductorId, id, { bloquear: true });
  if (reserva.estado !== ESTADOS_RESERVA.SOLICITADA) throw noPendiente(reserva.estado);
  return { viaje, reserva };
}

// Acepta una solicitud: la reserva pasa a confirmada y se descuenta un asiento, todo en la
// misma transacción con el viaje bloqueado (RNF-05). Si el viaje se llena, las demás
// solicitudes pendientes se rechazan solas (RF-21). El trigger trg_reservas_cupo es la última
// barrera contra la sobreventa (RF-17).
async function aceptar(tenant, conductorId, idParam) {
  const id = v.leerId(idParam);
  if (!id) throw reservaNoEncontrada();

  try {
    return await withTenant(tenant.schema, async (db) => {
      const { viaje } = await bloquearParaResponder(db, conductorId, id);
      if (viaje.estado === ESTADOS_VIAJE.LLENO || viaje.asientos_disponibles < 1) throw viajeLleno();
      if (!esReservable(viaje)) {
        throw new ConflictError('El viaje ya no acepta reservas', { code: 'VIAJE_NO_DISPONIBLE' });
      }

      const confirmada = await repo.responder(db, id, ESTADOS_RESERVA.CONFIRMADA);
      const actualizado = await repo.ocuparAsiento(db, viaje.id);
      const rechazadas = actualizado.asientos_disponibles === 0 ? await repo.rechazarPendientes(db, viaje.id) : [];

      const conductor = await repo.nombreDeUsuario(db, conductorId);
      const fecha = fechaHoraLegible(viaje.salida_en);
      const lugar = confirmada.recogida_texto ? ` Punto de recogida: ${confirmada.recogida_texto}.` : '';
      await notificaciones.crearEnTransaccion(db, [confirmada.pasajero_id], {
        tipo: TIPOS_NOTIFICACION.RESERVA_CONFIRMADA,
        titulo: '¡Tienes lugar!',
        mensaje: `${conductor} aceptó tu solicitud para el viaje del ${fecha}.${lugar}`,
        viajeId: viaje.id,
      });
      await notificaciones.crearEnTransaccion(
        db,
        rechazadas.map((r) => r.pasajero_id),
        {
          tipo: TIPOS_NOTIFICACION.RESERVA_RECHAZADA,
          titulo: 'El viaje se llenó',
          mensaje: `El viaje de ${conductor} del ${fecha} ya no tiene asientos; tu solicitud se rechazó automáticamente.`,
          viajeId: viaje.id,
        },
      );

      return {
        reserva: aReserva(confirmada),
        viaje: {
          id: viaje.id,
          estado: actualizado.estado,
          asientos_disponibles: actualizado.asientos_disponibles,
          asientos_ofrecidos: actualizado.asientos_ofrecidos,
        },
        rechazadas_automaticamente: rechazadas.length,
      };
    });
  } catch (err) {
    if (err.code === '23514' && err.constraint === 'chk_cupo_confirmadas') throw viajeLleno(err);
    throw err;
  }
}

async function rechazar(tenant, conductorId, idParam) {
  const id = v.leerId(idParam);
  if (!id) throw reservaNoEncontrada();

  return withTenant(tenant.schema, async (db) => {
    const { viaje } = await bloquearParaResponder(db, conductorId, id);
    const rechazada = await repo.responder(db, id, ESTADOS_RESERVA.RECHAZADA);

    const conductor = await repo.nombreDeUsuario(db, conductorId);
    await notificaciones.crearEnTransaccion(db, [rechazada.pasajero_id], {
      tipo: TIPOS_NOTIFICACION.RESERVA_RECHAZADA,
      titulo: 'Solicitud no aceptada',
      mensaje: `${conductor} no pudo aceptar tu solicitud para el viaje del ${fechaHoraLegible(viaje.salida_en)}. Busca otro viaje compatible.`,
      viajeId: viaje.id,
    });
    return aReserva(rechazada);
  });
}

// ---------- Detalle (RF-18: lo ven el pasajero y el conductor) ----------

async function detalle(tenant, usuarioId, idParam) {
  const id = v.leerId(idParam);
  if (!id) throw reservaNoEncontrada();
  const f = await withTenant(tenant.schema, (db) => repo.findDetalle(db, usuarioId, id));
  if (!f) throw reservaNoEncontrada();
  return {
    ...aReservaConViaje(f),
    pasajero: { id: f.pasajero_id, nombre_visible: f.pasajero_nombre },
    soy: f.pasajero_id === usuarioId ? 'pasajero' : 'conductor',
  };
}

// ---------- Mis reservas ----------

function leerFiltros({ cuando = 'todas', limite } = {}) {
  const errores = {};
  if (!CUANDO_VALIDOS.has(cuando)) errores.cuando = 'proximas, pasadas o todas';
  const n = limite === undefined ? LIMITE_DEFECTO : Number(limite);
  if (!Number.isInteger(n) || n < 1 || n > LIMITE_MAXIMO) errores.limite = `Entero de 1 a ${LIMITE_MAXIMO}`;
  v.lanzarSiHayErrores(errores);
  return { cuando, limite: n };
}

async function misReservas(tenant, pasajeroId, query) {
  const filtros = leerFiltros(query);
  const filas = await withTenant(tenant.schema, (db) => repo.listarDelPasajero(db, pasajeroId, filtros));
  return filas.map(aReservaConViaje);
}

module.exports = { solicitar, cancelar, misReservas, aceptar, rechazar, detalle };
