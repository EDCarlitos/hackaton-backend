const { pool, withTransaction, SCHEMA_RE } = require('../../config/db');
const { createTenantSchema } = require('../../db/migrate');
const { ValidationError, ConflictError } = require('../../shared/errors');
const repo = require('./instituciones.repository');

const DOMINIO_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const SCHEMAS_RESERVADOS = new Set(['public', 'information_schema']);
const MAX_DOMINIOS = 20;

function validarCreacion({ nombre, schema_nombre, dominios } = {}) {
  const errores = {};
  const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
  const schema = typeof schema_nombre === 'string' ? schema_nombre.trim() : '';

  if (!nombreLimpio || nombreLimpio.length > 150) errores.nombre = 'Requerido, máximo 150 caracteres';

  if (!SCHEMA_RE.test(schema)) {
    errores.schema_nombre = 'Solo minúsculas, números y guion bajo; debe empezar con letra o guion bajo; máximo 63';
  } else if (SCHEMAS_RESERVADOS.has(schema) || schema.startsWith('pg_')) {
    errores.schema_nombre = 'Nombre de schema reservado';
  }

  let dominiosLimpios = [];
  if (dominios !== undefined) {
    if (!Array.isArray(dominios) || dominios.length > MAX_DOMINIOS) {
      errores.dominios = `Debe ser un arreglo de máximo ${MAX_DOMINIOS} dominios`;
    } else {
      dominiosLimpios = [...new Set(dominios.map((d) => (typeof d === 'string' ? d.trim().toLowerCase() : '')))];
      const invalidos = dominiosLimpios.filter((d) => !DOMINIO_RE.test(d));
      if (invalidos.length) errores.dominios = `Dominios inválidos: ${invalidos.join(', ') || '(vacío)'}`;
    }
  }

  if (Object.keys(errores).length) throw new ValidationError('Datos inválidos', { details: errores });
  return { nombre: nombreLimpio, schemaNombre: schema, dominios: dominiosLimpios };
}

// Crea institución + dominios + schema con sus tablas, todo en UNA transacción.
// Si cualquier paso falla, no queda nada a medias.
async function crear(body) {
  const datos = validarCreacion(body);
  try {
    return await withTransaction(async (db) => {
      const institucion = await repo.insertInstitucion(db, datos);
      const dominios = await repo.insertDominios(db, institucion.id, datos.dominios);
      await createTenantSchema(db, institucion.schema_nombre);
      return { ...institucion, dominios };
    });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'instituciones_schema_nombre_key') {
      throw new ConflictError('Ya existe una institución con ese schema_nombre', { code: 'SCHEMA_DUPLICADO', cause: err });
    }
    if (err.code === '23505' && err.constraint === 'dominios_permitidos_dominio_key') {
      throw new ConflictError('Uno de los dominios ya pertenece a otra institución', { code: 'DOMINIO_DUPLICADO', cause: err });
    }
    if (err.code === '42P06') {
      throw new ConflictError('Ya existe un schema con ese nombre en la base de datos', { code: 'SCHEMA_DUPLICADO', cause: err });
    }
    throw err;
  }
}

function findActivaPorDominio(dominio) {
  return repo.findActivaPorDominio(pool, dominio);
}

function findActivaPorId(id) {
  return repo.findActivaPorId(pool, id);
}

function listarActivas() {
  return repo.listarActivas(pool);
}

module.exports = { crear, findActivaPorDominio, findActivaPorId, listarActivas };
