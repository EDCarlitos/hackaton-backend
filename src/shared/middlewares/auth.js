const { UnauthorizedError, ForbiddenError } = require('../errors');
const { ROLES } = require('../constants/roles');
const auth = require('../../modules/auth/auth.service');

const ROLES_VALIDOS = new Set(Object.values(ROLES));

// Autenticación: exige "Authorization: Bearer <token>".
// Deja req.auth = { usuarioId, rol }, req.tenant = { id, schema } y req.usuario (perfil público).
// El rol y el estado del usuario se leen de la BD en cada request, no del token.
async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Token requerido', { code: 'TOKEN_REQUERIDO' });
  }

  const { usuario, tenant } = await auth.autenticar(token);

  req.auth = { usuarioId: usuario.id, rol: usuario.rol };
  req.tenant = tenant;
  req.usuario = usuario;
  next();
}

// Autorización: se usa DESPUÉS de requireAuth. Ej: router.get('/x', requireAuth, requireRole(ROLES.ADMIN), ...)
function requireRole(...roles) {
  const invalidos = roles.filter((r) => !ROLES_VALIDOS.has(r));
  if (!roles.length || invalidos.length) {
    // Error de programación: falla al arrancar, no en el request.
    throw new Error(`requireRole: roles inválidos: ${invalidos.join(', ') || '(ninguno)'}`);
  }
  const permitidos = new Set(roles);

  return function verificarRol(req, res, next) {
    if (!req.auth) throw new Error('requireRole se usó sin requireAuth antes');
    if (!permitidos.has(req.auth.rol)) {
      throw new ForbiddenError('No tienes permiso para esta acción', { code: 'ROL_INSUFICIENTE' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
