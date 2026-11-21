// RF-23 / RF-24: contador de impacto ambiental. Es una ESTIMACIÓN y la metodología viaja
// junto con los números para que el frontend la muestre tal cual (fórmula, factor, fuente, supuestos).
const { withTenant } = require('../../config/db');
const repo = require('./impacto.repository');

const KM_POR_MILLA = 1.609344;
const G_CO2_POR_MILLA = 400; // EPA: "The average passenger vehicle emits about 400 grams of CO2 per mile."
const FACTOR_KG_CO2_KM = Math.round((G_CO2_POR_MILLA / KM_POR_MILLA / 1000) * 1000) / 1000; // 0.249

const METODOLOGIA = Object.freeze({
  etiqueta: 'Estimación',
  formula: 'CO₂ evitado (kg) = km compartidos × factor de emisión (kg CO₂/km)',
  definiciones: {
    viajes_compartidos: 'Viajes cerrados con al menos un pasajero que completó el viaje.',
    asientos_ocupados: 'Reservas completadas (un asiento cada una).',
    km_compartidos: 'Suma, por cada asiento ocupado, de la distancia de la ruta del conductor (km).',
  },
  factor_emision: {
    valor: FACTOR_KG_CO2_KM,
    unidad: 'kg CO₂/km',
    calculo: `${G_CO2_POR_MILLA} g CO₂/milla ÷ ${KM_POR_MILLA} km/milla ≈ ${FACTOR_KG_CO2_KM} kg CO₂/km`,
    fuente: {
      nombre: 'US EPA — Greenhouse Gas Emissions from a Typical Passenger Vehicle (actualizada el 3 de junio de 2026)',
      url: 'https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle',
      cita: 'The average passenger vehicle emits about 400 grams of CO2 per mile.',
    },
  },
  supuestos: [
    'Cada asiento ocupado evita que esa persona hiciera el mismo trayecto en otro vehículo (supuesto declarado en los requisitos, sección 8.3).',
    'El pasajero recorre la ruta completa del conductor; si baja antes, el valor real es menor.',
    'El factor es el promedio de un auto de gasolina en EE. UU. (≈ 22.2 mi/gal, 8,887 g CO₂ por galón); no es específico de México ni de cada vehículo.',
    'Solo cuentan reservas completadas: viajes que se cerraron con el pasajero confirmado. La app no verifica que el viaje ocurrió.',
    'No se descuenta el consumo extra del conductor por llevar pasajeros (por diseño no hace desvíos).',
  ],
});

const redondear1 = (n) => Math.round(n * 10) / 10;

function aMetricas(t) {
  return {
    viajes_compartidos: t.viajes_compartidos,
    asientos_ocupados: t.asientos_ocupados,
    km_compartidos: redondear1(t.km_compartidos),
    co2_evitado_kg: redondear1(t.km_compartidos * FACTOR_KG_CO2_KM),
  };
}

async function resumen(tenant, usuarioId) {
  const [institucion, mio] = await withTenant(tenant.schema, (db) =>
    Promise.all([repo.totales(db, null), repo.totales(db, usuarioId)]),
  );
  return { institucion: aMetricas(institucion), mio: aMetricas(mio), metodologia: METODOLOGIA };
}

module.exports = { resumen, FACTOR_KG_CO2_KM, METODOLOGIA };
