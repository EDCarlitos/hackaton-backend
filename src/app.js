const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./docs/openapi');
const authRoutes = require('./modules/auth/auth.routes');
const institucionesRoutes = require('./modules/instituciones/instituciones.routes');
const { errorHandler, notFound } = require('./shared/middlewares/errorHandler');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensaje: 'Hola mundo' });
});

app.get('/docs.json', (req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

app.use('/auth', authRoutes);
app.use('/instituciones', institucionesRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
