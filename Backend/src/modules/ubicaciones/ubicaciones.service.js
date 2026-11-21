// Ubicación en vivo del conductor (la comparte él, la ven sus pasajeros confirmados).
// RNF-03: es opcional, solo cerca de la salida, solo con la app abierta (el navegador no la manda
// en segundo plano) y sin historial: se guarda la última posición y se borra al terminar.
const { withTenant } = require('../../config/db');
const { NotFoundError, ForbiddenError, ConflictError } = require('../../shared/errors');
const { ESTADOS_VIAJE } = require('../../shared/constants/estados');
const { aNumero } = require('../../shared/utils/formato');
const v = require('../../shared/utils/validacion');
const repo = require('./ubicaciones.repository');

// Ventana para compartir: desde 30 min antes de la salida hasta la duración + 60 min (mismo margen
// que el cierre automático del viaje, RF-20).
const VENTANA = Object.freeze({ antesMin: 30, despuesMin: 60 });
const CERRADOS = new Set([ESTADOS_VIAJE.CANCELADO, ESTADOS_VIAJE.FINALIZADO]);

const viajeNoEncontrado = () => new NotFoundError('Viaje no encontrado', { code: 'VIAJE_NO_ENCONTRADO' });

function leerViajeId(valor) {
  const id = v.leerId(valor);
  if (!id) throw viajeNoEncontrado();
  return id;
}

function leerUbicacion(body = {}) {
  const errores = {};
  const punto = v.leerPunto({ lat: body.lat, lng: body.lng }, 'ubicacion', errores);
  let precisionM = null;
  if (body.precision_m !== undefined && body.precision_m !== null) {
    if (typeof body.precision_m !== 'number' || !Number.isFinite(body.precision_m) || body.precision_m < 0 || body.precision_m > 100000) {
      errores.precision_m = 'Metros, de 0 a 100000';
    } else {
      precisionM = Math.round(body.precision_m);
    }
  }
  v.lanzarSiHayErrores(errores);
  return { lat: punto.lat, lng: punto.lng, precisionM };
}

const aUbicacion = (f) =>
  f && {
    lat: aNumero(f.lat),
    lng: aNumero(f.lng),
    precision_m: f.precision_m,
    actualizada_en: f.actualizada_en,
  };

const enVentana = (c) => {
  const ahora = Date.now();
  return ahora >= new Date(c.desde).getTime() && ahora <= new Date(c.hasta).getTime();
};

async function contexto(db, viajeId, usuarioId) {
  const c = await repo.contexto(db, viajeId, usuarioId, VENTANA);
  if (!c) throw viajeNoEncontrado();
  return c;
}

function exigirConductor(c) {
  if (!c.es_conductor) {
    throw new ForbiddenError('Solo el conductor del viaje comparte su ubicación', { code: 'NO_ES_CONDUCTOR' });
  }
}

// PUT: el conductor manda su posición actual (reemplaza la anterior).
async function compartir(tenant, usuarioId, viajeIdParam, body) {
  const viajeId = leerViajeId(viajeIdParam);
  const datos = leerUbicacion(body);
  return withTenant(tenant.schema, async (db) => {
    const c = await contexto(db, viajeId, usuarioId);
    exigirConductor(c);
    if (CERRADOS.has(c.estado)) {
      throw new ConflictError(`El viaje está ${c.estado}: ya no se comparte la ubicación`, { code: 'VIAJE_NO_ACTIVO' });
    }
    if (!enVentana(c)) {
      throw new ConflictError('Puedes compartir tu ubicación desde 30 min antes de la salida hasta que termina el viaje', {
        code: 'FUERA_DE_HORARIO',
        details: { desde: c.desde, hasta: c.hasta },
      });
    }
    return aUbicacion(await repo.guardar(db, viajeId, datos));
  });
}

// DELETE: el conductor deja de compartir (se borra la última posición).
async function dejarDeCompartir(tenant, usuarioId, viajeIdParam) {
  const viajeId = leerViajeId(viajeIdParam);
  return withTenant(tenant.schema, async (db) => {
    exigirConductor(await contexto(db, viajeId, usuarioId));
    await repo.borrar(db, viajeId);
  });
}

// GET: la ven el conductor y los pasajeros confirmados. Fuera de la ventana o con el viaje
// cerrado no se devuelve nada (aunque quedara una fila vieja).
async function ver(tenant, usuarioId, viajeIdParam) {
  const viajeId = leerViajeId(viajeIdParam);
  return withTenant(tenant.schema, async (db) => {
    const c = await contexto(db, viajeId, usuarioId);
    if (!c.es_conductor && !c.confirmado) {
      throw new ForbiddenError('La ubicación es solo para el conductor y los pasajeros confirmados', {
        code: 'NO_PARTICIPA',
      });
    }
    const vigente = !CERRADOS.has(c.estado) && enVentana(c);
    const ubicacion = vigente ? aUbicacion(await repo.buscar(db, viajeId)) : null;
    return {
      ubicacion: ubicacion || null,
      compartiendo: Boolean(ubicacion),
      ventana: { desde: c.desde, hasta: c.hasta, abierta: vigente },
    };
  });
}

// Lo llama el job de cierre: borra las ubicaciones de viajes cerrados o con la ventana vencida.
function limpiarVencidas(tenant) {
  return withTenant(tenant.schema, (db) => repo.borrarVencidas(db, VENTANA.despuesMin));
}

module.exports = { VENTANA, compartir, dejarDeCompartir, ver, limpiarVencidas };
