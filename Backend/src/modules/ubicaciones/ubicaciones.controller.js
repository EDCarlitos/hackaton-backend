const service = require('./ubicaciones.service');

async function ver(req, res) {
  res.json(await service.ver(req.tenant, req.auth.usuarioId, req.params.viajeId));
}

async function compartir(req, res) {
  const ubicacion = await service.compartir(req.tenant, req.auth.usuarioId, req.params.viajeId, req.body);
  res.json({ ubicacion });
}

async function dejarDeCompartir(req, res) {
  await service.dejarDeCompartir(req.tenant, req.auth.usuarioId, req.params.viajeId);
  res.status(204).end();
}

module.exports = { ver, compartir, dejarDeCompartir };
