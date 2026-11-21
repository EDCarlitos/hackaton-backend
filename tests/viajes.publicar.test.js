const { describe, it, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mapas = require('../src/shared/maps');
const { BadGatewayError, ValidationError } = require('../src/shared/errors');
const { decodificarPolilinea } = require('../src/shared/utils/geo');
const {
  api,
  pool,
  prepararBD,
  cerrarBD,
  crearUsuario,
  crearConductor,
  publicarViaje,
  enHoras,
  auth,
  ORIGEN,
  DESTINO,
} = require('./helpers');

before(prepararBD);
after(cerrarBD);
afterEach(() => mock.restoreAll());

const espiarMapas = () => mock.method(mapas, 'calcularRuta');

async function viajesDe(conductorId) {
  const { rows } = await pool.query('SELECT * FROM ucaribe.viajes WHERE conductor_id = $1 ORDER BY id', [conductorId]);
  return rows;
}

describe('POST /viajes (publicar)', () => {
  it('201: consulta la ruta UNA vez y la guarda con distancia y duración', async () => {
    const c = await crearConductor();
    const espia = espiarMapas();
    const salida = enHoras(20);

    const res = await publicarViaje(c.token, {
      vehiculo_id: c.vehiculo.id,
      salida_en: salida,
      asientos_ofrecidos: 3,
      costo_referencia: 25.5,
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { viaje } = res.body;
    assert.equal(espia.mock.callCount(), 1);
    assert.equal(viaje.estado, 'abierto');
    assert.equal(viaje.asientos_ofrecidos, 3);
    assert.equal(viaje.asientos_disponibles, 3);
    assert.equal(viaje.costo_referencia, 25.5);
    assert.equal(new Date(viaje.salida_en).toISOString(), salida);
    assert.deepEqual(viaje.origen, ORIGEN);
    assert.deepEqual(viaje.destino, DESTINO);
    assert.equal(typeof viaje.ruta.distancia_km, 'number');
    assert.ok(viaje.ruta.duracion_min > 0);
    const puntos = decodificarPolilinea(viaje.ruta.polilinea);
    assert.deepEqual(puntos[0], { lat: ORIGEN.lat, lng: ORIGEN.lng });
    assert.deepEqual(puntos.at(-1), { lat: DESTINO.lat, lng: DESTINO.lng });

    // Efecto real en la BD del tenant.
    const [fila] = await viajesDe(c.usuario.id);
    assert.equal(fila.id, viaje.id);
    assert.equal(fila.polilinea, viaje.ruta.polilinea);
    assert.equal(Number(fila.distancia_km), viaje.ruta.distancia_km);
    assert.equal(fila.vehiculo_id, c.vehiculo.id);
  });

  it('si el conductor tiene UN solo vehículo activo, vehiculo_id es opcional', async () => {
    const c = await crearConductor();
    const res = await publicarViaje(c.token);
    assert.equal(res.status, 201);
    assert.equal(res.body.viaje.vehiculo_id, c.vehiculo.id);
  });

  it('sin vehículos, o con varios sin elegir: 400 VEHICULO_REQUERIDO y no consulta Google', async () => {
    const espia = espiarMapas();
    const sinAuto = await crearUsuario();
    const r1 = await publicarViaje(sinAuto.token);
    assert.equal(r1.status, 400);
    assert.equal(r1.body.error.codigo, 'VEHICULO_REQUERIDO');

    const c = await crearConductor();
    await api().post('/vehiculos').set(auth(c.token)).send({ placa_o_descripcion: 'Otro', asientos: 2 }).expect(201);
    const r2 = await publicarViaje(c.token);
    assert.equal(r2.status, 400);
    assert.equal(r2.body.error.codigo, 'VEHICULO_REQUERIDO');

    assert.equal(espia.mock.callCount(), 0);
    assert.equal((await viajesDe(c.usuario.id)).length, 0);
  });

  it('vehículo de otro → 404; desactivado → 409; más asientos que el vehículo → 400', async () => {
    const espia = espiarMapas();
    const c = await crearConductor({ asientos: 2 });
    const otro = await crearConductor();

    const ajeno = await publicarViaje(c.token, { vehiculo_id: otro.vehiculo.id });
    assert.equal(ajeno.status, 404);
    assert.equal(ajeno.body.error.codigo, 'VEHICULO_NO_ENCONTRADO');

    const muchos = await publicarViaje(c.token, { vehiculo_id: c.vehiculo.id, asientos_ofrecidos: 3 });
    assert.equal(muchos.status, 400);
    assert.match(muchos.body.error.detalles.asientos_ofrecidos, /2 asientos/);

    await api().delete(`/vehiculos/${c.vehiculo.id}`).set(auth(c.token)).expect(200);
    const inactivo = await publicarViaje(c.token, { vehiculo_id: c.vehiculo.id, asientos_ofrecidos: 2 });
    assert.equal(inactivo.status, 409);
    assert.equal(inactivo.body.error.codigo, 'VEHICULO_INACTIVO');

    assert.equal(espia.mock.callCount(), 0);
    assert.equal((await viajesDe(c.usuario.id)).length, 0);
  });

  it('400 con un mensaje por campo inválido, sin consultar Google ni crear nada', async () => {
    const c = await crearConductor();
    const espia = espiarMapas();
    const casos = [
      [{ asientos_ofrecidos: 0 }, 'asientos_ofrecidos'],
      [{ asientos_ofrecidos: 5 }, 'asientos_ofrecidos'],
      [{ asientos_ofrecidos: '3' }, 'asientos_ofrecidos'],
      [{ salida_en: '2026-11-21T07:30' }, 'salida_en'], // sin zona horaria
      [{ salida_en: 'mañana' }, 'salida_en'],
      [{ salida_en: enHoras(-1) }, 'salida_en'], // en el pasado
      [{ salida_en: enHoras(24 * 31) }, 'salida_en'], // más de 30 días
      [{ origen: { lat: 100, lng: -86.8 } }, 'origen'],
      [{ origen: undefined }, 'origen'],
      [{ destino: { lat: '21.2', lng: -86.8 } }, 'destino'],
      [{ destino: { ...ORIGEN, texto: 'Mismo lugar' } }, 'destino'],
      [{ destino: { ...DESTINO, texto: 'x'.repeat(201) } }, 'destino'],
      [{ costo_referencia: -5 }, 'costo_referencia'],
      [{ vehiculo_id: 'abc' }, 'vehiculo_id'],
    ];
    for (const [extra, campo] of casos) {
      const res = await publicarViaje(c.token, extra);
      assert.equal(res.status, 400, JSON.stringify(extra));
      assert.equal(res.body.error.codigo, 'VALIDACION');
      assert.ok(res.body.error.detalles[campo], `${JSON.stringify(extra)} → ${JSON.stringify(res.body.error)}`);
    }
    assert.equal(espia.mock.callCount(), 0);
    assert.equal((await viajesDe(c.usuario.id)).length, 0);
  });

  it('409 VIAJE_TRASLAPADO si ya tiene un viaje activo en ese horario (ej. doble clic)', async () => {
    const c = await crearConductor();
    const salida = enHoras(30);
    await publicarViaje(c.token, { salida_en: salida }).expect(201);

    const repetido = await publicarViaje(c.token, { salida_en: salida });
    assert.equal(repetido.status, 409);
    assert.equal(repetido.body.error.codigo, 'VIAJE_TRASLAPADO');

    // Más tarde, ya sin cruce, sí se puede.
    await publicarViaje(c.token, { salida_en: enHoras(33) }).expect(201);
    assert.equal((await viajesDe(c.usuario.id)).length, 2);
  });

  it('si Google falla: 502 MAPAS_NO_DISPONIBLE y no se guarda nada', async () => {
    const c = await crearConductor();
    mock.method(mapas, 'calcularRuta', async () => {
      throw new BadGatewayError('No se pudo calcular la ruta', { code: 'MAPAS_NO_DISPONIBLE' });
    });
    const res = await publicarViaje(c.token);
    assert.equal(res.status, 502);
    assert.equal(res.body.error.codigo, 'MAPAS_NO_DISPONIBLE');
    assert.equal((await viajesDe(c.usuario.id)).length, 0);
  });

  it('si no hay ruta en auto: 400 RUTA_NO_ENCONTRADA', async () => {
    const c = await crearConductor();
    mock.method(mapas, 'calcularRuta', async () => {
      throw new ValidationError('Sin ruta', { code: 'RUTA_NO_ENCONTRADA' });
    });
    const res = await publicarViaje(c.token);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.codigo, 'RUTA_NO_ENCONTRADA');
  });

  it('401 sin token', async () => {
    const res = await api().post('/viajes').send({});
    assert.equal(res.status, 401);
  });
});
