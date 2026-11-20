const { AppError, ValidationError, NotFoundError } = require('../errors');

function toBody(err) {
  return {
    error: {
      codigo: err.code,
      mensaje: err.message,
      ...(err.details && { detalles: err.details }),
    },
  };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    err = new ValidationError('JSON inválido', { code: 'JSON_INVALIDO' });
  }
  if (err instanceof AppError) {
    if (err.status >= 500) console.error(err);
    return res.status(err.status).json(toBody(err));
  }
  // Error no controlado: se loguea completo pero no se filtra al cliente.
  console.error(err);
  return res.status(500).json(toBody(new AppError('Error interno del servidor')));
}

function notFound(req, res, next) {
  next(new NotFoundError('Ruta no encontrada', { code: 'RUTA_NO_ENCONTRADA' }));
}

module.exports = { errorHandler, notFound };
