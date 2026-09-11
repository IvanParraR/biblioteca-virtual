// ============================================================
// Modelo Admin — gestión de cuentas de administrador.
// Solo las cuentas con can_manage_admins = 1 pueden usar las
// operaciones de creación/edición de permisos/eliminación
// (ver middleware/auth.js -> requireAdminManager).
//
// Correo y confirmación de cuenta:
//   - Toda cuenta NUEVA requiere un correo (de un dominio permitido,
//     ver models/EmailDomain.js) y debe confirmarse dando clic en
//     un enlace enviado a ese correo, antes de poder iniciar sesión.
//   - El enlace vence 24 horas después de crear la cuenta — pasado
//     ese plazo sin confirmar, la cuenta se elimina sola (ver
//     deleteExpiredPending(), que se corre periódicamente en app.js).
//   - Las cuentas creadas ANTES de este sistema (email = NULL)
//     siguen entrando sin restricción — el bloqueo por "no
//     confirmada" solo aplica si la cuenta SÍ tiene correo.
//   - Se puede iniciar sesión con el nombre de usuario o con el
//     correo (ver findByUsernameOrEmail).
//
// Recuperación de contraseña en tres niveles:
//   1. Autoservicio por correo: se envía una contraseña temporal
//      al correo de la cuenta.
//   2. Autoservicio por pregunta de seguridad: el propio admin
//      responde su pregunta y define una contraseña nueva.
//   3. Asistido: un admin con permiso de gestión le asigna una
//      contraseña temporal a mano; la cuenta queda marcada con
//      must_change_password = 1 y debe cambiarla al entrar.
// ============================================================
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const EmailConfirmation = require('./EmailConfirmation');
const { generateSecurePassword } = require('../utils/passwordPolicy');

// Normaliza la respuesta de seguridad antes de hashear/comparar,
// para que mayúsculas o espacios de más no bloqueen al admin.
function normalizeAnswer(answer) {
  return (answer || '').trim().toLowerCase();
}

// La generación de contraseñas temporales ahora vive en
// utils/passwordPolicy.js (garantiza mayúscula+número+especial) —
// ver generateSecurePassword importado arriba.

const LIST_FIELDS = `id, username, email, full_name, can_manage_admins, must_change_password,
        ${EmailConfirmation.PENDING_CONFIRMATION_SQL} AS pending_confirmation,
        (security_question IS NOT NULL) AS has_security_question, created_at`;

const Admin = {
  async all() {
    const [rows] = await pool.query(`SELECT ${LIST_FIELDS} FROM admins ORDER BY created_at ASC`);
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT ${LIST_FIELDS}, security_question FROM admins WHERE id = ?`,
      [id]
    );
    return rows[0];
  },

  // Incluye password_hash — solo para uso interno de login/verificación,
  // nunca se expone en una vista.
  async findByUsername(username) {
    const [rows] = await pool.query('SELECT * FROM admins WHERE username = ?', [username]);
    return rows[0];
  },

  async findByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM admins WHERE email = ?', [email]);
    return rows[0];
  },

  // Para el login: acepta el nombre de usuario O el correo en el
  // mismo campo.
  async findByUsernameOrEmail(identifier) {
    const [rows] = await pool.query('SELECT * FROM admins WHERE username = ? OR email = ?', [identifier, identifier]);
    return rows[0];
  },

  async count() {
    const [[row]] = await pool.query('SELECT COUNT(*) as total FROM admins');
    return row.total;
  },

  async countManagers() {
    const [[row]] = await pool.query('SELECT COUNT(*) as total FROM admins WHERE can_manage_admins = 1');
    return row.total;
  },

  // Crea la cuenta en estado PENDIENTE (email_confirmed_at = NULL)
  // con un token de confirmación válido por 24 horas (ver
  // models/EmailConfirmation.js). El controlador usa el token
  // devuelto para armar el enlace y enviarlo por correo.
  async create({ username, password, email, full_name, can_manage_admins }) {
    const password_hash = await bcrypt.hash(password, 10);
    const confirmationToken = EmailConfirmation.generateToken();
    const [result] = await pool.query(
      `INSERT INTO admins
        (username, password_hash, email, full_name, can_manage_admins, confirmation_token, confirmation_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [username, password_hash, email, full_name || null, can_manage_admins ? 1 : 0, confirmationToken, EmailConfirmation.TOKEN_TTL_HOURS]
    );
    return { id: result.insertId, confirmationToken };
  },

  // Confirma la cuenta si el token es válido y no ha vencido.
  // Devuelve la cuenta confirmada, o null si el enlace ya no sirve
  // (inválido, ya confirmado antes, o vencido).
  async confirmEmail(token) {
    return EmailConfirmation.confirmByToken('admins', token);
  },

  // Limpieza de cuentas nunca confirmadas cuyo plazo de 24 horas ya
  // pasó — se llama periódicamente desde app.js. Devuelve cuántas se
  // borraron, solo para dejar rastro en el log del servidor.
  async deleteExpiredPending() {
    return EmailConfirmation.deleteExpiredPending('admins');
  },

  async setCanManage(id, canManage) {
    await pool.query('UPDATE admins SET can_manage_admins = ? WHERE id = ?', [canManage ? 1 : 0, id]);
  },

  // Cambio de contraseña normal (el propio admin, o resultado de
  // resolver la pregunta de seguridad). Limpia must_change_password.
  async setPassword(id, newPassword) {
    const password_hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?',
      [password_hash, id]
    );
  },

  async verifyPassword(admin, plainPassword) {
    return bcrypt.compare(plainPassword, admin.password_hash);
  },

  // --- Pregunta de seguridad ---
  async setSecurityQuestion(id, question, answer) {
    const answer_hash = await bcrypt.hash(normalizeAnswer(answer), 10);
    await pool.query(
      'UPDATE admins SET security_question = ?, security_answer_hash = ? WHERE id = ?',
      [question, answer_hash, id]
    );
  },

  async verifySecurityAnswer(username, answer) {
    const admin = await Admin.findByUsername(username);
    if (!admin || !admin.security_answer_hash) return null;
    const valid = await bcrypt.compare(normalizeAnswer(answer), admin.security_answer_hash);
    return valid ? admin : null;
  },

  // --- Reseteo asistido por un administrador con permiso, o
  // autoservicio por correo (ver controllers/passwordRecoveryController.js)
  // — ambos casos generan una contraseña temporal aleatoria, la
  // guardan hasheada, y marcan la cuenta para forzar el cambio en el
  // próximo login. Devuelve la contraseña en texto plano UNA sola
  // vez (para compartirla a mano o incluirla en el correo).
  async assignTemporaryPassword(id) {
    const tempPassword = generateSecurePassword();
    const password_hash = await bcrypt.hash(tempPassword, 10);
    await pool.query(
      'UPDATE admins SET password_hash = ?, must_change_password = 1 WHERE id = ?',
      [password_hash, id]
    );
    return tempPassword;
  },

  async delete(id) {
    await pool.query('DELETE FROM admins WHERE id = ?', [id]);
  },
};

module.exports = Admin;

