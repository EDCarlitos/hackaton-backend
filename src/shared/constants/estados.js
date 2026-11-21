// Deben coincidir con los enums public.estado_viaje y public.estado_reserva.
const ESTADOS_VIAJE = Object.freeze({
  ABIERTO: 'abierto',
  LLENO: 'lleno',
  EN_CURSO: 'en_curso',
  FINALIZADO: 'finalizado',
  CANCELADO: 'cancelado',
});

const ESTADOS_RESERVA = Object.freeze({
  SOLICITADA: 'solicitada',
  CONFIRMADA: 'confirmada',
  RECHAZADA: 'rechazada',
  CANCELADA: 'cancelada',
  COMPLETADA: 'completada',
  EXPIRADA: 'expirada',
});

// Columna notificaciones.tipo (varchar): el frontend decide ícono/acción según el tipo.
const TIPOS_NOTIFICACION = Object.freeze({
  VIAJE_CANCELADO: 'viaje_cancelado',
});

module.exports = { ESTADOS_VIAJE, ESTADOS_RESERVA, TIPOS_NOTIFICACION };
