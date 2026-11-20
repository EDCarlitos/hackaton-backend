const express = require('express');
const authRoutes = require('./modules/auth/auth.routes');
const institucionesRoutes = require('./modules/instituciones/instituciones.routes');
const { errorHandler, notFound } = require('./shared/middlewares/errorHandler');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensaje: 'Hola mundo' });
});

app.use('/auth', authRoutes);
app.use('/instituciones', institucionesRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
