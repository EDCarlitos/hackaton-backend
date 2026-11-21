const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { REGLAS } = require('../src/shared/utils/emparejamiento');
const {
  api,
  pool,
  prepararBD,
  cerrarBD,
  crearUsuario,
  crearConductor,
  zonaDePrueba,
  publicarEnZona,
  enHoras,
  auth,
} = require('./helpers');

before(prepararBD);
after(cerrarBD);

const qs = (o) =>
  new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))).toString();

function buscar(token, { recogida, bajada, salida_en, limite }) {
  return api()
    .get(
      `/viajes/buscar?${qs({
        recogida_lat: recogida?.lat,
        recogida_lng: recogida?.lng,
        bajada_lat: bajada?.lat,
        bajada_lng: bajada?.lng,
        salida_en,
        limite,
      })}`,
    )
    .set(auth(token));
}

const ids = (res) => res.body.resultados.map((r) => r.viaje_id);

describe('GET /viajes/buscar (RF-12, RF-13, RF-14)', () => {
  it('devuelve el viaje compatible con hora, asientos, distancia a pie y costo', async () => {
    const zona = zonaDePrueba();
    const c = await crearConductor();
    const salida = enHoras(20);
    const viaje = await publicarEnZona(c, zona, { salida_en: salida, asientos_ofrecidos: 3, costo_referencia: 18 });
    const p = await crearUsuario();

    const res = await buscar(p.token, { recogida: zona.cerca, salida_en: salida });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(ids(res), [viaje.id]);
    const [r] = res.body.resultados;
    assert.equal(new Date(r.salida_en).toISOString(), salida);
    assert.equal(r.asientos_disponibles, 3);
    assert.equal(r.costo_referencia, 18);
    assert.ok(r.distancia_pie_m > 70 && r.distancia_pie_m < 100, String(r.distancia_pie_m));
    assert.equal(r.diferencia_min, 0);
    assert.ok(Math.abs(r.punto_abordaje.lng - zona.origen.lng) < 1e-5, 'aborda sobre el tramo de la ruta');
    assert.equal(r.conductor.id, c.usuario.id);
    assert.equal(r.vehiculo.placa_o_descripcion, 'Auto de prueba');
    assert.ok(r.ruta.polilinea);
    assert.equal(r.mi_reserva, null);
    assert.equal(r.distancia_bajada_m, null);
    assert.equal(res.body.criterios.max_distancia_pie_m, REGLAS.MAX_DISTANCIA_PIE_M);
  });

  it('excluye: lejos de la ruta, fuera de la ventana de hora, lleno, cancelado, ya salido y el propio', async () => {
    const zona = zonaDePrueba();
    const salida = enHoras(30);
    const conductores = await Promise.all([1, 2, 3, 4, 5, 6].map(() => crearConductor()));
    const [ok, tarde, lleno, cancelado, salido, propio] = conductores;

    const vOk = await publicarEnZona(ok, zona, { salida_en: salida });
    await publicarEnZona(tarde, zona, { salida_en: enHoras(30 + REGLAS.VENTANA_HORA_MIN / 60 + 1) });
    const vLleno = await publicarEnZona(lleno, zona, { salida_en: salida });
    await pool.query("UPDATE ucaribe.viajes SET asientos_disponibles = 0, estado = 'lleno' WHERE id = $1", [vLleno.id]);
    const vCancelado = await publicarEnZona(cancelado, zona, { salida_en: salida });
    await api().post(`/viajes/${vCancelado.id}/cancelar`).set(auth(cancelado.token)).expect(200);
    const vSalido = await publicarEnZona(salido, zona, { salida_en: salida });
    await pool.query("UPDATE ucaribe.viajes SET salida_en = now() - interval '1 minute' WHERE id = $1", [vSalido.id]);
    const vPropio = await publicarEnZona(propio, zona, { salida_en: salida });

    // El conductor "propio" busca: no ve su viaje, sí el de "ok".
    const res = await buscar(propio.token, { recogida: zona.cerca, salida_en: salida });
    assert.equal(res.status, 200);
    assert.deepEqual(ids(res), [vOk.id]);

    // Otro pasajero sí ve el de "propio"; y desde lejos no ve nada.
    const p = await crearUsuario();
    assert.deepEqual(ids(await buscar(p.token, { recogida: zona.cerca, salida_en: salida })).sort(), [vOk.id, vPropio.id].sort());
    assert.deepEqual(ids(await buscar(p.token, { recogida: zona.lejos, salida_en: salida })), []);
  });

  it('ordena por distancia a pie y, a igual distancia, por diferencia de hora', async () => {
    const zona = zonaDePrueba();
    const deseada = enHoras(40);
    const [a, b, d] = await Promise.all([crearConductor(), crearConductor(), crearConductor()]);
    // Misma ruta (misma distancia a pie), distinta hora: 5 min antes vs 12 min después (ventana ±15).
    const vCerca10 = await publicarEnZona(a, zona, { salida_en: enHoras(40 - 5 / 60) });
    const vCerca30 = await publicarEnZona(b, zona, { salida_en: enHoras(40 + 12 / 60) });
    // Ruta corrida ~300 m al este: queda más lejos aunque salga a la hora exacta.
    const corrida = {
      ...zona,
      origen: { ...zona.origen, lng: zona.origen.lng + 0.003 },
    };
    const vLejos = await publicarEnZona(d, corrida, { salida_en: deseada });

    const p = await crearUsuario();
    const res = await buscar(p.token, { recogida: zona.cerca, salida_en: deseada });

    assert.deepEqual(ids(res), [vCerca10.id, vCerca30.id, vLejos.id]);
    const [r1, r2, r3] = res.body.resultados;
    assert.equal(r1.distancia_pie_m, r2.distancia_pie_m);
    assert.ok(r3.distancia_pie_m > r1.distancia_pie_m);
    assert.equal(r1.diferencia_min, -5);
    assert.equal(r2.diferencia_min, 12);

    const limitado = await buscar(p.token, { recogida: zona.cerca, salida_en: deseada, limite: 1 });
    assert.deepEqual(ids(limitado), [vCerca10.id]);
  });

  it('con punto de bajada: exige que la ruta pase cerca y en el sentido correcto', async () => {
    const zona = zonaDePrueba();
    const salida = enHoras(50);
    const c = await crearConductor();
    const viaje = await publicarEnZona(c, zona, { salida_en: salida });
    const p = await crearUsuario();

    const bien = await buscar(p.token, { recogida: zona.cercaDelInicio, bajada: zona.cercaDelDestino, salida_en: salida });
    assert.deepEqual(ids(bien), [viaje.id]);
    assert.ok(bien.body.resultados[0].distancia_bajada_m < 100);
    assert.ok(bien.body.resultados[0].punto_bajada);

    const alReves = await buscar(p.token, { recogida: zona.cercaDelDestino, bajada: zona.cercaDelInicio, salida_en: salida });
    assert.deepEqual(ids(alReves), []);

    const bajadaLejos = await buscar(p.token, { recogida: zona.cerca, bajada: zona.lejos, salida_en: salida });
    assert.deepEqual(ids(bajadaLejos), []);
  });

  it('marca mi_reserva si ya pedí asiento en ese viaje', async () => {
    const zona = zonaDePrueba();
    const salida = enHoras(60);
    const c = await crearConductor();
    const viaje = await publicarEnZona(c, zona, { salida_en: salida });
    const p = await crearUsuario();
    const { body } = await api()
      .post('/reservas')
      .set(auth(p.token))
      .send({ viaje_id: viaje.id, recogida: zona.cerca })
      .expect(201);

    const res = await buscar(p.token, { recogida: zona.cerca, salida_en: salida });
    assert.deepEqual(res.body.resultados[0].mi_reserva, { id: body.reserva.id, estado: 'solicitada' });
  });

  it('400 con un mensaje por parámetro inválido', async () => {
    const { token } = await crearUsuario();
    const casos = [
      [{}, 'recogida'],
      [{ recogida: { lat: 'abc', lng: -86.8 } }, 'recogida'],
      [{ recogida: { lat: 95, lng: -86.8 } }, 'recogida'],
      [{ recogida: { lat: 21.1, lng: -86.8 }, bajada: { lat: 21.2 } }, 'bajada'],
      [{ recogida: { lat: 21.1, lng: -86.8 }, salida_en: '2026-11-21T07:00' }, 'salida_en'],
      [{ recogida: { lat: 21.1, lng: -86.8 }, limite: 0 }, 'limite'],
    ];
    for (const [params, campo] of casos) {
      const res = await buscar(token, params);
      assert.equal(res.status, 400, JSON.stringify(params));
      assert.ok(res.body.error.detalles[campo], JSON.stringify(res.body.error));
    }
  });

  it('401 sin token', async () => {
    const res = await api().get('/viajes/buscar?recogida_lat=21&recogida_lng=-86');
    assert.equal(res.status, 401);
  });
});
