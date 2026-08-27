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

module.exports = { requireAdmin, redirectIfLoggedIn };
