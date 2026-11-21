const service = require('./reservas.service');

async function solicitar(req, res) {
  const reserva = await service.solicitar(req.tenant, req.auth.usuarioId, req.body);
  res.status(201).json({ reserva });
}

async function misReservas(req, res) {
  const reservas = await service.misReservas(req.tenant, req.auth.usuarioId, req.query);
  res.json({ reservas });
}

async function cancelar(req, res) {
  const reserva = await service.cancelar(req.tenant, req.auth.usuarioId, req.params.id);
  res.json({ reserva });
}

async function aceptar(req, res) {
  const resultado = await service.aceptar(req.tenant, req.auth.usuarioId, req.params.id);
  res.json(resultado);
}

async function rechazar(req, res) {
  const reserva = await service.rechazar(req.tenant, req.auth.usuarioId, req.params.id);
  res.json({ reserva });
}

async function detalle(req, res) {
  const reserva = await service.detalle(req.tenant, req.auth.usuarioId, req.params.id);
  res.json({ reserva });
}

module.exports = { solicitar, misReservas, cancelar, aceptar, rechazar, detalle };
