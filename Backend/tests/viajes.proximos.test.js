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

function proximos(token, { recogida, bajada, limite } = {}) {
  return api()
    .get(
      `/viajes/proximos?${qs({
        recogida_lat: recogida?.lat,
        recogida_lng: recogida?.lng,
        bajada_lat: bajada?.lat,
        bajada_lng: bajada?.lng,
        limite,
      })}`,
    )
    .set(auth(token));
}

const ids = (res) => res.body.resultados.map((r) => r.viaje_id);

describe('GET /viajes/proximos (todos los disponibles, sin ventana de hora)', () => {
  it('sin punto: lista los viajes futuros con lugar, del más pronto al más tarde', async () => {
    const zona = zonaDePrueba();
    const c = await crearConductor();
    // Horas muy separadas: con la ventana de ±15 min de /buscar nunca saldrían juntos.
    const tarde = await publicarEnZona(c, zona, { salida_en: enHoras(0.3) });
    const despues = await publicarEnZona(c, zona, { salida_en: enHoras(9) });
    const p = await crearUsuario();

    const res = await proximos(p.token, { limite: 100 });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.criterios.con_recogida, false);
    const lista = ids(res);
    assert.ok(lista.includes(tarde.id) && lista.includes(despues.id));
    assert.ok(lista.indexOf(tarde.id) < lista.indexOf(despues.id), 'el más pronto va primero');
    const salidas = res.body.resultados.map((r) => new Date(r.salida_en).getTime());
    assert.deepEqual(salidas, [...salidas].sort((a, b) => a - b));
    const r = res.body.resultados.find((x) => x.viaje_id === tarde.id);
    assert.equal(r.distancia_pie_m, null);
    assert.equal(r.conductor.id, c.usuario.id);
  });

  it('no incluye los propios, los llenos, los que ya salieron ni los cancelados', async () => {
    const zona = zonaDePrueba();
    const c = await crearConductor();
    const vLleno = await publicarEnZona(c, zona, { salida_en: enHoras(0.5) });
    const vSalido = await publicarEnZona(c, zona, { salida_en: enHoras(1.5) });
    const vCancelado = await publicarEnZona(c, zona, { salida_en: enHoras(2.5) });
    const vBueno = await publicarEnZona(c, zona, { salida_en: enHoras(3.5) });
    await pool.query("UPDATE ucaribe.viajes SET asientos_disponibles = 0, estado = 'lleno' WHERE id = $1", [vLleno.id]);
    await pool.query("UPDATE ucaribe.viajes SET salida_en = now() - interval '1 minute' WHERE id = $1", [vSalido.id]);
    await api().post(`/viajes/${vCancelado.id}/cancelar`).set(auth(c.token)).send({}).expect(200);
    const p = await crearUsuario();

    const deOtro = ids(await proximos(p.token, { limite: 100 }));
    assert.ok(deOtro.includes(vBueno.id));
    for (const id of [vLleno.id, vSalido.id, vCancelado.id]) assert.ok(!deOtro.includes(id), `no debe salir ${id}`);

    const propios = ids(await proximos(c.token, { limite: 100 }));
    assert.ok(!propios.includes(vBueno.id), 'el conductor no ve sus propios viajes');
  });

  it(`con punto de recogida: solo los que pasan a menos de ${REGLAS.MAX_DISTANCIA_PIE_M} m, a cualquier hora`, async () => {
    const zona = zonaDePrueba();
    const c = await crearConductor();
    const temprano = await publicarEnZona(c, zona, { salida_en: enHoras(2) });
    const noche = await publicarEnZona(c, zona, { salida_en: enHoras(14) });
    const p = await crearUsuario();

    const cerca = await proximos(p.token, { recogida: zona.cerca, limite: 100 });
    assert.equal(cerca.status, 200, JSON.stringify(cerca.body));
    assert.equal(cerca.body.criterios.con_recogida, true);
    assert.ok(ids(cerca).includes(temprano.id) && ids(cerca).includes(noche.id));
    const r = cerca.body.resultados.find((x) => x.viaje_id === temprano.id);
    assert.ok(r.distancia_pie_m > 70 && r.distancia_pie_m < 100, String(r.distancia_pie_m));
    assert.ok(r.punto_abordaje);

    const lejos = await proximos(p.token, { recogida: zona.lejos, limite: 100 });
    assert.ok(!ids(lejos).includes(temprano.id) && !ids(lejos).includes(noche.id));

    // Con bajada en el sentido contrario, tampoco.
    const alReves = await proximos(p.token, { recogida: zona.cercaDelDestino, bajada: zona.cercaDelInicio, limite: 100 });
    assert.ok(!ids(alReves).includes(temprano.id));
  });

  it('respeta el límite', async () => {
    const p = await crearUsuario();
    const res = await proximos(p.token, { limite: 1 });
    assert.equal(res.status, 200);
    assert.ok(res.body.resultados.length <= 1);
  });

  it('400 con bajada sin recogida o con límite inválido; 401 sin token', async () => {
    const zona = zonaDePrueba();
    const p = await crearUsuario();
    const sinRecogida = await proximos(p.token, { bajada: zona.destino });
    assert.equal(sinRecogida.status, 400);
    assert.equal(sinRecogida.body.error.codigo, 'VALIDACION');
    assert.ok(sinRecogida.body.error.detalles.bajada);

    const malLimite = await proximos(p.token, { limite: 500 });
    assert.equal(malLimite.status, 400);
    assert.ok(malLimite.body.error.detalles.limite);

    await api().get('/viajes/proximos').expect(401);
  });
});
