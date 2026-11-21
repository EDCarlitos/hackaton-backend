const service = require('./viajes.service');

async function publicar(req, res) {
  const viaje = await service.publicar(req.tenant, req.auth.usuarioId, req.body);
  res.status(201).json({ viaje });
}

async function misViajes(req, res) {
  const viajes = await service.misViajes(req.tenant, req.auth.usuarioId, req.query);
  res.json({ viajes });
}

async function buscar(req, res) {
  const resultado = await service.buscar(req.tenant, req.auth.usuarioId, req.query);
  res.json(resultado);
}

async function detalle(req, res) {
  const viaje = await service.detalle(req.tenant, req.auth.usuarioId, req.params.id);
  res.json({ viaje });
}

async function republicar(req, res) {
  const viaje = await service.republicar(req.tenant, req.auth.usuarioId, req.params.id, req.body);
  res.status(201).json({ viaje });
}

async function cancelar(req, res) {
  const resultado = await service.cancelar(req.tenant, req.auth.usuarioId, req.params.id, req.body);
  res.json(resultado);
}

module.exports = { publicar, misViajes, buscar, detalle, republicar, cancelar };
