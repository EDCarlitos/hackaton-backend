const service = require('./impacto.service');

async function resumen(req, res) {
  res.json(await service.resumen(req.tenant, req.auth.usuarioId));
}

module.exports = { resumen };
