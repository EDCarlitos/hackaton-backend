const { Router } = require('express');
const controller = require('./instituciones.controller');
const { requireAdminKey } = require('../../shared/middlewares/adminKey');

const router = Router();

router.post('/', requireAdminKey, controller.create);

module.exports = router;
