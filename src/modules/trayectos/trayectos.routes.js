const { Router } = require('express');
const controller = require('./trayectos.controller');
const { requireAuth } = require('../../shared/middlewares/auth');

const router = Router();

router.use(requireAuth);
router.post('/', controller.crear);
router.get('/', controller.listar);
router.delete('/:id', controller.eliminar);
router.get('/:id/salgo-hoy', controller.borradorSalgoHoy); // resumen para confirmar
router.post('/:id/salgo-hoy', controller.salgoHoy); // publica

module.exports = router;
