const { Router } = require('express');
const controller = require('./reservas.controller');
const { requireAuth } = require('../../shared/middlewares/auth');

const router = Router();

router.use(requireAuth);
router.post('/', controller.solicitar);
router.get('/mias', controller.misReservas);
router.get('/:id', controller.detalle);
router.post('/:id/cancelar', controller.cancelar); // pasajero
router.post('/:id/aceptar', controller.aceptar); // conductor
router.post('/:id/rechazar', controller.rechazar); // conductor

module.exports = router;
