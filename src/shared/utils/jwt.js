const jwt = require('jsonwebtoken');
const env = require('../../config/env');

const ALGORITHM = 'HS256';

// payload: { sub: usuarioId, institucion_id, rol }
function signToken({ usuarioId, institucionId, rol }) {
  return jwt.sign({ institucion_id: institucionId, rol }, env.jwt.secret, {
    algorithm: ALGORITHM,
    subject: String(usuarioId),
    expiresIn: env.jwt.expiresIn,
  });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwt.secret, { algorithms: [ALGORITHM] });
}

module.exports = { signToken, verifyToken };
