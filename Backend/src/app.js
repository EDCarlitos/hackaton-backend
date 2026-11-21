const path = require('node:path');
const express = require('express');
const env = require('./config/env');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./docs/openapi');
const authRoutes = require('./modules/auth/auth.routes');
const institucionesRoutes = require('./modules/instituciones/instituciones.routes');
const vehiculosRoutes = require('./modules/vehiculos/vehiculos.routes');
const viajesRoutes = require('./modules/viajes/viajes.routes');
const trayectosRoutes = require('./modules/trayectos/trayectos.routes');
const notificacionesRoutes = require('./modules/notificaciones/notificaciones.routes');
const reservasRoutes = require('./modules/reservas/reservas.routes');
const mensajesRoutes = require('./modules/mensajes/mensajes.routes');
const ubicacionesRoutes = require('./modules/ubicaciones/ubicaciones.routes');
const impactoRoutes = require('./modules/impacto/impacto.routes');
const { errorHandler, notFound } = require('./shared/middlewares/errorHandler');
const { cors } = require('./shared/middlewares/cors');

const app = express();

app.use(cors(env.corsOrigins));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensaje: 'Hola mundo' });
});

// Página para probar registro y login a mano. Solo fuera de producción.
if (env.nodeEnv !== 'production') {
  app.get('/prueba', (req, res) => res.sendFile(path.join(__dirname, '../public/prueba.html')));
}

app.get('/docs.json', (req, res) => res.json(openapi));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

app.use('/auth', authRoutes);
app.use('/instituciones', institucionesRoutes);
app.use('/vehiculos', vehiculosRoutes);
app.use('/viajes/:viajeId/mensajes', mensajesRoutes); // antes de /viajes
app.use('/viajes/:viajeId/ubicacion', ubicacionesRoutes); // antes de /viajes
app.use('/viajes', viajesRoutes);
app.use('/trayectos', trayectosRoutes);
app.use('/notificaciones', notificacionesRoutes);
app.use('/reservas', reservasRoutes);
app.use('/impacto', impactoRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
