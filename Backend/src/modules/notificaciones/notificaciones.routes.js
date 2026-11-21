const { Router } = require('express');
const controller = require('./notificaciones.controller');
const { requireAuth } = require('../../shared/middlewares/auth');

const router = Router();

router.use(requireAuth);
router.get('/', controller.listar);
router.post('/:id/leida', controller.marcarLeida);

module.exports = router;
