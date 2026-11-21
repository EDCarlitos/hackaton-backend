const env = require('../../config/env');
const { withTenant } = require('../../config/db');
const mapas = require('../../shared/maps');
const { NotFoundError, ValidationError } = require('../../shared/errors');
const v = require('../../shared/utils/validacion');
const { aPunto, aRuta, aHora } = require('../../shared/utils/formato');
const vehiculos = require('../vehiculos/vehiculos.service');
const viajes = require('../viajes/viajes.service');
const repo = require('./trayectos.repository');

const noEncontrado = () => new NotFoundError('Trayecto no encontrado', { code: 'TRAYECTO_NO_ENCONTRADO' });

function leerTrayectoId(valor) {
  const id = v.leerId(valor);
  if (!id) throw noEncontrado();
  return id;
}

function aTrayecto(f) {
  return {
    id: f.id,
    nombre: f.nombre,
    hora_habitual: aHora(f.hora_habitual),
    origen: aPunto(f.origen_lat, f.origen_lng, f.origen_texto),
    destino: aPunto(f.destino_lat, f.destino_lng, f.destino_texto),
    ruta: aRuta(f),
    asientos: f.asientos,
    vehiculo: { id: f.vehiculo_id, placa_o_descripcion: f.vehiculo_descripcion, activo: f.vehiculo_activo },
    creado_en: f.creado_en,
  };
}

// ---------- Crear plantilla ----------

// Dos formas:
//  - { nombre, hora_habitual?, desde_viaje_id }: copia la ruta de un viaje propio (sin consultar Google).
//  - { nombre, hora_habitual?, origen, destino, asientos, vehiculo_id? }: consulta la ruta una vez.
function validarCreacion(body = {}) {
  const errores = {};
  const nombre = v.leerTexto(body.nombre, 'nombre', errores, { max: 80, requerido: true });
  const horaHabitual = v.leerHora(body.hora_habitual, 'hora_habitual', errores) ?? null;
  const desdeViajeId = v.leerIdOpcional(body.desde_viaje_id, 'desde_viaje_id', errores);

  if (desdeViajeId !== undefined) {
    if (body.origen !== undefined || body.destino !== undefined) {
      errores.desde_viaje_id = 'Usa desde_viaje_id o bien origen/destino, no ambos';
    }
    v.lanzarSiHayErrores(errores);
    return { nombre, horaHabitual, desdeViajeId };
  }

  const { origen, destino } = v.leerOrigenDestino(body, errores);
  const asientos = v.leerAsientos(body.asientos, 'asientos', errores);
  const vehiculoId = v.leerIdOpcional(body.vehiculo_id, 'vehiculo_id', errores);
  v.lanzarSiHayErrores(errores);
  return { nombre, horaHabitual, origen, destino, asientos, vehiculoId };
}

async function guardar(db, conductorId, d) {
  await vehiculos.resolverParaPublicar(db, conductorId, d.vehiculoId, d.asientos);
  return aTrayecto(await repo.insertar(db, { conductorId, ...d }));
}

async function crear(tenant, conductorId, body) {
  const d = validarCreacion(body);

  if (d.desdeViajeId !== undefined) {
    return withTenant(tenant.schema, async (db) => {
      const base = await viajes.obtenerParaClonar(db, conductorId, d.desdeViajeId);
      return guardar(db, conductorId, { ...d, ...base, asientos: base.asientosOfrecidos });
    });
  }

  const vehiculo = await withTenant(tenant.schema, (db) =>
    vehiculos.resolverParaPublicar(db, conductorId, d.vehiculoId, d.asientos),
  );
  const ruta = await mapas.calcularRuta(d.origen, d.destino); // una vez; después se reutiliza
  return withTenant(tenant.schema, (db) => guardar(db, conductorId, { ...d, vehiculoId: vehiculo.id, ruta }));
}

function listar(tenant, conductorId) {
  return withTenant(tenant.schema, async (db) => (await repo.listarDelConductor(db, conductorId)).map(aTrayecto));
}

// Los viajes ya publicados desde la plantilla se quedan (trayecto_id pasa a NULL).
async function eliminar(tenant, conductorId, idParam) {
  const id = leerTrayectoId(idParam);
  const ok = await withTenant(tenant.schema, (db) => repo.eliminar(db, conductorId, id));
  if (!ok) throw noEncontrado();
}

// ---------- "Salgo hoy" ----------

function leerOpcionesSalgoHoy(fuente = {}) {
  const errores = {};
  const hora = v.leerHora(fuente.hora, 'hora', errores);
  const asientos = v.leerAsientos(fuente.asientos_ofrecidos, 'asientos_ofrecidos', errores, { requerido: false });
  v.lanzarSiHayErrores(errores);
  return { hora, asientos };
}

// Arma el viaje de hoy a partir de la plantilla, sin guardarlo.
async function armarBorrador(db, conductorId, id, { hora, asientos }) {
  const t = await repo.findDelConductor(db, conductorId, id);
  if (!t) throw noEncontrado();

  const horaSalida = hora ?? aHora(t.hora_habitual);
  if (!horaSalida) {
    throw new ValidationError('Datos inválidos', {
      details: { hora: 'Este trayecto no tiene hora habitual: indica la hora de salida' },
    });
  }
  const salidaEn = await repo.salidaHoy(db, horaSalida, env.zonaHoraria);
  if (v.errorVentanaSalida(salidaEn)) {
    throw new ValidationError('Datos inválidos', {
      code: 'HORA_YA_PASO',
      details: { hora: `Las ${horaSalida} de hoy ya pasaron: elige otra hora` },
    });
  }

  const asientosOfrecidos = asientos ?? t.asientos;
  const vehiculo = await vehiculos.resolverParaPublicar(db, conductorId, t.vehiculo_id, asientosOfrecidos);
  return { t, salidaEn, asientosOfrecidos, vehiculo };
}

// Resumen para confirmar antes de publicar (fecha, hora, ruta, asientos). No crea nada.
async function borradorSalgoHoy(tenant, conductorId, idParam, query = {}) {
  const id = leerTrayectoId(idParam);
  // En la query string todo llega como texto: "2" → 2 (el body del POST sí exige número).
  const { asientos_ofrecidos: a } = query;
  const opciones = leerOpcionesSalgoHoy({
    hora: query.hora,
    asientos_ofrecidos: typeof a === 'string' && /^\d$/.test(a) ? Number(a) : a,
  });
  return withTenant(tenant.schema, async (db) => {
    const { t, salidaEn, asientosOfrecidos, vehiculo } = await armarBorrador(db, conductorId, id, opciones);
    return {
      trayecto_id: t.id,
      nombre: t.nombre,
      salida_en: salidaEn,
      origen: aPunto(t.origen_lat, t.origen_lng, t.origen_texto),
      destino: aPunto(t.destino_lat, t.destino_lng, t.destino_texto),
      ruta: aRuta(t),
      asientos_ofrecidos: asientosOfrecidos,
      vehiculo: { id: vehiculo.id, placa_o_descripcion: vehiculo.placa_o_descripcion },
    };
  });
}

// Publica el viaje de hoy con la ruta guardada en la plantilla (no consulta Google).
async function salgoHoy(tenant, conductorId, idParam, body) {
  const id = leerTrayectoId(idParam);
  const opciones = leerOpcionesSalgoHoy(body);
  return withTenant(tenant.schema, async (db) => {
    const { t, salidaEn, asientosOfrecidos } = await armarBorrador(db, conductorId, id, opciones);
    return viajes.guardarEnTransaccion(db, conductorId, {
      vehiculoId: t.vehiculo_id,
      trayectoId: t.id,
      origen: { lat: Number(t.origen_lat), lng: Number(t.origen_lng), texto: t.origen_texto },
      destino: { lat: Number(t.destino_lat), lng: Number(t.destino_lng), texto: t.destino_texto },
      ruta: { polilinea: t.polilinea, distanciaKm: t.distancia_km, duracionMin: t.duracion_min },
      salidaEn,
      asientosOfrecidos,
      costoReferencia: null,
    });
  });
}

module.exports = { crear, listar, eliminar, borradorSalgoHoy, salgoHoy };
