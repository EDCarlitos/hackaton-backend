const service = require('./auth.service');

async function register(req, res) {
  const { usuario, token } = await service.registrar(req.body);
  res.status(201).json({ usuario, token });
}

async function login(req, res) {
  const { usuario, token } = await service.login(req.body);
  res.json({ usuario, token });
}

// requireAuth ya cargó el usuario fresco de la BD.
function me(req, res) {
  res.json({ usuario: req.usuario });
}

module.exports = { register, login, me };
