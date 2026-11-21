const { withTenant } = require('../../config/db');
const { ValidationError, NotFoundError, ConflictError } = require('../../shared/errors');
const v = require('../../shared/utils/validacion');
const repo = require('./vehiculos.repository');

const noEncontrado = () => new NotFoundError('Vehículo no encontrado', { code: 'VEHICULO_NO_ENCONTRADO' });

function validarCreacion(body = {}) {
  const errores = {};
  const placaODescripcion = v.leerTexto(body.placa_o_descripcion, 'placa_o_descripcion', errores, {
    max: 100,
    requerido: true,
  });
  const asientos = v.leerAsientos(body.asientos, 'asientos', errores);
  v.lanzarSiHayErrores(errores);
  return { placaODescripcion, asientos };
}

function crear(tenant, usuarioId, body) {
  const datos = validarCreacion(body);
  return withTenant(tenant.schema, (db) => repo.insertar(db, { usuarioId, ...datos }));
}

function listar(tenant, usuarioId) {
  return withTenant(tenant.schema, (db) => repo.listarDelUsuario(db, usuarioId));
}

// Se desactiva en vez de borrar: los viajes pasados lo siguen referenciando.
async function desactivar(tenant, usuarioId, idParam) {
  const id = v.leerId(idParam);
  if (!id) throw noEncontrado();
  const vehiculo = await withTenant(tenant.schema, (db) => repo.desactivar(db, usuarioId, id));
  if (!vehiculo) throw noEncontrado();
  return vehiculo;
}

// ---------- Para otros módulos (dentro de SU transacción) ----------

// Devuelve el vehículo activo con el que el conductor va a publicar.
// Si no manda vehiculo_id y tiene exactamente uno activo, se usa ese.
// Si se pasa `asientos`, verifica que quepan en el vehículo.
async function resolverParaPublicar(db, conductorId, vehiculoId, asientos) {
  let vehiculo;
  if (vehiculoId === undefined) {
    const activos = await repo.listarDelUsuario(db, conductorId, { soloActivos: true });
    if (activos.length !== 1) {
      throw new ValidationError('Indica con qué vehículo vas a manejar', {
        code: 'VEHICULO_REQUERIDO',
        details: {
          vehiculo_id: activos.length ? 'Tienes varios vehículos: elige uno' : 'Primero registra un vehículo',
        },
      });
    }
    [vehiculo] = activos;
  } else {
    vehiculo = await repo.findDelUsuario(db, conductorId, vehiculoId);
    if (!vehiculo) throw noEncontrado();
    if (!vehiculo.activo) throw new ConflictError('El vehículo está desactivado', { code: 'VEHICULO_INACTIVO' });
  }

  if (asientos !== undefined && asientos > vehiculo.asientos) {
    throw new ValidationError('Datos inválidos', {
      details: { asientos_ofrecidos: `Tu vehículo solo tiene ${vehiculo.asientos} asientos para pasajeros` },
    });
  }
  return vehiculo;
}

module.exports = { crear, listar, desactivar, resolverParaPublicar };
