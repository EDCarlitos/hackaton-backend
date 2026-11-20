const bcrypt = require('bcryptjs');
const { withTenant } = require('../../config/db');
const { signToken } = require('../../shared/utils/jwt');
const { ValidationError, ForbiddenError, ConflictError, UnauthorizedError } = require('../../shared/errors');
const instituciones = require('../instituciones/instituciones.service');
const repo = require('./auth.repository');

const BCRYPT_ROUNDS = 10;
const CORREO_RE = /^[^\s@]+@([a-z0-9-]+\.)+[a-z]{2,}$/i;

function validarRegistro({ correo, password, nombre_visible, acepto_terminos } = {}) {
  const errores = {};
  const correoLimpio = typeof correo === 'string' ? correo.trim().toLowerCase() : '';
  const nombre = typeof nombre_visible === 'string' ? nombre_visible.trim() : '';

  if (!CORREO_RE.test(correoLimpio)) errores.correo = 'Correo inválido';
  if (typeof password !== 'string' || password.length < 8) {
    errores.password = 'Mínimo 8 caracteres';
  } else if (Buffer.byteLength(password) > 72) {
    errores.password = 'Máximo 72 bytes'; // límite de bcrypt
  }
  if (!nombre || nombre.length > 100) errores.nombre_visible = 'Requerido, máximo 100 caracteres';
  if (acepto_terminos !== undefined && typeof acepto_terminos !== 'boolean') {
    errores.acepto_terminos = 'Debe ser booleano';
  }

  if (Object.keys(errores).length) throw new ValidationError('Datos inválidos', { details: errores });
  return { correo: correoLimpio, password, nombreVisible: nombre, aceptoTerminos: acepto_terminos === true };
}

async function registrar(body) {
  const datos = validarRegistro(body);
  const dominio = datos.correo.split('@')[1];

  // 1. El dominio del correo decide la institución (y por lo tanto el schema).
  const institucion = await instituciones.findActivaPorDominio(dominio);
  if (!institucion) {
    throw new ForbiddenError('El dominio del correo no pertenece a una institución permitida', {
      code: 'DOMINIO_NO_PERMITIDO',
    });
  }

  // 2. Se guarda en la tabla usuarios del schema de esa institución.
  const passwordHash = await bcrypt.hash(datos.password, BCRYPT_ROUNDS);
  let usuario;
  try {
    usuario = await withTenant(institucion.schema_nombre, (db) =>
      repo.createUsuario(db, { ...datos, passwordHash }),
    );
  } catch (err) {
    if (err.code === '23505') {
      throw new ConflictError('El correo ya está registrado', { code: 'CORREO_DUPLICADO', cause: err });
    }
    throw err;
  }

  const token = signToken({ usuarioId: usuario.id, institucionId: institucion.id, rol: usuario.rol });
  return { usuario, token };
}

async function obtenerPerfil({ usuarioId, tenant }) {
  const usuario = await withTenant(tenant.schema, (db) => repo.findUsuarioById(db, usuarioId));
  if (!usuario || !usuario.activo) {
    throw new UnauthorizedError('Usuario no encontrado o inactivo', { code: 'USUARIO_INVALIDO' });
  }
  return usuario;
}

module.exports = { registrar, obtenerPerfil };
