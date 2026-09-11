// ============================================================
// Política de contraseñas — aplica a TODA contraseña nueva que se
// defina desde ahora (crear cuenta, cambiarla, resetearla, y las
// temporales generadas por el sistema). Las cuentas ya guardadas
// con contraseñas de antes de esta regla NO se tocan — solo se
// exige la regla en el momento de definir una contraseña nueva.
//
// Regla: mínimo 8 caracteres, al menos 1 mayúscula, 1 número y 1
// carácter especial.
// ============================================================
const crypto = require('crypto');

const MIN_LENGTH = 8;

function passwordHint() {
  return `Mínimo ${MIN_LENGTH} caracteres, con al menos una mayúscula, un número y un carácter especial (ej. !@#$%&*).`;
}

function isPasswordValid(password) {
  if (!password || password.length < MIN_LENGTH) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

// Genera una contraseña temporal que YA cumple la política de
// arriba (para "asignar temporal" y el reseteo por correo) — nunca
// deja la garantía de mayúscula/número/especial al azar.
function generateSecurePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I/O, se confunden con 1/0
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*?';
  const all = upper + lower + digits + special;
  const pick = (set) => set[crypto.randomInt(set.length)];

  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = 0; i < 6; i++) chars.push(pick(all));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { MIN_LENGTH, passwordHint, isPasswordValid, generateSecurePassword };
