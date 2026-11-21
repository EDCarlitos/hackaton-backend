const { withTenant } = require('../../config/db');
const mapas = require('../../shared/maps');
const { NotFoundError, ForbiddenError, ConflictError } = require('../../shared/errors');
const { ESTADOS_VIAJE, ESTADOS_RESERVA, TIPOS_NOTIFICACION } = require('../../shared/constants/estados');
const v = require('../../shared/utils/validacion');
const { REGLAS, evaluarRuta, puntoDeAbordaje } = require('../../shared/utils/emparejamiento');
const { aNumero, aPunto, aRuta, fechaHoraLegible } = require('../../shared/utils/formato');
const vehiculos = require('../vehiculos/vehiculos.service');
const notificaciones = require('../notificaciones/notificaciones.service');
const repo = require('./viajes.repository');

const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS_VIAJE));
const CANCELABLES = new Set([ESTADOS_VIAJE.ABIERTO, ESTADOS_VIAJE.LLENO]);
const CUANDO_VALIDOS = new Set(['proximos', 'pasados', 'todos']);
const LIMITE_DEFECTO = 50;
const LIMITE_MAXIMO = 100;
// RF-20: un viaje se cierra solo cuando pasan estos minutos desde su hora de salida.
const MARGEN_CIERRE_MIN = 60;
const LIMITE_BUSQUEDA_DEFECTO = 20;
const LIMITE_BUSQUEDA_MAXIMO = 50;

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

// RF-18: a cada reserva se le agrega el punto acordado sobre la ruta (dónde se sube).
const conPuntoAbordaje = (reservas, polilinea) =>
  reservas.map((r) => ({ ...r, punto_abordaje: puntoDeAbordaje(polilinea, r.recogida) }));

// Para "Mis viajes": el viaje con sus solicitudes entrantes y pasajeros confirmados.
function aViajeDelConductor(f) {
  return {
    ...aViaje(f),
    vehiculo: { id: f.vehiculo_id, placa_o_descripcion: f.vehiculo_descripcion },
    solicitudes_pendientes: contar(f.reservas, ESTADOS_RESERVA.SOLICITADA),
    pasajeros_confirmados: contar(f.reservas, ESTADOS_RESERVA.CONFIRMADA),
    reservas: conPuntoAbordaje(f.reservas, f.polilinea),
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
    if (f.conductor_id === usuarioId) {
      viaje.reservas = conPuntoAbordaje(await repo.listarReservas(db, id), f.polilinea);
    } else {
      const mia = await repo.findMiReserva(db, id, usuarioId);
      viaje.mi_reserva = mia && {
        id: mia.id,
        estado: mia.estado,
        recogida: aPunto(mia.recogida_lat, mia.recogida_lng, mia.recogida_texto),
        distancia_pie_m: mia.distancia_pie_m,
        punto_abordaje: puntoDeAbordaje(f.polilinea, { lat: Number(mia.recogida_lat), lng: Number(mia.recogida_lng) }),
      };
    }
    return viaje;
  });
}

// ---------- Buscar (RF-12, RF-13, RF-14) ----------

function leerBusqueda(q = {}) {
  const errores = {};
  const recogida = v.leerPuntoDeQuery(q.recogida_lat, q.recogida_lng, 'recogida', errores, { requerido: true });
  const bajada = v.leerPuntoDeQuery(q.bajada_lat, q.bajada_lng, 'bajada', errores);
  const salidaEn = q.salida_en === undefined ? new Date() : v.leerSalida(q.salida_en, 'salida_en', errores);
  const limite = q.limite === undefined ? LIMITE_BUSQUEDA_DEFECTO : Number(q.limite);
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_BUSQUEDA_MAXIMO) {
    errores.limite = `Entero de 1 a ${LIMITE_BUSQUEDA_MAXIMO}`;
  }
  v.lanzarSiHayErrores(errores);
  return { recogida, bajada, salidaEn, limite };
}

// Lo que ve el pasajero por cada viaje compatible (RF-14).
function aResultado(f, ev, salidaDeseada) {
  return {
    viaje_id: f.id,
    salida_en: f.salida_en,
    asientos_disponibles: f.asientos_disponibles,
    asientos_ofrecidos: f.asientos_ofrecidos,
    costo_referencia: aNumero(f.costo_referencia),
    distancia_pie_m: ev.distanciaPieM,
    punto_abordaje: ev.puntoAbordaje,
    distancia_bajada_m: ev.distanciaBajadaM ?? null,
    punto_bajada: ev.puntoBajada ?? null,
    diferencia_min: Math.round((new Date(f.salida_en) - salidaDeseada) / 60_000),
    estado: f.estado,
    origen: aPunto(f.origen_lat, f.origen_lng, f.origen_texto),
    destino: aPunto(f.destino_lat, f.destino_lng, f.destino_texto),
    ruta: aRuta(f),
    conductor: { id: f.conductor_id, nombre_visible: f.conductor_nombre },
    vehiculo: { id: f.vehiculo_id, placa_o_descripcion: f.vehiculo_descripcion },
    mi_reserva: f.mi_reserva_id ? { id: f.mi_reserva_id, estado: f.mi_reserva_estado } : null,
  };
}

// RF-13: viajes compatibles con el punto de recogida (y de bajada, si se da) según REGLAS,
// ordenados por distancia a pie a la ruta y luego por diferencia con la hora deseada.
async function buscar(tenant, pasajeroId, query) {
  const { recogida, bajada, salidaEn, limite } = leerBusqueda(query);
  const ventanaMs = REGLAS.VENTANA_HORA_MIN * 60_000;

  const filas = await withTenant(tenant.schema, (db) =>
    repo.listarCandidatos(db, {
      pasajeroId,
      desde: new Date(salidaEn.getTime() - ventanaMs),
      hasta: new Date(salidaEn.getTime() + ventanaMs),
      deseada: salidaEn,
      limite: REGLAS.MAX_CANDIDATOS,
    }),
  );

  const resultados = [];
  for (const f of filas) {
    const ev = evaluarRuta(f.polilinea, recogida, bajada);
    if (ev.compatible) resultados.push(aResultado(f, ev, salidaEn));
  }
  resultados.sort(
    (a, b) =>
      a.distancia_pie_m - b.distancia_pie_m ||
      Math.abs(new Date(a.salida_en) - salidaEn) - Math.abs(new Date(b.salida_en) - salidaEn) ||
      a.viaje_id - b.viaje_id,
  );

  return {
    resultados: resultados.slice(0, limite),
    criterios: {
      salida_deseada: salidaEn,
      ventana_min: REGLAS.VENTANA_HORA_MIN,
      max_distancia_pie_m: REGLAS.MAX_DISTANCIA_PIE_M,
    },
  };
}

// "Próximos": TODOS los viajes futuros que aceptan solicitudes, sin ventana de hora, del más pronto
// al más tarde. Con punto de recogida (y bajada) aplica la regla de distancia a la ruta de la sección 5;
// sin punto, lista todo lo disponible (distancia_pie_m = null). Para "a tal hora" se usa buscar().
const LIMITE_PROXIMOS_DEFECTO = 30;
const LIMITE_PROXIMOS_MAXIMO = 100;
const HORIZONTE_PROXIMOS_DIAS = 30; // igual que la anticipación máxima al publicar

function leerProximos(q = {}) {
  const errores = {};
  const recogida = v.leerPuntoDeQuery(q.recogida_lat, q.recogida_lng, 'recogida', errores);
  const bajada = v.leerPuntoDeQuery(q.bajada_lat, q.bajada_lng, 'bajada', errores);
  if (bajada && !recogida && !errores.recogida) errores.bajada = 'Manda también el punto de recogida';
  const limite = q.limite === undefined ? LIMITE_PROXIMOS_DEFECTO : Number(q.limite);
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_PROXIMOS_MAXIMO) {
    errores.limite = `Entero de 1 a ${LIMITE_PROXIMOS_MAXIMO}`;
  }
  v.lanzarSiHayErrores(errores);
  return { recogida, bajada, limite };
}

async function proximos(tenant, pasajeroId, query) {
  const { recogida, bajada, limite } = leerProximos(query);
  const ahora = new Date();

  // Los candidatos salen ordenados por cercanía a "ahora", o sea, del más pronto al más tarde.
  const filas = await withTenant(tenant.schema, (db) =>
    repo.listarCandidatos(db, {
      pasajeroId,
      desde: ahora,
      hasta: new Date(ahora.getTime() + HORIZONTE_PROXIMOS_DIAS * 86_400_000),
      deseada: ahora,
      limite: REGLAS.MAX_CANDIDATOS,
    }),
  );

  const resultados = [];
  for (const f of filas) {
    if (!recogida) {
      resultados.push(aResultado(f, { distanciaPieM: null, puntoAbordaje: null }, ahora));
    } else {
      const ev = evaluarRuta(f.polilinea, recogida, bajada);
      if (ev.compatible) resultados.push(aResultado(f, ev, ahora));
    }
    if (resultados.length === limite) break;
  }

  return {
    resultados,
    criterios: { con_recogida: Boolean(recogida), max_distancia_pie_m: REGLAS.MAX_DISTANCIA_PIE_M },
  };
}

// ---------- Cancelar (RF-11) ----------

function mensajeCancelacion(viaje, motivo) {
  const destino = viaje.destino_texto ? ` hacia ${viaje.destino_texto}` : '';
  const porque = motivo ? ` Motivo: ${motivo}` : '';
  return `${viaje.conductor_nombre} canceló el viaje del ${fechaHoraLegible(viaje.salida_en)}${destino}.${porque}`;
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

// ---------- Cierre automático (RF-20) ----------

// La llama el job de src/jobs/cierreAutomatico.js para cada institución.
function cerrarVencidos(tenant, margenMin = MARGEN_CIERRE_MIN) {
  return withTenant(tenant.schema, (db) => repo.cerrarVencidos(db, margenMin));
}

module.exports = {
  MARGEN_CIERRE_MIN,
  cerrarVencidos,
  publicar,
  buscar,
  proximos,
  republicar,
  misViajes,
  detalle,
  cancelar,
  guardarEnTransaccion,
  obtenerParaClonar,
};
