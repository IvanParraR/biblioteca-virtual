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

// Obliga a cambiar la contraseña antes de usar cualquier otra
// sección del panel, cuando un gestor le asignó una temporal.
function checkForcedPasswordChange(req, res, next) {
  const admin = req.session && req.session.admin;
  if (admin && admin.must_change_password && !req.path.startsWith('/account')) {
    req.flash('error', 'Debes definir una nueva contraseña antes de continuar (la actual es temporal).');
    return res.redirect('/admin/account');
  }
  next();
}

module.exports = { requireAdmin, redirectIfLoggedIn, requireAdminManager, checkForcedPasswordChange };
