const { verifyToken } = require('../utils/jwt');
const { UnauthorizedError } = require('../errors');
const instituciones = require('../../modules/instituciones/instituciones.service');

// Exige "Authorization: Bearer <token>".
// Deja req.auth = { usuarioId, rol } y req.tenant = { id, schema }.
// El schema siempre se obtiene de public.instituciones, nunca del token ni del cliente.
async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Token requerido', { code: 'TOKEN_REQUERIDO' });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new UnauthorizedError('Token inválido o expirado', { code: 'TOKEN_INVALIDO' });
  }

  const institucion = await instituciones.findActivaPorId(payload.institucion_id);
  if (!institucion) throw new UnauthorizedError('Institución no válida', { code: 'INSTITUCION_INVALIDA' });

  req.auth = { usuarioId: Number(payload.sub), rol: payload.rol };
  req.tenant = { id: institucion.id, schema: institucion.schema_nombre };
  next();
}

module.exports = { requireAuth };
