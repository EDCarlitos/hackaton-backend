const { Router } = require('express');
const controller = require('./viajes.controller');
const { requireAuth } = require('../../shared/middlewares/auth');

const router = Router();

router.use(requireAuth);
router.post('/', controller.publicar);
router.get('/mios', controller.misViajes); // antes de /:id
router.get('/:id', controller.detalle);
router.post('/:id/republicar', controller.republicar);
router.post('/:id/cancelar', controller.cancelar);

module.exports = router;
