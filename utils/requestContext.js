// ============================================================
// Contexto de la petición actual (IP y navegador) disponible en
// cualquier parte del código SIN pasarlo de función en función.
// Usa AsyncLocalStorage de Node: el middleware abre un "contexto"
// por petición y todo lo que corre dentro (incluidas las llamadas
// con await) puede leerlo. Así ActivityLog.log() registra la IP y el
// user-agent de CADA acción sin tocar cada controlador.
// ============================================================
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function clientIp(req) {
  let ip = (req && req.ip) || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv4 dentro de IPv6
  return ip.slice(0, 45) || null;                 // 45 = largo máximo de una IPv6 en texto
}

function clientMeta(req) {
  const ua = (req && typeof req.get === 'function' && req.get('user-agent')) || '';
  return { ip: clientIp(req), userAgent: ua.slice(0, 255) || null };
}

function middleware(req, res, next) {
  storage.run(clientMeta(req), next);
}

// Fuera de una petición (scripts, tareas programadas) no hay contexto.
function current() {
  return storage.getStore() || { ip: null, userAgent: null };
}

// Para registrar el identificador que alguien escribió en un login
// FALLIDO sin guardar por accidente una contraseña pegada en el campo
// de usuario: solo se conserva si parece un usuario o correo (sin
// espacios, caracteres comunes, hasta 64). Si no, se guarda como "no válido".
function sanitizeLoginIdentifier(value) {
  const v = String(value == null ? '' : value).trim();
  return /^[A-Za-z0-9._@+-]{1,64}$/.test(v) ? v.toLowerCase() : null;
}

module.exports = { middleware, current, clientIp, clientMeta, sanitizeLoginIdentifier, storage };
