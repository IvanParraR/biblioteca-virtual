// ============================================================
// Claves del bloqueo por intentos fallidos: por USUARIO + IP y,
// además, un tope general por usuario.
//
// Antes se bloqueaba solo por usuario (5 fallos): cualquiera podía
// bloquear a propósito la cuenta de un admin escribiendo mal su
// nombre 5 veces. Ahora:
//   - Pareja usuario+IP: 5 fallos. Bloquea solo a quien insiste desde
//     esa conexión; el dueño de la cuenta, desde otra IP, sigue entrando.
//   - Usuario (todas las IPs): 20 fallos. Frena el ataque repartido
//     entre muchas IPs, sin que sea trivial bloquear la cuenta.
// La clave "solo usuario" conserva el formato anterior (prefijo:usuario).
// ============================================================
const crypto = require('crypto');

const PAIR_MAX_ATTEMPTS = 5;
const USER_MAX_ATTEMPTS = 20;
const MAX_IDENT_LENGTH = 60; // la columna identifier es VARCHAR(150)

function shortIdent(identifier) {
  const ident = String(identifier == null ? '' : identifier).trim().toLowerCase();
  return ident.length <= MAX_IDENT_LENGTH
    ? ident
    : crypto.createHash('sha256').update(ident).digest('hex').slice(0, 32);
}

function lockoutKeys(prefix, identifier, ip) {
  const ident = shortIdent(identifier);
  return [
    { id: `${prefix}:${ident}|${ip || 'sin-ip'}`, max: PAIR_MAX_ATTEMPTS, scope: 'pair' },
    { id: `${prefix}:${ident}`, max: USER_MAX_ATTEMPTS, scope: 'user' },
  ];
}

module.exports = { lockoutKeys, PAIR_MAX_ATTEMPTS, USER_MAX_ATTEMPTS };
