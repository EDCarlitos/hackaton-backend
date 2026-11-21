const service = require('./instituciones.service');

async function create(req, res) {
  const institucion = await service.crear(req.body);
  res.status(201).json({ institucion });
}

module.exports = { create };
