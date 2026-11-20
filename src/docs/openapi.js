// Especificación OpenAPI 3 de la API. Se sirve en /docs (UI) y /docs.json.
// Al agregar o cambiar un endpoint, actualiza aquí su contrato.

const errorResponse = (descripcion, codigos) => ({
  description: `${descripcion}. \`error.codigo\`: ${codigos.map((c) => `\`${c}\``).join(', ')}`,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

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
          'para no revelar qué correos existen. Solo con la contraseña correcta se informa si la cuenta está inactiva o sin verificar.',
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
          403: errorResponse('Cuenta desactivada o correo sin verificar', ['USUARIO_INACTIVO', 'CORREO_NO_VERIFICADO']),
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
          correo_verificado_en: { type: 'string', format: 'date-time', nullable: true },
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
