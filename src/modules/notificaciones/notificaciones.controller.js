const service = require('./notificaciones.service');

async function listar(req, res) {
  const resultado = await service.listar(req.tenant, req.auth.usuarioId, req.query);
  res.json(resultado);
}

async function marcarLeida(req, res) {
  const notificacion = await service.marcarLeida(req.tenant, req.auth.usuarioId, req.params.id);
  res.json({ notificacion });
}

module.exports = { listar, marcarLeida };
