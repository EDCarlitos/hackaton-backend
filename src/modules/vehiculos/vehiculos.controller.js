const service = require('./vehiculos.service');

async function crear(req, res) {
  const vehiculo = await service.crear(req.tenant, req.auth.usuarioId, req.body);
  res.status(201).json({ vehiculo });
}

async function listar(req, res) {
  const vehiculos = await service.listar(req.tenant, req.auth.usuarioId);
  res.json({ vehiculos });
}

async function desactivar(req, res) {
  const vehiculo = await service.desactivar(req.tenant, req.auth.usuarioId, req.params.id);
  res.json({ vehiculo });
}

module.exports = { crear, listar, desactivar };
