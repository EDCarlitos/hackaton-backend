const { Router } = require('express');
const controller = require('./mensajes.controller');
const { requireAuth } = require('../../shared/middlewares/auth');

// Se monta en /viajes/:viajeId/mensajes (mergeParams para leer :viajeId).
const router = Router({ mergeParams: true });

router.use(requireAuth);
router.get('/', controller.listar);
router.post('/', controller.enviar);

module.exports = router;
