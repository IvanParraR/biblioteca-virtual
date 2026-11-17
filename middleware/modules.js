// ============================================================
// Middleware de módulos — bloquea las rutas de un módulo apagado,
// aunque alguien llegue con un enlace guardado o enviando el
// formulario directo. Ocultar el enlace en la vista no basta.
//
// En el sitio público responde 404, como si la sección no existiera.
// En el panel explica el motivo, porque quien llega ahí puede
// encender el módulo de nuevo (o pedírselo a un gestor).
// ============================================================
const Modules = require('../models/Modules');
const Settings = require('../models/Settings');

function requireModule(...keys) {
  return (req, res, next) => {
    const disabledKey = keys.find((key) => !Modules.isEnabled(key));
    if (!disabledKey) return next();

    if (req.originalUrl.startsWith('/admin')) {
      req.flash('error', `El módulo "${Modules.MODULES[disabledKey].name}" está apagado.`);
      return res.redirect('/admin/dashboard');
    }
    return res.status(404).render('errors/404', {
      pageTitle: 'Página no encontrada',
      schoolName: Settings.get().school_name,
    });
  };
}

module.exports = { requireModule };
