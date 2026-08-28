// ============================================================
// Middleware de gestión de acceso — protege las rutas del panel
// de administración. Los estudiantes nunca pasan por aquí, ya
// que no necesitan cuenta (según los requisitos del proyecto).
// ============================================================

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  req.flash('error', 'Debes iniciar sesión para acceder al panel de administración.');
  return res.redirect('/admin/login');
}

// Evita que un admin ya logueado vuelva a ver el formulario de login.
function redirectIfLoggedIn(req, res, next) {
  if (req.session && req.session.admin) {
    return res.redirect('/admin/dashboard');
  }
  next();
}

// Protege las rutas de gestión de administradores: solo cuentas
// con can_manage_admins = 1 pueden crear, editar permisos o eliminar
// otras cuentas de administrador.
function requireAdminManager(req, res, next) {
  if (req.session && req.session.admin && req.session.admin.can_manage_admins) {
    return next();
  }
  req.flash('error', 'No tienes permiso para gestionar cuentas de administrador.');
  return res.redirect('/admin/dashboard');
}

module.exports = { requireAdmin, redirectIfLoggedIn, requireAdminManager };
