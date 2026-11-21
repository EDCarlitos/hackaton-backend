const { Router } = require('express');
const controller = require('./ubicaciones.controller');
const { requireAuth } = require('../../shared/middlewares/auth');

// Se monta en /viajes/:viajeId/ubicacion (mergeParams para leer :viajeId).
const router = Router({ mergeParams: true });

router.use(requireAuth);
router.get('/', controller.ver);
router.put('/', controller.compartir);
router.delete('/', controller.dejarDeCompartir);

module.exports = router;
