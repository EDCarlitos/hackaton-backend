const bcrypt = require('bcryptjs');
const { withTenant } = require('../../config/db');
const { signToken, verifyToken } = require('../../shared/utils/jwt');
const { ValidationError, ForbiddenError, ConflictError, UnauthorizedError } = require('../../shared/errors');
const instituciones = require('../instituciones/instituciones.service');
const repo = require('./auth.repository');

const BCRYPT_ROUNDS = 10;
const CORREO_RE = /^[^\s@]+@([a-z0-9-]+\.)+[a-z]{2,}$/i;

// Hash de relleno: si el correo no existe se compara igual contra él, para que la respuesta
// tarde lo mismo y no se pueda adivinar qué correos están registrados midiendo tiempos.
const HASH_RELLENO = bcrypt.hashSync('relleno-para-tiempo-constante', BCRYPT_ROUNDS);

const credencialesInvalidas = () =>
  new UnauthorizedError('Correo o contraseña incorrectos', { code: 'CREDENCIALES_INVALIDAS' });

const tokenInvalido = () => new UnauthorizedError('Token inválido o expirado', { code: 'TOKEN_INVALIDO' });

function normalizarCorreo(correo) {
  return typeof correo === 'string' ? correo.trim().toLowerCase() : '';
}

const dominioDe = (correo) => correo.split('@')[1];

const esIdValido = (valor) => Number.isSafeInteger(valor) && valor > 0;

function sinPassword({ password_hash, ...usuario }) {
  return usuario;
}

function emitirToken(usuario, institucion) {
  return signToken({ usuarioId: usuario.id, institucionId: institucion.id, rol: usuario.rol });
}

// ---------- Registro ----------

function validarRegistro({ correo, password, nombre_visible, acepto_terminos } = {}) {
  const errores = {};
  const correoLimpio = normalizarCorreo(correo);
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

  // 1. El dominio del correo decide la institución (y por lo tanto el schema).
  const institucion = await instituciones.findActivaPorDominio(dominioDe(datos.correo));
  if (!institucion) {
    throw new ForbiddenError('El dominio del correo no pertenece a una institución permitida', {
      code: 'DOMINIO_NO_PERMITIDO',
    });
  }

  // 2. Se guarda en la tabla usuarios del schema de esa institución.
  const passwordHash = await bcrypt.hash(datos.password, BCRYPT_ROUNDS);
  let usuario;
  try {
    usuario = await withTenant(institucion.schema_nombre, (db) => repo.createUsuario(db, { ...datos, passwordHash }));
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'usuarios_correo_key') {
      throw new ConflictError('El correo ya está registrado', { code: 'CORREO_DUPLICADO', cause: err });
    }
    throw err;
  }

  return { usuario, token: emitirToken(usuario, institucion) };
}

// ---------- Login ----------

function validarLogin({ correo, password } = {}) {
  const errores = {};
  const correoLimpio = normalizarCorreo(correo);
  if (!CORREO_RE.test(correoLimpio)) errores.correo = 'Correo inválido';
  if (typeof password !== 'string' || !password) errores.password = 'Requerido';
  if (Object.keys(errores).length) throw new ValidationError('Datos inválidos', { details: errores });
  return { correo: correoLimpio, password };
}

async function login(body) {
  const { correo, password } = validarLogin(body);

  // El dominio decide el schema donde se busca al usuario.
  const institucion = await instituciones.findActivaPorDominio(dominioDe(correo));
  const usuario = institucion
    ? await withTenant(institucion.schema_nombre, (db) => repo.findUsuarioConPasswordPorCorreo(db, correo))
    : null;

  // Siempre se corre bcrypt (aunque no haya usuario) y el error es el mismo en todos los casos:
  // no se revela si falló el dominio, el correo o la contraseña.
  const passwordOk = await bcrypt.compare(password, usuario ? usuario.password_hash : HASH_RELLENO);
  if (!usuario || !passwordOk) throw credencialesInvalidas();

  // Solo con la contraseña correcta se informa que la cuenta está desactivada.
  if (!usuario.activo) {
    throw new ForbiddenError('La cuenta está desactivada', { code: 'USUARIO_INACTIVO' });
  }

  return { usuario: sinPassword(usuario), token: emitirToken(usuario, institucion) };
}

// ---------- Sesión (lo usa requireAuth) ----------

// Valida el JWT y devuelve la sesión con datos frescos de la BD:
// si el usuario se desactiva o le cambian el rol, aplica en el siguiente request.
async function autenticar(token) {
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw tokenInvalido();
  }

  const usuarioId = Number(payload.sub);
  if (!esIdValido(usuarioId) || !esIdValido(payload.institucion_id)) throw tokenInvalido();

  // El schema sale de public.instituciones, nunca del token.
  const institucion = await instituciones.findActivaPorId(payload.institucion_id);
  if (!institucion) throw new UnauthorizedError('Institución no válida', { code: 'INSTITUCION_INVALIDA' });

  const usuario = await withTenant(institucion.schema_nombre, (db) => repo.findUsuarioById(db, usuarioId));
  if (!usuario || !usuario.activo) {
    throw new UnauthorizedError('Usuario no encontrado o inactivo', { code: 'USUARIO_INVALIDO' });
  }

  return { usuario, tenant: { id: institucion.id, schema: institucion.schema_nombre } };
}

module.exports = { registrar, login, autenticar };
