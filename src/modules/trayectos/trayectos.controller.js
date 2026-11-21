const service = require('./trayectos.service');

async function crear(req, res) {
  const trayecto = await service.crear(req.tenant, req.auth.usuarioId, req.body);
  res.status(201).json({ trayecto });
}

async function listar(req, res) {
  const trayectos = await service.listar(req.tenant, req.auth.usuarioId);
  res.json({ trayectos });
}

async function eliminar(req, res) {
  await service.eliminar(req.tenant, req.auth.usuarioId, req.params.id);
  res.status(204).end();
}

async function borradorSalgoHoy(req, res) {
  const borrador = await service.borradorSalgoHoy(req.tenant, req.auth.usuarioId, req.params.id, req.query);
  res.json({ borrador });
}

async function salgoHoy(req, res) {
  const viaje = await service.salgoHoy(req.tenant, req.auth.usuarioId, req.params.id, req.body);
  res.status(201).json({ viaje });
}

module.exports = { crear, listar, eliminar, borradorSalgoHoy, salgoHoy };
