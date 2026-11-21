const { withTenant } = require('../../config/db');
const { NotFoundError, ForbiddenError, ConflictError, ValidationError } = require('../../shared/errors');
const { ESTADOS_VIAJE } = require('../../shared/constants/estados');
const v = require('../../shared/utils/validacion');
const repo = require('./mensajes.repository');

const LIMITE = 200;
const CERRADOS = new Set([ESTADOS_VIAJE.CANCELADO, ESTADOS_VIAJE.FINALIZADO]);

const viajeNoEncontrado = () => new NotFoundError('Viaje no encontrado', { code: 'VIAJE_NO_ENCONTRADO' });

function aMensaje(f, usuarioId) {
  return {
    id: f.id,
    texto: f.texto,
    enviado_en: f.enviado_en,
    autor: { id: f.autor_id, nombre_visible: f.autor_nombre },
    mio: f.autor_id === usuarioId,
  };
}

// Leer: conductor o pasajero confirmado (o que ya completó el viaje, para ver el historial).
// Escribir: solo conductor o pasajero confirmado, y mientras el viaje no esté cerrado.
async function verificarAcceso(db, viajeId, usuarioId, { escribir }) {
  const p = await repo.participacion(db, viajeId, usuarioId);
  if (!p) throw viajeNoEncontrado();
  const puedeLeer = p.es_conductor || p.confirmado || p.completado;
  const puedeEscribir = p.es_conductor || p.confirmado;
  if (!(escribir ? puedeEscribir : puedeLeer)) {
    throw new ForbiddenError('El chat es solo para el conductor y los pasajeros confirmados', {
      code: 'NO_PARTICIPA',
    });
  }
  if (escribir && CERRADOS.has(p.estado)) {
    throw new ConflictError(`El viaje está ${p.estado}: el chat ya no acepta mensajes`, { code: 'CHAT_CERRADO' });
  }
  return p;
}

function leerViajeId(valor) {
  const id = v.leerId(valor);
  if (!id) throw viajeNoEncontrado();
  return id;
}

async function listar(tenant, usuarioId, viajeIdParam, query = {}) {
  const viajeId = leerViajeId(viajeIdParam);
  // despues_de: id del último mensaje que ya tiene el cliente (0 = desde el principio).
  const crudo = query.despues_de ?? '0';
  if (typeof crudo !== 'string' || !/^\d{1,10}$/.test(crudo)) {
    throw new ValidationError('Datos inválidos', { details: { despues_de: 'Id de mensaje (entero ≥ 0)' } });
  }
  const despuesDe = Number(crudo);

  return withTenant(tenant.schema, async (db) => {
    const p = await verificarAcceso(db, viajeId, usuarioId, { escribir: false });
    const filas = await repo.listar(db, viajeId, { despuesDe, limite: LIMITE });
    return {
      mensajes: filas.map((f) => aMensaje(f, usuarioId)),
      participantes: await repo.participantes(db, viajeId),
      puede_escribir: (p.es_conductor || p.confirmado) && !CERRADOS.has(p.estado),
    };
  });
}

async function enviar(tenant, usuarioId, viajeIdParam, body = {}) {
  const viajeId = leerViajeId(viajeIdParam);
  const errores = {};
  const texto = v.leerTexto(body.texto, 'texto', errores, { max: 500, requerido: true });
  v.lanzarSiHayErrores(errores);

  return withTenant(tenant.schema, async (db) => {
    await verificarAcceso(db, viajeId, usuarioId, { escribir: true });
    return aMensaje(await repo.insertar(db, viajeId, usuarioId, texto), usuarioId);
  });
}

module.exports = { listar, enviar };
