// ============================================================
// Seguridad HTTP — configuración de helmet, verificación de
// origen (anti-CSRF) y validación del SESSION_SECRET.
//
// Este archivo NO importa helmet: solo exporta la configuración
// (datos puros) para poder probarla sin dependencias. app.js es
// quien llama a helmet(helmetOptions()).
// ============================================================

const DEV_SESSION_SECRET = 'clave-de-desarrollo-cambia-en-produccion';
const PLACEHOLDER_SECRETS = new Set([DEV_SESSION_SECRET, 'cambia-esta-clave-por-una-segura']);
const MIN_SECRET_LENGTH = 16;

// Railway define RAILWAY_ENVIRONMENT(_NAME) en sus servicios; con
// eso (o NODE_ENV=production) sabemos que estamos en producción
// sin depender de que alguien se acuerde de crear una variable.
function isProduction(env = process.env) {
  return env.NODE_ENV === 'production' || !!env.RAILWAY_ENVIRONMENT || !!env.RAILWAY_ENVIRONMENT_NAME;
}

// En producción la app NO arranca con un secreto ausente, de
// ejemplo o corto: con el secreto por defecto (que es público en el
// repositorio) cualquiera podría falsificar cookies de sesión.
function resolveSessionSecret(env = process.env) {
  const secret = env.SESSION_SECRET;
  if (!isProduction(env)) return secret || DEV_SESSION_SECRET;

  if (!secret || PLACEHOLDER_SECRETS.has(secret) || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      'SESSION_SECRET no está definido (o es de ejemplo / demasiado corto) y la app corre en producción. ' +
      `Defínelo en las variables del servicio con una clave larga y aleatoria (mínimo ${MIN_SECRET_LENGTH} caracteres).`
    );
  }
  return secret;
}

// Opciones de la cookie de sesión. secure:'auto' la marca como
// "solo HTTPS" cuando la petición llegó por HTTPS (Railway termina
// el HTTPS y avisa con X-Forwarded-Proto; app.js ya tiene
// trust proxy), y sigue funcionando por http en local.
function sessionCookieOptions() {
  return {
    maxAge: 1000 * 60 * 60 * 8, // 8 horas
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto',
  };
}

// Configuración de helmet. Se usan sus cabeceras por defecto, con
// dos ajustes:
//
// 1) CSP en modo "solo reporte" (Content-Security-Policy-Report-Only):
//    el navegador NO bloquea nada, solo avisa en la consola de las
//    violaciones. Las vistas usan <script> y estilos en línea y
//    handlers onclick, y una CSP activa podría romper la interfaz.
//    Cuando se compruebe que la consola está limpia, se activa con
//    la variable CSP_ENFORCE=true (sin tocar código).
//    La lista es la que ya describe a este proyecto: scripts y
//    estilos propios + en línea, Google Fonts, imágenes https (las
//    portadas de Fuentes Abiertas vienen de URLs externas).
//
// 2) Referrer-Policy 'strict-origin-when-cross-origin' en vez del
//    'no-referrer' por defecto de helmet: con 'no-referrer' el
//    navegador omite la cabecera Origin en los POST del mismo sitio,
//    y sameOriginOnly (abajo) rechazaría todos los formularios.
function helmetOptions(env = process.env) {
  const enforce = env.CSP_ENFORCE === 'true';
  return {
    contentSecurityPolicy: {
      useDefaults: false,
      reportOnly: !enforce,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  };
}

// Los archivos subidos por usuarios se sirven con una política que
// los deja inertes: un SVG abierto directamente en el navegador no
// puede ejecutar scripts. Esta SÍ se aplica siempre (no depende de
// CSP_ENFORCE): solo afecta a /uploads, donde no hay interfaz que romper.
const UPLOADS_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

function uploadsStaticHeaders(res, filePath) {
  const normalized = String(filePath).replace(/\\/g, '/');
  if (normalized.includes('/uploads/')) {
    res.setHeader('Content-Security-Policy', UPLOADS_CSP);
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Anti-CSRF sin tokens en cada formulario: toda petición que
// modifica datos debe declarar que viene de nuestro propio sitio.
// Los navegadores siempre mandan Origin (o al menos Referer) en un
// POST, y un sitio atacante no puede falsificarlos. Se combina con
// sameSite:'lax' en la cookie.
//
//  - Métodos seguros (GET/HEAD/OPTIONS): pasan siempre.
//  - Métodos que modifican datos: DEBEN traer Origin o Referer y
//    coincidir con el host del sitio; si faltan o no coinciden, se
//    rechaza con 403 y se deja constancia en el log del servidor.
function sameOriginOnly({ allowedHosts = [], logger = console.warn } = {}) {
  const extra = allowedHosts.filter(Boolean).map((h) => h.toLowerCase());

  const reject = (req, res, reason, source) => {
    logger(`[CSRF] Rechazado ${req.method} ${req.originalUrl || req.url} — ${reason} (origen: ${source || 'ausente'}, ip: ${req.ip || 'desconocida'})`);
    return res.status(403).type('text/plain').send('Solicitud rechazada: el origen no está permitido.');
  };

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const source = req.get('origin') || req.get('referer');
    if (!source) return reject(req, res, 'sin Origin ni Referer', null);

    let sourceHost;
    try {
      sourceHost = new URL(source).host.toLowerCase();
    } catch (err) {
      return reject(req, res, 'origen no válido', source);
    }

    const forwarded = (req.get('x-forwarded-host') || '').split(',')[0].trim().toLowerCase();
    const allowed = new Set([(req.get('host') || '').toLowerCase(), forwarded, ...extra].filter(Boolean));

    if (allowed.has(sourceHost)) return next();
    return reject(req, res, 'origen distinto al del sitio', source);
  };
}

module.exports = {
  isProduction,
  resolveSessionSecret,
  sessionCookieOptions,
  helmetOptions,
  uploadsStaticHeaders,
  sameOriginOnly,
  UPLOADS_CSP,
};
