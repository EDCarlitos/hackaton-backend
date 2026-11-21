const service = require('./mensajes.service');

async function listar(req, res) {
  const resultado = await service.listar(req.tenant, req.auth.usuarioId, req.params.viajeId, req.query);
  res.json(resultado);
}

async function enviar(req, res) {
  const mensaje = await service.enviar(req.tenant, req.auth.usuarioId, req.params.viajeId, req.body);
  res.status(201).json({ mensaje });
}

module.exports = { listar, enviar };
