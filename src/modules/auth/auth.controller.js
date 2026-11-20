const service = require('./auth.service');

async function register(req, res) {
  const { usuario, token } = await service.registrar(req.body);
  res.status(201).json({ usuario, token });
}

async function me(req, res) {
  const usuario = await service.obtenerPerfil({ usuarioId: req.auth.usuarioId, tenant: req.tenant });
  res.json({ usuario });
}

module.exports = { register, me };
