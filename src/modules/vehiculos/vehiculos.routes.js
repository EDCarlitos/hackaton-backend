const { Router } = require('express');
const controller = require('./vehiculos.controller');
const { requireAuth } = require('../../shared/middlewares/auth');

const router = Router();

router.use(requireAuth);
router.post('/', controller.crear);
router.get('/', controller.listar);
router.delete('/:id', controller.desactivar);

module.exports = router;
