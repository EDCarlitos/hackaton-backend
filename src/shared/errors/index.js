// Errores personalizados de la API. Todos extienden de AppError, que extiende de Error.
// Lánzalos desde services o middlewares; errorHandler los convierte en la respuesta final:
//   { "error": { "codigo": "DOMINIO_NO_PERMITIDO", "mensaje": "...", "detalles": {...} } }

class AppError extends Error {
  /**
   * @param {string} message   Mensaje legible para el cliente.
   * @param {object} [opts]
   * @param {number} [opts.status=500]  Status HTTP.
   * @param {string} [opts.code]        Código estable para el frontend (MAYUSCULAS_CON_GUION_BAJO).
   * @param {object} [opts.details]     Información extra (ej. errores por campo).
   * @param {Error}  [opts.cause]       Error original, solo para logs.
   */
  constructor(message, { status = 500, code = 'ERROR_INTERNO', details, cause } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(message = 'Datos inválidos', opts = {}) {
    super(message, { status: 400, code: 'VALIDACION', ...opts });
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'No autenticado', opts = {}) {
    super(message, { status: 401, code: 'NO_AUTENTICADO', ...opts });
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado', opts = {}) {
    super(message, { status: 403, code: 'PROHIBIDO', ...opts });
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado', opts = {}) {
    super(message, { status: 404, code: 'NO_ENCONTRADO', ...opts });
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflicto con el estado actual', opts = {}) {
    super(message, { status: 409, code: 'CONFLICTO', ...opts });
  }
}

// Falla un servicio externo del que depende la respuesta (ej. Google Maps).
class BadGatewayError extends AppError {
  constructor(message = 'Un servicio externo no respondió', opts = {}) {
    super(message, { status: 502, code: 'SERVICIO_EXTERNO', ...opts });
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BadGatewayError,
};
