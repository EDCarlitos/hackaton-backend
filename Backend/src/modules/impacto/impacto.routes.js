const { Router } = require('express');
const controller = require('./impacto.controller');
const { requireAuth } = require('../../shared/middlewares/auth');

const router = Router();

router.use(requireAuth);
router.get('/', controller.resumen);

module.exports = router;
