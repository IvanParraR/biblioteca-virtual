// ============================================================
// Límite de peticiones por IP (en memoria, sin dependencias).
//
// Complementa a LoginLockout (que bloquea por CUENTA): este corta
// por ORIGEN, así un atacante no puede probar muchas cuentas desde
// una misma IP ni bloquear a propósito la cuenta de otra persona
// sin costo.
//
// Los límites son generosos a propósito: un colegio entero suele
// salir a internet con UNA sola IP pública, y varios estudiantes
// entran a la vez.
//
// Al vivir en memoria se reinicia con cada deploy y no se comparte
// entre varias instancias; para una sola instancia en Railway basta.
// ============================================================

function createRateLimiter({ windowMs, max, message, redirectTo, now = Date.now }) {
  const hits = new Map();

  const sweep = () => {
    const t = now();
    for (const [key, entry] of hits) {
      if (entry.reset <= t) hits.delete(key);
    }
  };
  const timer = setInterval(sweep, Math.max(windowMs, 60 * 1000));
  if (typeof timer.unref === 'function') timer.unref(); // no impide que el proceso termine

  const limiter = (req, res, next) => {
    const key = req.ip || 'desconocida';
    const t = now();

    let entry = hits.get(key);
    if (!entry || entry.reset <= t) {
      entry = { count: 0, reset: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count <= max) return next();

    const seconds = Math.max(1, Math.ceil((entry.reset - t) / 1000));
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    res.set('Retry-After', String(seconds));
    const text = `${message} Intenta de nuevo en ${minutes} minuto${minutes === 1 ? '' : 's'}.`;

    const target = typeof redirectTo === 'function' ? redirectTo(req) : redirectTo;
    if (target && typeof req.flash === 'function') {
      req.flash('error', text);
      return res.redirect(303, target);
    }
    return res.status(429).type('text/plain').send(text);
  };

  limiter.reset = () => hits.clear();
  limiter.size = () => hits.size;
  return limiter;
}

const MIN = 60 * 1000;

// Un limitador por "familia" de rutas: los pasos de una misma
// recuperación de contraseña comparten contador.
const limiters = {
  adminLogin: createRateLimiter({
    windowMs: 15 * MIN, max: 20,
    message: 'Demasiados intentos de acceso desde esta conexión.',
    redirectTo: '/admin/login',
  }),
  adminRecovery: createRateLimiter({
    windowMs: 15 * MIN, max: 15,
    message: 'Demasiados intentos de recuperación desde esta conexión.',
    redirectTo: (req) => (req.path.startsWith('/forgot-password-email') ? '/admin/forgot-password-email' : '/admin/forgot-password'),
  }),
  studentLogin: createRateLimiter({
    windowMs: 15 * MIN, max: 60,
    message: 'Demasiados intentos de acceso desde esta conexión.',
    redirectTo: '/iniciar-sesion',
  }),
  studentRegister: createRateLimiter({
    windowMs: 60 * MIN, max: 30,
    message: 'Demasiados registros desde esta conexión.',
    redirectTo: '/registro',
  }),
  studentRecovery: createRateLimiter({
    windowMs: 15 * MIN, max: 15,
    message: 'Demasiados intentos de recuperación desde esta conexión.',
    redirectTo: '/recuperar-contrasena',
  }),
};

module.exports = { createRateLimiter, limiters };
