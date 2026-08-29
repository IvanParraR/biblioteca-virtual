// ============================================================
// Modelo LoginLockout — protección contra fuerza bruta.
// Cuenta intentos fallidos por identificador (ej. "login:admin"
// o "secquestion:admin") y bloquea temporalmente tras superar el
// máximo permitido. Un identificador distinto para login y para
// la pregunta de seguridad evita que agotar los intentos en un
// flujo bloquee también el otro.
// ============================================================
const { pool } = require('../config/db');

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

const LoginLockout = {
  MAX_ATTEMPTS,
  LOCK_DURATION_MINUTES,

  // Revisa si el identificador está bloqueado en este momento. Si el
  // bloqueo anterior ya venció, lo limpia automáticamente (nueva
  // racha de intentos parte de cero).
  async check(identifier) {
    const [rows] = await pool.query('SELECT * FROM login_lockouts WHERE identifier = ?', [identifier]);
    const row = rows[0];
    if (!row || !row.locked_until) return { locked: false };

    const lockedUntil = new Date(row.locked_until);
    if (lockedUntil > new Date()) {
      const minutesLeft = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60000));
      return { locked: true, minutesLeft };
    }

    // El bloqueo ya venció: reinicia el contador para ese identificador.
    await pool.query(
      'UPDATE login_lockouts SET failed_count = 0, locked_until = NULL WHERE identifier = ?',
      [identifier]
    );
    return { locked: false };
  },

  // Registra un intento fallido. Si alcanza el máximo, activa el
  // bloqueo por LOCK_DURATION_MINUTES a partir de ahora.
  async recordFailure(identifier) {
    await pool.query(
      `INSERT INTO login_lockouts (identifier, failed_count, last_attempt_at)
       VALUES (?, 1, NOW())
       ON DUPLICATE KEY UPDATE
         failed_count = failed_count + 1,
         last_attempt_at = NOW(),
         locked_until = IF(failed_count >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), locked_until)`,
      [identifier, MAX_ATTEMPTS, LOCK_DURATION_MINUTES]
    );

    const [rows] = await pool.query('SELECT failed_count, locked_until FROM login_lockouts WHERE identifier = ?', [identifier]);
    const row = rows[0] || { failed_count: 1, locked_until: null };
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - row.failed_count);
    return { failedCount: row.failed_count, attemptsLeft, lockedNow: !!row.locked_until };
  },

  // Un intento exitoso limpia por completo el historial de fallos.
  async recordSuccess(identifier) {
    await pool.query('DELETE FROM login_lockouts WHERE identifier = ?', [identifier]);
  },
};

module.exports = LoginLockout;
