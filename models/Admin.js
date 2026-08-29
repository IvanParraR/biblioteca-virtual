// ============================================================
// Modelo Admin — gestión de cuentas de administrador.
// Solo las cuentas con can_manage_admins = 1 pueden usar las
// operaciones de creación/edición de permisos/eliminación
// (ver middleware/auth.js -> requireAdminManager).
//
// Recuperación de contraseña en dos niveles:
//   1. Autoservicio: el propio admin responde su pregunta de
//      seguridad y define una contraseña nueva sin ayuda.
//   2. Asistido: un admin con permiso de gestión le asigna una
//      contraseña temporal; la cuenta queda marcada con
//      must_change_password = 1 y debe cambiarla al entrar.
// ============================================================
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../config/db');

// Normaliza la respuesta de seguridad antes de hashear/comparar,
// para que mayúsculas o espacios de más no bloqueen al admin.
function normalizeAnswer(answer) {
  return (answer || '').trim().toLowerCase();
}

const Admin = {
  async all() {
    const [rows] = await pool.query(
      `SELECT id, username, full_name, can_manage_admins, must_change_password,
        (security_question IS NOT NULL) AS has_security_question, created_at
       FROM admins ORDER BY created_at ASC`
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT id, username, full_name, can_manage_admins, must_change_password,
        (security_question IS NOT NULL) AS has_security_question, security_question, created_at
       FROM admins WHERE id = ?`,
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

  async count() {
    const [[row]] = await pool.query('SELECT COUNT(*) as total FROM admins');
    return row.total;
  },

  async countManagers() {
    const [[row]] = await pool.query('SELECT COUNT(*) as total FROM admins WHERE can_manage_admins = 1');
    return row.total;
  },

  async create({ username, password, full_name, can_manage_admins }) {
    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO admins (username, password_hash, full_name, can_manage_admins) VALUES (?, ?, ?, ?)',
      [username, password_hash, full_name || null, can_manage_admins ? 1 : 0]
    );
    return result.insertId;
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

  // --- Reseteo asistido por un administrador con permiso ---
  // Genera una contraseña temporal aleatoria, la guarda hasheada,
  // y marca la cuenta para forzar el cambio en el próximo login.
  // Devuelve la contraseña en texto plano UNA sola vez, para que
  // el gestor se la comparta al dueño de la cuenta.
  async assignTemporaryPassword(id) {
    const tempPassword = crypto.randomBytes(6).toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 10) || 'Temp' + Date.now();
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
