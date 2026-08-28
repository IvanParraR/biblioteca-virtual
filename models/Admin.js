// ============================================================
// Modelo Admin — gestión de cuentas de administrador.
// Solo las cuentas con can_manage_admins = 1 pueden usar estas
// operaciones de creación/edición de permisos/eliminación
// (ver middleware/auth.js -> requireAdminManager).
// ============================================================
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const Admin = {
  async all() {
    const [rows] = await pool.query(
      'SELECT id, username, full_name, can_manage_admins, created_at FROM admins ORDER BY created_at ASC'
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.query(
      'SELECT id, username, full_name, can_manage_admins, created_at FROM admins WHERE id = ?',
      [id]
    );
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

  async resetPassword(id, newPassword) {
    const password_hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash, id]);
  },

  async delete(id) {
    await pool.query('DELETE FROM admins WHERE id = ?', [id]);
  },
};

module.exports = Admin;
