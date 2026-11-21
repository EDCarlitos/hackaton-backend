// CORS mínimo, sin dependencias: solo responde a los orígenes de la lista (CORS_ORIGINS).
// La API usa Authorization: Bearer (no cookies), así que no se envía Allow-Credentials.
function cors(origenesPermitidos) {
  const permitidos = new Set(origenesPermitidos);

  return function corsMiddleware(req, res, next) {
    const origen = req.get('origin');
    if (origen && permitidos.has(origen)) {
      res.set('Access-Control-Allow-Origin', origen);
      res.set('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
        res.set('Access-Control-Max-Age', '600');
        return res.status(204).end();
      }
    }
    next();
  };
}

module.exports = { cors };
