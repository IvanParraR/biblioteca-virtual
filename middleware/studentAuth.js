// ============================================================
// Middleware de sesión de ESTUDIANTE — independiente del de admin
// (middleware/auth.js). Usa req.session.student, una llave
// separada dentro de la misma sesión de Express; un mismo
// navegador nunca mezcla ambas sesiones porque cada una vive en su
// propia ruta (/admin/... vs el resto del sitio).
// ============================================================

function requireStudent(req, res, next) {
  if (req.session && req.session.student) {
    return next();
  }
  req.flash('error', 'Debes iniciar sesión para acceder a tu cuenta.');
  return res.redirect('/iniciar-sesion');
}

function redirectIfStudentLoggedIn(req, res, next) {
  if (req.session && req.session.student) {
    return res.redirect('/mi-cuenta');
  }
  next();
}

// Obliga a definir una contraseña nueva antes de usar el resto de
// la cuenta, cuando llegó por una contraseña temporal.
//
// Importante: este middleware se monta con router.use() dentro de
// un router que a su vez se monta en app.js con app.use('/mi-cuenta', ...),
// así que dentro de aquí req.path YA viene sin el prefijo /mi-cuenta
// (Express lo recorta). Comparar contra '/mi-cuenta/contrasena'
// nunca sería igual a nada y causaría un redirect infinito — por
// eso se compara contra '/contrasena', igual que hace la versión de
// admin en middleware/auth.js contra '/account'.
function checkStudentForcedPasswordChange(req, res, next) {
  const student = req.session && req.session.student;
  if (student && student.must_change_password && !req.path.startsWith('/contrasena')) {
    req.flash('error', 'Debes definir una nueva contraseña antes de continuar (la actual es temporal).');
    return res.redirect('/mi-cuenta/contrasena');
  }
  next();
}

module.exports = { requireStudent, redirectIfStudentLoggedIn, checkStudentForcedPasswordChange };
