// Especificación OpenAPI 3 de la API. Se sirve en /docs (UI) y /docs.json.
// Al agregar o cambiar un endpoint, actualiza aquí su contrato.

const errorResponse = (descripcion, codigos) => ({
  description: `${descripcion}. \`error.codigo\`: ${codigos.map((c) => `\`${c}\``).join(', ')}`,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const jsonRespuesta = (description, properties) => ({
  description,
  content: { 'application/json': { schema: { type: 'object', properties } } },
});

const noAutenticado = errorResponse('Sin token o token inválido', ['TOKEN_REQUERIDO', 'TOKEN_INVALIDO', 'USUARIO_INVALIDO']);

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'API Hackatón',
    version: '1.0.0',
    description:
      'API multi-tenant: cada institución tiene su propio schema. ' +
      'El dominio del correo decide la institución al registrarse; después, el JWT la identifica.',
  },
  tags: [
    { name: 'Auth', description: 'Registro y sesión de usuarios' },
    { name: 'Instituciones', description: 'Alta de instituciones (solo administradores de la plataforma)' },
    { name: 'Vehículos', description: 'Vehículos del conductor (cada viaje usa uno)' },
    { name: 'Viajes', description: 'Publicar, "Mis viajes", publicar de nuevo y cancelar (RF-05 a RF-08, RF-10, RF-11)' },
    { name: 'Trayectos', description: 'Plantillas "Mi trayecto" y botón "Salgo hoy" (RF-09)' },
    { name: 'Pasajeros', description: 'Buscar viajes compatibles, solicitar asiento y cancelar (RF-12 a RF-15)' },
    { name: 'Reservas', description: 'El conductor acepta o rechaza; ambas partes ven la reserva (RF-16 a RF-22)' },
    { name: 'Chat', description: 'Chat de grupo del viaje (RF-23)' },
    { name: 'Impacto', description: 'Contador de impacto ambiental con metodología visible (RF-23, RF-24)' },
    { name: 'Notificaciones', description: 'Avisos dentro de la app (cancelaciones, solicitudes, aceptaciones y rechazos)' },
  ],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Registrar un usuario',
        description:
          'El dominio del correo debe estar en `dominios_permitidos` (match exacto, activo y con la institución activa). ' +
          'El usuario se guarda en el schema de esa institución y se devuelve un JWT.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegistroInput' },
              example: {
                correo: 'ana@ucaribe.edu.mx',
                password: 'secreta123',
                nombre_visible: 'Ana López',
                acepto_terminos: true,
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Usuario creado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RegistroRespuesta' } } },
          },
          400: errorResponse('Datos inválidos (con un mensaje por campo en `detalles`) o JSON mal formado', [
            'VALIDACION',
            'JSON_INVALIDO',
          ]),
          403: errorResponse('El dominio del correo no pertenece a una institución permitida', ['DOMINIO_NO_PERMITIDO']),
          409: errorResponse('El correo ya está registrado en esa institución', ['CORREO_DUPLICADO']),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión',
        description:
          'El dominio del correo decide en qué institución se busca al usuario. ' +
          'Si falla el dominio, el correo o la contraseña, la respuesta es la misma (`CREDENCIALES_INVALIDAS`), ' +
          'para no revelar qué correos existen. Solo con la contraseña correcta se informa si la cuenta está desactivada.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginInput' },
              example: { correo: 'ana@ucaribe.edu.mx', password: 'secreta123' },
            },
          },
        },
        responses: {
          200: {
            description: 'Sesión iniciada',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RegistroRespuesta' } } },
          },
          400: errorResponse('Datos inválidos o JSON mal formado', ['VALIDACION', 'JSON_INVALIDO']),
          401: errorResponse('Correo o contraseña incorrectos', ['CREDENCIALES_INVALIDAS']),
          403: errorResponse('Cuenta desactivada', ['USUARIO_INACTIVO']),
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Perfil del usuario autenticado',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Perfil',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { usuario: { $ref: '#/components/schemas/Usuario' } },
                },
              },
            },
          },
          401: errorResponse('Sin token, token inválido, o usuario/institución inactivos', [
            'TOKEN_REQUERIDO',
            'TOKEN_INVALIDO',
            'INSTITUCION_INVALIDA',
            'USUARIO_INVALIDO',
          ]),
        },
      },
    },
    '/instituciones': {
      post: {
        tags: ['Instituciones'],
        summary: 'Dar de alta una institución',
        description:
          'En una sola transacción crea la institución, sus dominios y su schema con todas las tablas. ' +
          'Si algo falla, no se crea nada.',
        security: [{ adminKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InstitucionInput' },
              example: {
                nombre: 'Universidad del Caribe',
                schema_nombre: 'ucaribe',
                dominios: ['ucaribe.edu.mx', 'alumnos.ucaribe.edu.mx'],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Institución creada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { institucion: { $ref: '#/components/schemas/Institucion' } },
                },
              },
            },
          },
          400: errorResponse('Datos inválidos o schema reservado', ['VALIDACION', 'JSON_INVALIDO']),
          401: errorResponse('Falta `X-Admin-Key` o es incorrecta', ['ADMIN_KEY_INVALIDA']),
          409: errorResponse('El schema o algún dominio ya existen', ['SCHEMA_DUPLICADO', 'DOMINIO_DUPLICADO']),
        },
      },
    },
    // ---------- Vehículos ----------
    '/vehiculos': {
      post: {
        tags: ['Vehículos'],
        summary: 'Registrar un vehículo',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VehiculoInput' },
              example: { placa_o_descripcion: 'Nissan March gris · UXP-123-A', asientos: 4 },
            },
          },
        },
        responses: {
          201: jsonRespuesta('Vehículo creado', { vehiculo: { $ref: '#/components/schemas/Vehiculo' } }),
          400: errorResponse('Datos inválidos', ['VALIDACION', 'JSON_INVALIDO']),
          401: noAutenticado,
        },
      },
      get: {
        tags: ['Vehículos'],
        summary: 'Mis vehículos (activos primero)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: jsonRespuesta('Lista', { vehiculos: { type: 'array', items: { $ref: '#/components/schemas/Vehiculo' } } }),
          401: noAutenticado,
        },
      },
    },
    '/vehiculos/{id}': {
      delete: {
        tags: ['Vehículos'],
        summary: 'Desactivar un vehículo',
        description: 'No se borra: los viajes pasados lo siguen referenciando. Ya no se puede usar para publicar.',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        responses: {
          200: jsonRespuesta('Vehículo desactivado', { vehiculo: { $ref: '#/components/schemas/Vehiculo' } }),
          401: noAutenticado,
          404: errorResponse('No existe o no es tuyo', ['VEHICULO_NO_ENCONTRADO']),
        },
      },
    },

    // ---------- Viajes ----------
    '/viajes': {
      post: {
        tags: ['Viajes'],
        summary: 'Publicar un viaje (RF-05, RF-06, RF-07)',
        description:
          'El frontend obtiene `origen` y `destino` del mapa o del autocompletado de Places. ' +
          'El backend consulta la ruta de manejo en Google Routes API **una sola vez** y la guarda ' +
          '(polilínea codificada, distancia y duración). Antes de consultar a Google se valida el body y el vehículo. ' +
          'Si `vehiculo_id` no se manda y el conductor tiene exactamente un vehículo activo, se usa ese.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PublicarViajeInput' },
              example: {
                vehiculo_id: 1,
                origen: { lat: 21.1826, lng: -86.8678, texto: 'Villas Otoch Paraíso' },
                destino: { lat: 21.2004, lng: -86.8226, texto: 'Universidad del Caribe' },
                salida_en: '2026-11-21T07:00:00-05:00',
                asientos_ofrecidos: 3,
                costo_referencia: 20,
              },
            },
          },
        },
        responses: {
          201: jsonRespuesta('Viaje publicado', { viaje: { $ref: '#/components/schemas/Viaje' } }),
          400: errorResponse('Datos inválidos, falta elegir vehículo o no hay ruta en auto', [
            'VALIDACION',
            'VEHICULO_REQUERIDO',
            'RUTA_NO_ENCONTRADA',
            'JSON_INVALIDO',
          ]),
          401: noAutenticado,
          404: errorResponse('El vehículo no existe o no es tuyo', ['VEHICULO_NO_ENCONTRADO']),
          409: errorResponse('Vehículo desactivado, o ya tienes un viaje que se cruza con ese horario', [
            'VEHICULO_INACTIVO',
            'VIAJE_TRASLAPADO',
          ]),
          502: errorResponse('Google Maps no respondió (no se guarda nada)', ['MAPAS_NO_DISPONIBLE']),
        },
      },
    },
    '/viajes/mios': {
      get: {
        tags: ['Viajes'],
        summary: '"Mis viajes" del conductor, con estado y solicitudes entrantes (RF-10)',
        description:
          'Cada viaje trae `reservas` vigentes (`solicitada` = solicitud entrante, `confirmada`) y los contadores ' +
          '`solicitudes_pendientes` y `pasajeros_confirmados`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'estado',
            in: 'query',
            description: 'Uno o varios separados por coma',
            schema: { type: 'string', example: 'abierto,lleno' },
          },
          {
            name: 'cuando',
            in: 'query',
            description: '`proximos` (salida ≥ ahora, ascendente), `pasados` o `todos` (descendente)',
            schema: { type: 'string', enum: ['proximos', 'pasados', 'todos'], default: 'todos' },
          },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: {
          200: jsonRespuesta('Lista', { viajes: { type: 'array', items: { $ref: '#/components/schemas/ViajeDelConductor' } } }),
          400: errorResponse('Filtros inválidos', ['VALIDACION']),
          401: noAutenticado,
        },
      },
    },
    '/viajes/buscar': {
      get: {
        tags: ['Pasajeros'],
        summary: 'Buscar viajes compatibles (RF-12, RF-13, RF-14)',
        description:
          'El pasajero elige su punto de recogida en el mapa (y opcionalmente el de bajada). Se devuelven los viajes que: ' +
          'aceptan solicitudes (`abierto` y sin salir, o `en_curso` antes de `reservas_cierran_en`), tienen al menos 1 asiento (RF-19), ' +
          'no son del propio usuario, salen dentro de ±`ventana_min` de la hora deseada y cuya ruta pasa a ≤ `max_distancia_pie_m` ' +
          'de la recogida (y de la bajada, en el sentido del viaje). ' +
          'Orden: **distancia a pie a la ruta** y luego **diferencia de hora**. Las reglas vienen en `criterios` ' +
          '(se configuran en `shared/utils/emparejamiento.js`).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'recogida_lat', in: 'query', required: true, schema: { type: 'number', example: 21.1762 } },
          { name: 'recogida_lng', in: 'query', required: true, schema: { type: 'number', example: -86.8492 } },
          { name: 'bajada_lat', in: 'query', description: 'Opcional, junto con bajada_lng', schema: { type: 'number', example: 21.2 } },
          { name: 'bajada_lng', in: 'query', schema: { type: 'number', example: -86.823 } },
          {
            name: 'salida_en',
            in: 'query',
            description: 'Hora deseada, ISO 8601 con zona (codifica el `+` en la URL). Por defecto: ahora',
            schema: { type: 'string', format: 'date-time', example: '2026-11-21T07:00:00-05:00' },
          },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          200: jsonRespuesta('Resultados ordenados', {
            resultados: { type: 'array', items: { $ref: '#/components/schemas/ResultadoBusqueda' } },
            criterios: {
              type: 'object',
              properties: {
                salida_deseada: { type: 'string', format: 'date-time' },
                ventana_min: { type: 'integer', example: 15 },
                max_distancia_pie_m: { type: 'integer', example: 400 },
              },
            },
          }),
          400: errorResponse('Parámetros inválidos (un mensaje por parámetro)', ['VALIDACION']),
          401: noAutenticado,
        },
      },
    },
    '/viajes/{id}': {
      get: {
        tags: ['Viajes'],
        summary: 'Detalle de un viaje',
        description: 'Lo ve cualquier usuario de la institución. Solo el conductor recibe `reservas` (todas, con su estado).',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        responses: {
          200: jsonRespuesta('Viaje', { viaje: { $ref: '#/components/schemas/ViajeDetalle' } }),
          401: noAutenticado,
          404: errorResponse('No existe', ['VIAJE_NO_ENCONTRADO']),
        },
      },
    },
    '/viajes/{id}/republicar': {
      post: {
        tags: ['Viajes'],
        summary: 'Publicar de nuevo (RF-08)',
        description:
          'Clona origen, destino, ruta, asientos, vehículo y costo de un viaje propio (en cualquier estado). ' +
          'El conductor solo elige fecha y hora. **No** consulta Google. `vehiculo_id` es opcional, por si el original ya está desactivado.',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['salida_en'],
                properties: {
                  salida_en: { $ref: '#/components/schemas/SalidaEn' },
                  vehiculo_id: { type: 'integer' },
                },
              },
              example: { salida_en: '2026-11-23T07:00:00-05:00' },
            },
          },
        },
        responses: {
          201: jsonRespuesta('Viaje publicado', { viaje: { $ref: '#/components/schemas/Viaje' } }),
          400: errorResponse('Fecha inválida', ['VALIDACION']),
          401: noAutenticado,
          403: errorResponse('El viaje no es tuyo', ['NO_ES_CONDUCTOR']),
          404: errorResponse('No existe el viaje o el vehículo', ['VIAJE_NO_ENCONTRADO', 'VEHICULO_NO_ENCONTRADO']),
          409: errorResponse('Vehículo desactivado o cruce de horario', ['VEHICULO_INACTIVO', 'VIAJE_TRASLAPADO']),
        },
      },
    },
    '/viajes/{id}/cancelar': {
      post: {
        tags: ['Viajes'],
        summary: 'Cancelar un viaje (RF-11)',
        description:
          'Solo el conductor, y solo si está `abierto` o `lleno`. En una transacción: el viaje pasa a `cancelado`, ' +
          'sus reservas `solicitada`/`confirmada` pasan a `cancelada`, y cada pasajero afectado recibe una notificación ' +
          '`viaje_cancelado` dentro de la app (ver `GET /notificaciones`).',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { motivo: { type: 'string', maxLength: 300 } } },
              example: { motivo: 'Se me descompuso el auto' },
            },
          },
        },
        responses: {
          200: jsonRespuesta('Viaje cancelado', {
            viaje: { $ref: '#/components/schemas/Viaje' },
            reservas_canceladas: { type: 'integer', example: 2 },
            pasajeros_notificados: { type: 'integer', example: 2 },
          }),
          400: errorResponse('Motivo demasiado largo', ['VALIDACION']),
          401: noAutenticado,
          403: errorResponse('El viaje no es tuyo', ['NO_ES_CONDUCTOR']),
          404: errorResponse('No existe', ['VIAJE_NO_ENCONTRADO']),
          409: errorResponse('Ya está cancelado, en curso o finalizado', ['VIAJE_NO_CANCELABLE']),
        },
      },
    },

    // ---------- Trayectos (plantillas) ----------
    '/trayectos': {
      post: {
        tags: ['Trayectos'],
        summary: 'Guardar una plantilla "Mi trayecto" (RF-09)',
        description:
          'Dos formas: con `desde_viaje_id` copia la ruta de un viaje propio (sin consultar Google); ' +
          'con `origen`/`destino`/`asientos` consulta la ruta una vez. Después, "Salgo hoy" la reutiliza sin volver a consultar.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TrayectoInput' },
              examples: {
                desdeCoordenadas: {
                  value: {
                    nombre: 'Casa → UCaribe',
                    hora_habitual: '07:00',
                    origen: { lat: 21.1826, lng: -86.8678, texto: 'Villas Otoch Paraíso' },
                    destino: { lat: 21.2004, lng: -86.8226, texto: 'Universidad del Caribe' },
                    asientos: 3,
                  },
                },
                desdeViaje: { value: { nombre: 'Casa → UCaribe', hora_habitual: '07:00', desde_viaje_id: 2 } },
              },
            },
          },
        },
        responses: {
          201: jsonRespuesta('Plantilla creada', { trayecto: { $ref: '#/components/schemas/Trayecto' } }),
          400: errorResponse('Datos inválidos, falta vehículo o no hay ruta', [
            'VALIDACION',
            'VEHICULO_REQUERIDO',
            'RUTA_NO_ENCONTRADA',
          ]),
          401: noAutenticado,
          403: errorResponse('`desde_viaje_id` es de otro conductor', ['NO_ES_CONDUCTOR']),
          404: errorResponse('No existe el viaje o el vehículo', ['VIAJE_NO_ENCONTRADO', 'VEHICULO_NO_ENCONTRADO']),
          409: errorResponse('Vehículo desactivado', ['VEHICULO_INACTIVO']),
          502: errorResponse('Google Maps no respondió', ['MAPAS_NO_DISPONIBLE']),
        },
      },
      get: {
        tags: ['Trayectos'],
        summary: 'Mis plantillas',
        security: [{ bearerAuth: [] }],
        responses: {
          200: jsonRespuesta('Lista', { trayectos: { type: 'array', items: { $ref: '#/components/schemas/Trayecto' } } }),
          401: noAutenticado,
        },
      },
    },
    '/trayectos/{id}': {
      delete: {
        tags: ['Trayectos'],
        summary: 'Borrar una plantilla',
        description: 'Los viajes ya publicados desde ella se quedan (con `trayecto_id` en null).',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        responses: {
          204: { description: 'Borrada' },
          401: noAutenticado,
          404: errorResponse('No existe o no es tuya', ['TRAYECTO_NO_ENCONTRADO']),
        },
      },
    },
    '/trayectos/{id}/salgo-hoy': {
      get: {
        tags: ['Trayectos'],
        summary: '"Salgo hoy": resumen para confirmar (no publica)',
        description:
          'Devuelve fecha y hora (hoy, en `APP_TIMEZONE`, a la `hora` indicada o a la `hora_habitual`), ruta, asientos y vehículo, ' +
          'para mostrarlos antes de confirmar. No crea nada.',
        security: [{ bearerAuth: [] }],
        parameters: [
          idParam,
          { name: 'hora', in: 'query', description: 'HH:MM (24 h). Por defecto, la hora habitual', schema: { type: 'string', example: '07:00' } },
          { name: 'asientos_ofrecidos', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 4 } },
        ],
        responses: {
          200: jsonRespuesta('Borrador', { borrador: { $ref: '#/components/schemas/BorradorSalgoHoy' } }),
          400: errorResponse('Hora inválida, ya pasada, o sin hora habitual', ['VALIDACION', 'HORA_YA_PASO']),
          401: noAutenticado,
          404: errorResponse('No existe o no es tuya', ['TRAYECTO_NO_ENCONTRADO']),
          409: errorResponse('El vehículo de la plantilla está desactivado', ['VEHICULO_INACTIVO']),
        },
      },
      post: {
        tags: ['Trayectos'],
        summary: '"Salgo hoy": publicar el viaje de hoy',
        description: 'Publica con la ruta guardada en la plantilla (**sin** consultar Google). Mismos parámetros que el resumen, en el body.',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  hora: { type: 'string', example: '07:00' },
                  asientos_ofrecidos: { type: 'integer', minimum: 1, maximum: 4 },
                },
              },
            },
          },
        },
        responses: {
          201: jsonRespuesta('Viaje publicado', { viaje: { $ref: '#/components/schemas/Viaje' } }),
          400: errorResponse('Hora inválida, ya pasada, o sin hora habitual', ['VALIDACION', 'HORA_YA_PASO']),
          401: noAutenticado,
          404: errorResponse('No existe o no es tuya', ['TRAYECTO_NO_ENCONTRADO']),
          409: errorResponse('Vehículo desactivado o ya publicaste en ese horario', ['VEHICULO_INACTIVO', 'VIAJE_TRASLAPADO']),
        },
      },
    },

    // ---------- Reservas (pasajero) ----------
    '/reservas': {
      post: {
        tags: ['Pasajeros'],
        summary: 'Solicitar un asiento (RF-15)',
        description:
          'Una solicitud = un asiento. Queda `solicitada` hasta que el conductor responda; el asiento se descuenta al **confirmar**. ' +
          'Se aplican las mismas reglas de ruta que en la búsqueda. El conductor recibe una notificación `reserva_solicitada`.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SolicitarReservaInput' },
              example: {
                viaje_id: 2,
                recogida: { lat: 21.1762, lng: -86.8492, texto: 'Plaza Cancún 2000' },
                bajada: { lat: 21.2, lng: -86.823 },
              },
            },
          },
        },
        responses: {
          201: jsonRespuesta('Solicitud creada', { reserva: { $ref: '#/components/schemas/Reserva' } }),
          400: errorResponse('Datos inválidos, punto lejos de la ruta o sentido contrario', [
            'VALIDACION',
            'FUERA_DE_RUTA',
            'SENTIDO_CONTRARIO',
            'JSON_INVALIDO',
          ]),
          401: noAutenticado,
          404: errorResponse('El viaje no existe', ['VIAJE_NO_ENCONTRADO']),
          409: errorResponse(
            'Es tu viaje, ya no tiene asientos, ya no acepta solicitudes, ya tienes una vigente en este viaje, o tienes otra reserva que se cruza en el tiempo (RF-22)',
            ['ES_TU_VIAJE', 'VIAJE_LLENO', 'VIAJE_NO_DISPONIBLE', 'RESERVA_DUPLICADA', 'RESERVA_TRASLAPADA'],
          ),
        },
      },
    },
    '/reservas/mias': {
      get: {
        tags: ['Pasajeros'],
        summary: 'Mis reservas, con el resumen del viaje',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'cuando',
            in: 'query',
            description: '`proximas` (ascendente), `pasadas` o `todas` (descendente)',
            schema: { type: 'string', enum: ['proximas', 'pasadas', 'todas'], default: 'todas' },
          },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: {
          200: jsonRespuesta('Lista', { reservas: { type: 'array', items: { $ref: '#/components/schemas/ReservaConViaje' } } }),
          400: errorResponse('Filtros inválidos', ['VALIDACION']),
          401: noAutenticado,
        },
      },
    },
    '/reservas/{id}/cancelar': {
      post: {
        tags: ['Pasajeros'],
        summary: 'Cancelar mi solicitud o mi lugar (RF-15)',
        description:
          'Solo antes de la salida y con la reserva `solicitada` o `confirmada`. Si estaba confirmada se libera el asiento ' +
          '(y un viaje `lleno` vuelve a `abierto`). El conductor recibe una notificación `reserva_cancelada`.',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        responses: {
          200: jsonRespuesta('Reserva cancelada', { reserva: { $ref: '#/components/schemas/Reserva' } }),
          401: noAutenticado,
          404: errorResponse('No existe o no es tuya', ['RESERVA_NO_ENCONTRADA']),
          409: errorResponse('El viaje ya salió o la reserva ya no está vigente', ['RESERVA_NO_CANCELABLE']),
        },
      },
    },

    '/reservas/{id}': {
      get: {
        tags: ['Reservas'],
        summary: 'Detalle de una reserva (RF-18)',
        description:
          'Lo ven el pasajero y el conductor del viaje: estado, punto de recogida y `punto_abordaje` (el punto de la ruta ' +
          'más cercano, donde se sube). `soy` indica el papel de quien consulta. Para cualquier otro usuario es 404.',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        responses: {
          200: jsonRespuesta('Reserva', { reserva: { $ref: '#/components/schemas/ReservaDetalle' } }),
          401: noAutenticado,
          404: errorResponse('No existe o no participas', ['RESERVA_NO_ENCONTRADA']),
        },
      },
    },
    '/reservas/{id}/aceptar': {
      post: {
        tags: ['Reservas'],
        summary: 'Aceptar una solicitud (conductor, RF-16, RF-17, RF-21)',
        description:
          'En una transacción con el viaje bloqueado: la reserva pasa a `confirmada` y se descuenta un asiento. ' +
          'Si el viaje llega a 0 asientos pasa a `lleno` y **las demás solicitudes pendientes se rechazan solas** ' +
          '(con aviso). Un trigger de la BD impide más confirmadas que asientos ofrecidos aunque se salte la API.',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        responses: {
          200: jsonRespuesta('Aceptada', {
            reserva: { $ref: '#/components/schemas/Reserva' },
            viaje: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                estado: { type: 'string', enum: ['abierto', 'lleno', 'en_curso'] },
                asientos_disponibles: { type: 'integer' },
                asientos_ofrecidos: { type: 'integer' },
              },
            },
            rechazadas_automaticamente: { type: 'integer', example: 0 },
          }),
          401: noAutenticado,
          404: errorResponse('No existe o el viaje no es tuyo', ['RESERVA_NO_ENCONTRADA']),
          409: errorResponse('Ya no está pendiente, el viaje está lleno o ya no acepta reservas', [
            'RESERVA_NO_PENDIENTE',
            'VIAJE_LLENO',
            'VIAJE_NO_DISPONIBLE',
          ]),
        },
      },
    },
    '/reservas/{id}/rechazar': {
      post: {
        tags: ['Reservas'],
        summary: 'Rechazar una solicitud (conductor, RF-16)',
        description: 'La reserva pasa a `rechazada` y el pasajero recibe un aviso. No cambia los asientos.',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        responses: {
          200: jsonRespuesta('Rechazada', { reserva: { $ref: '#/components/schemas/Reserva' } }),
          401: noAutenticado,
          404: errorResponse('No existe o el viaje no es tuyo', ['RESERVA_NO_ENCONTRADA']),
          409: errorResponse('Ya no está pendiente', ['RESERVA_NO_PENDIENTE']),
        },
      },
    },
    '/viajes/{viajeId}/mensajes': {
      get: {
        tags: ['Chat'],
        summary: 'Mensajes del chat de grupo del viaje (RF-23)',
        description:
          'Lo leen el conductor y los pasajeros confirmados (o que ya completaron el viaje). ' +
          'Para refrescar sin traer todo, manda `despues_de` con el id del último mensaje (polling).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'viajeId', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'despues_de', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
        ],
        responses: {
          200: jsonRespuesta('Mensajes', {
            mensajes: { type: 'array', items: { $ref: '#/components/schemas/Mensaje' } },
            participantes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  nombre_visible: { type: 'string' },
                  papel: { type: 'string', enum: ['conductor', 'pasajero'] },
                },
              },
            },
            puede_escribir: { type: 'boolean' },
          }),
          400: errorResponse('despues_de inválido', ['VALIDACION']),
          401: noAutenticado,
          403: errorResponse('No eres conductor ni pasajero confirmado', ['NO_PARTICIPA']),
          404: errorResponse('No existe el viaje', ['VIAJE_NO_ENCONTRADO']),
        },
      },
      post: {
        tags: ['Chat'],
        summary: 'Enviar un mensaje al chat del viaje',
        description: 'Solo el conductor o un pasajero confirmado, y mientras el viaje no esté cancelado ni finalizado.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'viajeId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['texto'], properties: { texto: { type: 'string', maxLength: 500 } } },
              example: { texto: 'Estoy en la esquina de Kabah' },
            },
          },
        },
        responses: {
          201: jsonRespuesta('Enviado', { mensaje: { $ref: '#/components/schemas/Mensaje' } }),
          400: errorResponse('Texto vacío o muy largo', ['VALIDACION']),
          401: noAutenticado,
          403: errorResponse('No eres conductor ni pasajero confirmado', ['NO_PARTICIPA']),
          404: errorResponse('No existe el viaje', ['VIAJE_NO_ENCONTRADO']),
          409: errorResponse('Viaje cancelado o finalizado', ['CHAT_CERRADO']),
        },
      },
    },
    '/impacto': {
      get: {
        tags: ['Impacto'],
        summary: 'Contador de impacto ambiental (RF-23, RF-24)',
        description:
          'Totales de la institución y del usuario (como conductor o pasajero), a partir de reservas **completadas**. ' +
          '`metodologia` trae la fórmula, el factor de emisión con su fuente y los supuestos, para mostrarlos tal cual ' +
          'en pantalla etiquetados como estimación.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: jsonRespuesta('Impacto', {
            institucion: { $ref: '#/components/schemas/MetricasImpacto' },
            mio: { $ref: '#/components/schemas/MetricasImpacto' },
            metodologia: { $ref: '#/components/schemas/MetodologiaImpacto' },
          }),
          401: noAutenticado,
        },
      },
    },

    // ---------- Notificaciones ----------
    '/notificaciones': {
      get: {
        tags: ['Notificaciones'],
        summary: 'Mis avisos dentro de la app',
        description: 'Más recientes primero. `no_leidas` es el total sin leer (para el badge).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'no_leidas', in: 'query', schema: { type: 'boolean', default: false } },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 } },
        ],
        responses: {
          200: jsonRespuesta('Lista', {
            notificaciones: { type: 'array', items: { $ref: '#/components/schemas/Notificacion' } },
            no_leidas: { type: 'integer', example: 1 },
          }),
          400: errorResponse('Filtros inválidos', ['VALIDACION']),
          401: noAutenticado,
        },
      },
    },
    '/notificaciones/{id}/leida': {
      post: {
        tags: ['Notificaciones'],
        summary: 'Marcar un aviso como leído',
        security: [{ bearerAuth: [] }],
        parameters: [idParam],
        responses: {
          200: jsonRespuesta('Aviso', { notificacion: { $ref: '#/components/schemas/Notificacion' } }),
          401: noAutenticado,
          404: errorResponse('No existe o no es tuyo', ['NOTIFICACION_NO_ENCONTRADA']),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      adminKey: { type: 'apiKey', in: 'header', name: 'X-Admin-Key' },
    },
    schemas: {
      RegistroInput: {
        type: 'object',
        required: ['correo', 'password', 'nombre_visible'],
        properties: {
          correo: {
            type: 'string',
            format: 'email',
            description: 'Se normaliza con trim y minúsculas',
          },
          password: { type: 'string', format: 'password', minLength: 8, description: 'Máximo 72 bytes (límite de bcrypt)' },
          nombre_visible: { type: 'string', minLength: 1, maxLength: 100 },
          acepto_terminos: { type: 'boolean', default: false },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['correo', 'password'],
        properties: {
          correo: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
        },
      },
      RegistroRespuesta: {
        type: 'object',
        properties: {
          usuario: { $ref: '#/components/schemas/Usuario' },
          token: { type: 'string', description: 'JWT HS256. Payload: `sub`, `institucion_id`, `rol`' },
        },
      },
      Usuario: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          correo: { type: 'string', example: 'ana@ucaribe.edu.mx' },
          nombre_visible: { type: 'string', example: 'Ana López' },
          rol: { type: 'string', enum: ['usuario', 'admin'], example: 'usuario' },
          acepto_terminos_en: { type: 'string', format: 'date-time', nullable: true },
          activo: { type: 'boolean', example: true },
          creado_en: { type: 'string', format: 'date-time' },
        },
      },
      InstitucionInput: {
        type: 'object',
        required: ['nombre', 'schema_nombre'],
        properties: {
          nombre: { type: 'string', maxLength: 150 },
          schema_nombre: {
            type: 'string',
            pattern: '^[a-z_][a-z0-9_]{0,62}$',
            description: 'No puede ser `public`, `information_schema` ni empezar con `pg_`',
          },
          dominios: { type: 'array', maxItems: 20, items: { type: 'string', example: 'ucaribe.edu.mx' } },
        },
      },
      Institucion: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nombre: { type: 'string' },
          schema_nombre: { type: 'string' },
          activo: { type: 'boolean' },
          creado_en: { type: 'string', format: 'date-time' },
          dominios: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'integer' }, dominio: { type: 'string' }, activo: { type: 'boolean' } },
            },
          },
        },
      },
      Punto: {
        type: 'object',
        required: ['lat', 'lng'],
        description: 'Coordenadas del mapa o de Places. `texto` es una referencia aproximada (no el domicilio exacto).',
        properties: {
          lat: { type: 'number', minimum: -90, maximum: 90, example: 21.1826 },
          lng: { type: 'number', minimum: -180, maximum: 180, example: -86.8678 },
          texto: { type: 'string', maxLength: 200, nullable: true, example: 'Villas Otoch Paraíso' },
        },
      },
      Ruta: {
        type: 'object',
        description: 'Consultada una sola vez a Google Routes API. Dibújala con `google.maps.geometry.encoding.decodePath(polilinea)`.',
        properties: {
          polilinea: { type: 'string', description: 'Encoded polyline de Google', example: 'gfh`CvjeqOrNwt@bQk_A' },
          distancia_km: { type: 'number', nullable: true, example: 7.01 },
          duracion_min: { type: 'integer', nullable: true, example: 15 },
        },
      },
      SalidaEn: {
        type: 'string',
        format: 'date-time',
        description: 'ISO 8601 **con zona** (`Z` o `-05:00`). Desde hace 5 min hasta 30 días adelante.',
        example: '2026-11-21T07:00:00-05:00',
      },
      VehiculoInput: {
        type: 'object',
        required: ['placa_o_descripcion', 'asientos'],
        properties: {
          placa_o_descripcion: { type: 'string', maxLength: 100 },
          asientos: { type: 'integer', minimum: 1, maximum: 4, description: 'Asientos para pasajeros' },
        },
      },
      Vehiculo: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          usuario_id: { type: 'integer' },
          placa_o_descripcion: { type: 'string', example: 'Nissan March gris · UXP-123-A' },
          asientos: { type: 'integer', example: 4 },
          activo: { type: 'boolean' },
        },
      },
      PublicarViajeInput: {
        type: 'object',
        required: ['origen', 'destino', 'salida_en', 'asientos_ofrecidos'],
        properties: {
          vehiculo_id: { type: 'integer', description: 'Opcional si tienes un solo vehículo activo' },
          origen: { $ref: '#/components/schemas/Punto' },
          destino: { $ref: '#/components/schemas/Punto' },
          salida_en: { $ref: '#/components/schemas/SalidaEn' },
          asientos_ofrecidos: { type: 'integer', minimum: 1, maximum: 4, description: 'No más que los del vehículo' },
          costo_referencia: { type: 'number', minimum: 0, nullable: true, description: 'No vinculante' },
        },
      },
      Viaje: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          estado: { type: 'string', enum: ['abierto', 'lleno', 'en_curso', 'finalizado', 'cancelado'] },
          conductor_id: { type: 'integer' },
          vehiculo_id: { type: 'integer' },
          trayecto_id: { type: 'integer', nullable: true, description: 'Plantilla de la que salió ("Salgo hoy")' },
          origen: { $ref: '#/components/schemas/Punto' },
          destino: { $ref: '#/components/schemas/Punto' },
          ruta: { $ref: '#/components/schemas/Ruta' },
          salida_en: { type: 'string', format: 'date-time' },
          asientos_ofrecidos: { type: 'integer' },
          asientos_disponibles: { type: 'integer' },
          costo_referencia: { type: 'number', nullable: true },
          iniciado_en: { type: 'string', format: 'date-time', nullable: true },
          finalizado_en: { type: 'string', format: 'date-time', nullable: true },
          cancelado_en: { type: 'string', format: 'date-time', nullable: true },
          motivo_cancelacion: { type: 'string', nullable: true },
          creado_en: { type: 'string', format: 'date-time' },
        },
      },
      ReservaResumen: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          estado: { type: 'string', enum: ['solicitada', 'confirmada', 'rechazada', 'cancelada', 'completada', 'expirada'] },
          solicitada_en: { type: 'string', format: 'date-time' },
          respondida_en: { type: 'string', format: 'date-time', nullable: true },
          recogida: { $ref: '#/components/schemas/Punto' },
          punto_abordaje: {
            type: 'object',
            description: 'RF-18: punto de la ruta más cercano a la recogida (donde se sube)',
            properties: { lat: { type: 'number' }, lng: { type: 'number' } },
          },
          pasajero: {
            type: 'object',
            properties: { id: { type: 'integer' }, nombre_visible: { type: 'string', example: 'María Canul' } },
          },
        },
      },
      ViajeDelConductor: {
        allOf: [
          { $ref: '#/components/schemas/Viaje' },
          {
            type: 'object',
            properties: {
              vehiculo: {
                type: 'object',
                properties: { id: { type: 'integer' }, placa_o_descripcion: { type: 'string' } },
              },
              solicitudes_pendientes: { type: 'integer', example: 1 },
              pasajeros_confirmados: { type: 'integer', example: 1 },
              reservas: {
                type: 'array',
                description: 'Solo vigentes: `solicitada` y `confirmada`',
                items: { $ref: '#/components/schemas/ReservaResumen' },
              },
            },
          },
        ],
      },
      ViajeDetalle: {
        allOf: [
          { $ref: '#/components/schemas/Viaje' },
          {
            type: 'object',
            properties: {
              conductor: {
                type: 'object',
                properties: { id: { type: 'integer' }, nombre_visible: { type: 'string' } },
              },
              vehiculo: {
                type: 'object',
                properties: { id: { type: 'integer' }, placa_o_descripcion: { type: 'string' } },
              },
              reservas: {
                type: 'array',
                description: 'Solo si quien consulta es el conductor (todas, cualquier estado)',
                items: { $ref: '#/components/schemas/ReservaResumen' },
              },
            },
          },
        ],
      },
      TrayectoInput: {
        type: 'object',
        required: ['nombre'],
        description: 'Manda `desde_viaje_id`, o bien `origen` + `destino` + `asientos` (+ `vehiculo_id` opcional).',
        properties: {
          nombre: { type: 'string', maxLength: 80, example: 'Casa → UCaribe' },
          hora_habitual: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '07:00' },
          desde_viaje_id: { type: 'integer' },
          origen: { $ref: '#/components/schemas/Punto' },
          destino: { $ref: '#/components/schemas/Punto' },
          asientos: { type: 'integer', minimum: 1, maximum: 4 },
          vehiculo_id: { type: 'integer' },
        },
      },
      Trayecto: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nombre: { type: 'string' },
          hora_habitual: { type: 'string', nullable: true, example: '07:00' },
          origen: { $ref: '#/components/schemas/Punto' },
          destino: { $ref: '#/components/schemas/Punto' },
          ruta: { $ref: '#/components/schemas/Ruta' },
          asientos: { type: 'integer' },
          vehiculo: {
            type: 'object',
            properties: { id: { type: 'integer' }, placa_o_descripcion: { type: 'string' }, activo: { type: 'boolean' } },
          },
          creado_en: { type: 'string', format: 'date-time' },
        },
      },
      BorradorSalgoHoy: {
        type: 'object',
        properties: {
          trayecto_id: { type: 'integer' },
          nombre: { type: 'string' },
          salida_en: { type: 'string', format: 'date-time' },
          origen: { $ref: '#/components/schemas/Punto' },
          destino: { $ref: '#/components/schemas/Punto' },
          ruta: { $ref: '#/components/schemas/Ruta' },
          asientos_ofrecidos: { type: 'integer' },
          vehiculo: {
            type: 'object',
            properties: { id: { type: 'integer' }, placa_o_descripcion: { type: 'string' } },
          },
        },
      },
      ResultadoBusqueda: {
        type: 'object',
        properties: {
          viaje_id: { type: 'integer' },
          salida_en: { type: 'string', format: 'date-time' },
          asientos_disponibles: { type: 'integer', example: 3 },
          asientos_ofrecidos: { type: 'integer', example: 3 },
          costo_referencia: { type: 'number', nullable: true, example: 15 },
          distancia_pie_m: { type: 'integer', description: 'Del punto de recogida a la ruta (línea recta)', example: 86 },
          punto_abordaje: {
            type: 'object',
            description: 'Punto de la ruta más cercano a la recogida (dónde esperar al auto)',
            properties: { lat: { type: 'number' }, lng: { type: 'number' } },
          },
          distancia_bajada_m: { type: 'integer', nullable: true },
          punto_bajada: {
            type: 'object',
            nullable: true,
            properties: { lat: { type: 'number' }, lng: { type: 'number' } },
          },
          diferencia_min: { type: 'integer', description: 'Salida del viaje − hora deseada (negativo = antes)', example: 20 },
          estado: { type: 'string', enum: ['abierto', 'en_curso'] },
          origen: { $ref: '#/components/schemas/Punto' },
          destino: { $ref: '#/components/schemas/Punto' },
          ruta: { $ref: '#/components/schemas/Ruta' },
          conductor: {
            type: 'object',
            properties: { id: { type: 'integer' }, nombre_visible: { type: 'string', example: 'Carla Uc' } },
          },
          vehiculo: {
            type: 'object',
            properties: { id: { type: 'integer' }, placa_o_descripcion: { type: 'string' } },
          },
          mi_reserva: {
            type: 'object',
            nullable: true,
            description: 'Si ya tengo una solicitud vigente en este viaje',
            properties: { id: { type: 'integer' }, estado: { type: 'string', enum: ['solicitada', 'confirmada'] } },
          },
        },
      },
      SolicitarReservaInput: {
        type: 'object',
        required: ['viaje_id', 'recogida'],
        properties: {
          viaje_id: { type: 'integer' },
          recogida: { $ref: '#/components/schemas/Punto' },
          bajada: { $ref: '#/components/schemas/Punto' },
        },
      },
      Reserva: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          viaje_id: { type: 'integer' },
          estado: { type: 'string', enum: ['solicitada', 'confirmada', 'rechazada', 'cancelada', 'completada', 'expirada'] },
          recogida: { $ref: '#/components/schemas/Punto' },
          bajada: { allOf: [{ $ref: '#/components/schemas/Punto' }], nullable: true },
          distancia_pie_m: { type: 'integer', example: 86 },
          solicitada_en: { type: 'string', format: 'date-time' },
          respondida_en: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      ReservaConViaje: {
        allOf: [
          { $ref: '#/components/schemas/Reserva' },
          {
            type: 'object',
            properties: {
              punto_abordaje: {
                type: 'object',
                description: 'RF-18: punto acordado sobre la ruta',
                properties: { lat: { type: 'number' }, lng: { type: 'number' } },
              },
              viaje: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  estado: { type: 'string' },
                  salida_en: { type: 'string', format: 'date-time' },
                  costo_referencia: { type: 'number', nullable: true },
                  origen: { $ref: '#/components/schemas/Punto' },
                  destino: { $ref: '#/components/schemas/Punto' },
                  ruta: { $ref: '#/components/schemas/Ruta' },
                  conductor: {
                    type: 'object',
                    properties: { id: { type: 'integer' }, nombre_visible: { type: 'string' } },
                  },
                  vehiculo: { type: 'object', properties: { placa_o_descripcion: { type: 'string' } } },
                },
              },
            },
          },
        ],
      },
      ReservaDetalle: {
        allOf: [
          { $ref: '#/components/schemas/ReservaConViaje' },
          {
            type: 'object',
            properties: {
              pasajero: {
                type: 'object',
                properties: { id: { type: 'integer' }, nombre_visible: { type: 'string' } },
              },
              soy: { type: 'string', enum: ['pasajero', 'conductor'] },
            },
          },
        ],
      },
      Mensaje: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          texto: { type: 'string' },
          enviado_en: { type: 'string', format: 'date-time' },
          autor: { type: 'object', properties: { id: { type: 'integer' }, nombre_visible: { type: 'string' } } },
          mio: { type: 'boolean' },
        },
      },
      MetricasImpacto: {
        type: 'object',
        properties: {
          viajes_compartidos: { type: 'integer', example: 10 },
          asientos_ocupados: { type: 'integer', example: 20 },
          km_compartidos: { type: 'number', example: 124 },
          co2_evitado_kg: { type: 'number', example: 30.9 },
        },
      },
      MetodologiaImpacto: {
        type: 'object',
        properties: {
          etiqueta: { type: 'string', example: 'Estimación' },
          formula: { type: 'string', example: 'CO₂ evitado (kg) = km compartidos × factor de emisión (kg CO₂/km)' },
          definiciones: { type: 'object', additionalProperties: { type: 'string' } },
          factor_emision: {
            type: 'object',
            properties: {
              valor: { type: 'number', example: 0.249 },
              unidad: { type: 'string', example: 'kg CO₂/km' },
              calculo: { type: 'string' },
              fuente: {
                type: 'object',
                properties: { nombre: { type: 'string' }, url: { type: 'string' }, cita: { type: 'string' } },
              },
            },
          },
          supuestos: { type: 'array', items: { type: 'string' } },
        },
      },
      Notificacion: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          tipo: {
            type: 'string',
            enum: ['viaje_cancelado', 'reserva_solicitada', 'reserva_cancelada', 'reserva_confirmada', 'reserva_rechazada'],
          },
          titulo: { type: 'string', example: 'Viaje cancelado' },
          mensaje: {
            type: 'string',
            example: 'Ana López canceló el viaje del sábado, 21 de noviembre, 07:00 hacia Universidad del Caribe. Motivo: ...',
          },
          viaje_id: { type: 'integer', nullable: true },
          leida_en: { type: 'string', format: 'date-time', nullable: true },
          creada_en: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            required: ['codigo', 'mensaje'],
            properties: {
              codigo: { type: 'string', example: 'VALIDACION' },
              mensaje: { type: 'string', example: 'Datos inválidos' },
              detalles: {
                type: 'object',
                additionalProperties: { type: 'string' },
                example: { correo: 'Correo inválido' },
              },
            },
          },
        },
      },
    },
  },
};
