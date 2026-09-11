// ============================================================
// EmailConfirmation — lógica de "confirmar cuenta por correo"
// compartida entre modelos (hoy Admin, más adelante Student).
//
// Asume que la tabla que lo use tiene estas 4 columnas, con estos
// nombres exactos (ver database/migrate_admin_email.sql como
// referencia de la forma exacta):
//   email                     VARCHAR NULL UNIQUE
//   email_confirmed_at        DATETIME NULL
//   confirmation_token        VARCHAR(64) NULL
//   confirmation_expires_at   DATETIME NULL
//
// Mantener esos 4 nombres iguales en cualquier tabla nueva que use
// este helper es lo que permite compartir el código en vez de
// duplicarlo — si Student usa otros nombres de columna, este
// helper no le sirve tal cual.
//
// `table` nunca debe venir de un formulario ni de datos de usuario
// — siempre es un literal fijo que escribe quien programa (ej.
// 'admins', 'students'), nunca una variable armada con lo que
// escribió alguien. Aun así, se valida contra una lista blanca de
// caracteres como capa extra, ya que se concatena en el SQL (no se
// puede parametrizar un nombre de tabla con "?").
// ============================================================
const crypto = require('crypto');
const { pool } = require('../config/db');

const TOKEN_TTL_HOURS = 24;

function assertSafeTableName(table) {
  if (!/^[a-z_]+$/.test(table)) {
    throw new Error(`Nombre de tabla no seguro para EmailConfirmation: "${table}"`);
  }
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Fragmento SQL reutilizable para listados: true cuando la cuenta
// tiene correo pero todavía no lo ha confirmado.
const PENDING_CONFIRMATION_SQL = '(email IS NOT NULL AND email_confirmed_at IS NULL)';

// Misma regla, aplicada en JS sobre una fila ya cargada (ej. la fila
// completa que devuelve el login) — evita repetir la condición en
// cada controlador.
function isPendingConfirmation(row) {
  return !!(row && row.email && !row.email_confirmed_at);
}

// Confirma la fila de `table` cuyo token coincida, no haya vencido,
// y no estuviera confirmada ya. Devuelve la fila confirmada, o null
// si el enlace ya no sirve (inválido, vencido, o reusado).
async function confirmByToken(table, token) {
  assertSafeTableName(table);
  const [rows] = await pool.query(
    `SELECT * FROM ${table} WHERE confirmation_token = ? AND email_confirmed_at IS NULL AND confirmation_expires_at > NOW()`,
    [token]
  );
  const row = rows[0];
  if (!row) return null;
  await pool.query(
    `UPDATE ${table} SET email_confirmed_at = NOW(), confirmation_token = NULL WHERE id = ?`,
    [row.id]
  );
  return row;
}

// Borra las filas de `table` que nunca se confirmaron y ya pasaron
// las 24 horas de plazo. Devuelve cuántas se borraron.
async function deleteExpiredPending(table) {
  assertSafeTableName(table);
  const [result] = await pool.query(
    `DELETE FROM ${table} WHERE email IS NOT NULL AND email_confirmed_at IS NULL AND confirmation_expires_at < NOW()`
  );
  return result.affectedRows;
}

module.exports = {
  TOKEN_TTL_HOURS,
  PENDING_CONFIRMATION_SQL,
  generateToken,
  isPendingConfirmation,
  confirmByToken,
  deleteExpiredPending,
};
