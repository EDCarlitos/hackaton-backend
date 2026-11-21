// RF-20: cierra solos los viajes vencidos de TODAS las instituciones, cada CIERRE_INTERVALO_SEG.
// Corre dentro del mismo proceso del API (sin cron externo). Si una institución falla, sigue con las demás.
const instituciones = require('../modules/instituciones/instituciones.service');
const viajes = require('../modules/viajes/viajes.service');
const ubicaciones = require('../modules/ubicaciones/ubicaciones.service');

async function ejecutarCierre() {
  for (const inst of await instituciones.listarActivas()) {
    try {
      const tenant = { id: inst.id, schema: inst.schema_nombre };
      const r = await viajes.cerrarVencidos(tenant);
      // Ubicación en vivo: sin historial, se borra al cerrarse o cancelarse el viaje (RNF-03).
      await ubicaciones.limpiarVencidas(tenant);
      if (r.viajes || r.expiradas) {
        console.log(
          `[cierre] ${inst.schema_nombre}: ${r.viajes} viajes cerrados, ${r.completadas} reservas completadas, ${r.expiradas} expiradas`,
        );
      }
    } catch (err) {
      console.error(`[cierre] falló en ${inst.schema_nombre}:`, err.message);
    }
  }
}

// Devuelve el timer (o null si está desactivado con intervaloSeg = 0).
function iniciarCierreAutomatico(intervaloSeg) {
  if (!intervaloSeg) return null;
  const correr = () => ejecutarCierre().catch((err) => console.error('[cierre]', err.message));
  correr();
  const timer = setInterval(correr, intervaloSeg * 1000);
  timer.unref(); // no impide que el proceso termine
  return timer;
}

module.exports = { ejecutarCierre, iniciarCierreAutomatico };
