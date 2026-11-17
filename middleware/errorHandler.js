// ============================================================
// Manejo de errores — nunca muestra al usuario el mensaje interno
// de una excepción (puede traer rutas, SQL o datos de conexión).
// Solo se muestran los mensajes que el código marcó a propósito
// como seguros (error.expose = true, ver utils/userError.js) y
// los errores conocidos de subida de archivos.
// ============================================================

const GENERIC_MESSAGE = 'Ocurrió un error inesperado. Intenta de nuevo.';

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'El archivo es demasiado grande.',
  LIMIT_UNEXPECTED_FILE: 'Se recibió un archivo que no se esperaba.',
};

function friendlyMessage(err) {
  if (err && err.expose && err.message) return err.message;
  if (err && err.name === 'MulterError') {
    return MULTER_MESSAGES[err.code] || 'No se pudo procesar el archivo subido.';
  }
  return GENERIC_MESSAGE;
}

// Vuelve a la página de donde vino la petición, pero solo si es de
// este mismo sitio (nunca redirige a un dominio externo). Para
// peticiones GET va al inicio: volver a la misma página fallida
// provocaría un bucle de redirecciones.
function backTarget(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return '/';
  const referer = req.get('referer');
  if (!referer) return '/';
  try {
    const url = new URL(referer);
    const host = (req.get('host') || '').toLowerCase();
    if (url.host.toLowerCase() !== host) return '/';
    return `${url.pathname || '/'}${url.search}`;
  } catch (err) {
    return '/';
  }
}

function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);

  const target = backTarget(req);
  // Si el destino es la misma URL que falló, redirigir crearía un bucle.
  if (target === req.originalUrl) {
    return res.status(500).type('text/plain').send(friendlyMessage(err));
  }

  if (typeof req.flash === 'function') {
    try {
      req.flash('error', friendlyMessage(err));
    } catch (flashErr) {
      // Sin sesión disponible: se redirige igual, sin mensaje.
    }
  }
  return res.redirect(target);
}

module.exports = { errorHandler, friendlyMessage, backTarget, GENERIC_MESSAGE };
