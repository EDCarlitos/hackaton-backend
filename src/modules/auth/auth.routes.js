const { Router } = require('express');
const controller = require('./auth.controller');
const { requireAuth } = require('../../shared/middlewares/auth');

const router = Router();

router.post('/register', controller.register);
router.get('/me', requireAuth, controller.me);

module.exports = router;
