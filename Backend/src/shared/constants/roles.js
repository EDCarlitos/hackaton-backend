// Roles de usuario dentro de una institución. Deben coincidir con el enum public.rol_usuario.
// El administrador de la PLATAFORMA no es un rol: se identifica con el header X-Admin-Key.
const ROLES = Object.freeze({
  USUARIO: 'usuario', // miembro de la institución
  ADMIN: 'admin', // administra su institución (solo la suya)
});

module.exports = { ROLES };
