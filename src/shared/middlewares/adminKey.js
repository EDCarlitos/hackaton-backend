const crypto = require('node:crypto');
const env = require('../../config/env');
const { UnauthorizedError } = require('../errors');

const expected = Buffer.from(env.platformAdminKey);

// Protege endpoints de plataforma (ej. crear instituciones). Header: X-Admin-Key.
function requireAdminKey(req, res, next) {
  const given = Buffer.from(req.get('x-admin-key') || '');
  const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!ok) throw new UnauthorizedError('Clave de administrador inválida', { code: 'ADMIN_KEY_INVALIDA' });
  next();
}

module.exports = { requireAdminKey };
