const { withTenant } = require('../../config/db');
const { NotFoundError, ValidationError } = require('../../shared/errors');
const v = require('../../shared/utils/validacion');
const repo = require('./notificaciones.repository');

const LIMITE_DEFECTO = 30;
const LIMITE_MAXIMO = 100;

const noEncontrada = () => new NotFoundError('Notificación no encontrada', { code: 'NOTIFICACION_NO_ENCONTRADA' });

function leerConsulta({ no_leidas, limite } = {}) {
  const errores = {};
  if (no_leidas !== undefined && !['true', 'false'].includes(no_leidas)) errores.no_leidas = 'true o false';
  const n = limite === undefined ? LIMITE_DEFECTO : Number(limite);
  if (!Number.isInteger(n) || n < 1 || n > LIMITE_MAXIMO) errores.limite = `Entero de 1 a ${LIMITE_MAXIMO}`;
  if (Object.keys(errores).length) throw new ValidationError('Datos inválidos', { details: errores });
  return { soloNoLeidas: no_leidas === 'true', limite: n };
}

function listar(tenant, usuarioId, query) {
  const opciones = leerConsulta(query);
  return withTenant(tenant.schema, async (db) => ({
    notificaciones: await repo.listarDelUsuario(db, usuarioId, opciones),
    no_leidas: await repo.contarNoLeidas(db, usuarioId),
  }));
}

async function marcarLeida(tenant, usuarioId, idParam) {
  const id = v.leerId(idParam);
  if (!id) throw noEncontrada();
  const notificacion = await withTenant(tenant.schema, (db) => repo.marcarLeida(db, usuarioId, id));
  if (!notificacion) throw noEncontrada();
  return notificacion;
}

// ---------- Para otros módulos (dentro de SU transacción) ----------

// Se llama con el `db` de la transacción del evento (ej. cancelar el viaje):
// si el evento hace ROLLBACK, tampoco quedan avisos.
function crearEnTransaccion(db, usuarioIds, { tipo, titulo, mensaje, viajeId = null }) {
  return repo.insertarParaUsuarios(db, [...new Set(usuarioIds)], { tipo, titulo, mensaje, viajeId });
}

module.exports = { listar, marcarLeida, crearEnTransaccion };
