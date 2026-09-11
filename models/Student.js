// ============================================================
// Modelo Student — directorio de estudiantes Y sus cuentas de
// acceso (auto-registro, login, ficha, preferencias).
//
// Una fila de `students` puede existir SIN cuenta (el bibliotecario
// la creó al registrar un préstamo en persona — email/password_hash
// en NULL) o CON cuenta (email + password_hash + confirmación).
// Registrarse con un código que ya existe "reclama" esa fila en vez
// de crear una persona duplicada — así el historial de préstamos
// hecho antes de tener cuenta no se pierde (ver claimOrRegister()).
//
// Login: con correo + contraseña (no usuario aparte, a diferencia
// de Admin — el correo ya es su identificador único).
// ============================================================
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const EmailConfirmation = require('./EmailConfirmation');
const { generateSecurePassword } = require('../utils/passwordPolicy');
// La generación de contraseñas temporales vive en utils/passwordPolicy.js
// (garantiza mayúscula+número+especial) — ver generateSecurePassword.

// Columnas seguras para mostrar en pantalla (nunca incluye
// password_hash ni confirmation_token).
const PUBLIC_FIELDS = `id, full_name, student_code, email, grade, phone, photo_url, status,
  ${EmailConfirmation.PENDING_CONFIRMATION_SQL} AS pending_confirmation,
  notify_due_reminder, created_at`;

const Student = {
  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM students WHERE id = ?', [id]);
    return rows[0];
  },

  // Versión seguro-para-mostrar de findById — la ficha del admin y
  // la propia cuenta del estudiante deberían usar esta, no la de
  // arriba.
  async findPublicById(id) {
    const [rows] = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM students WHERE id = ?`, [id]);
    return rows[0];
  },

  async findByCode(code) {
    const [rows] = await pool.query('SELECT * FROM students WHERE student_code = ?', [code]);
    return rows[0];
  },

  async findByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM students WHERE email = ?', [email]);
    return rows[0];
  },

  // Lista completa para el <select> del formulario de nuevo
  // préstamo (lado admin). Nunca incluye password_hash.
  async all() {
    const [rows] = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM students ORDER BY full_name ASC`);
    return rows;
  },

  async search(q, limit = 20) {
    const like = `%${q}%`;
    const codeStartsWith = `${q}%`;
    // Prioriza los estudiantes cuyo código EMPIEZA con lo escrito
    // (lo más probable cuando alguien está tecleando un código),
    // y deja el resto de coincidencias (nombre, o código en
    // cualquier posición) después, ordenadas por nombre.
    const [rows] = await pool.query(
      `SELECT ${PUBLIC_FIELDS}, (student_code LIKE ?) AS code_starts_match
       FROM students
       WHERE full_name LIKE ? OR student_code LIKE ?
       ORDER BY code_starts_match DESC, full_name ASC
       LIMIT ?`,
      [codeStartsWith, like, like, limit]
    );
    return rows;
  },

  // Creación "en el aire" desde el lado del bibliotecario (formulario
  // de nuevo préstamo) — sin correo ni contraseña, solo directorio.
  async create({ fullName, studentCode, grade }) {
    const [result] = await pool.query(
      'INSERT INTO students (full_name, student_code, grade) VALUES (?, ?, ?)',
      [fullName, studentCode || null, grade || null]
    );
    return this.findById(result.insertId);
  },

  // --- Auto-registro de cuenta ---
  //
  // Si `studentCode` coincide con una fila existente SIN cuenta
  // (email IS NULL), la "reclama": le agrega correo/contraseña sin
  // tocar su historial de préstamos previo. Si coincide con una que
  // YA tiene cuenta, se rechaza (debe iniciar sesión o recuperar su
  // contraseña, no registrarse de nuevo). Si no hay código o no
  // coincide con nadie, crea una fila nueva.
  async claimOrRegister({ fullName, studentCode, grade, email, password }) {
    const password_hash = await bcrypt.hash(password, 10);
    const confirmationToken = EmailConfirmation.generateToken();

    let existing = null;
    if (studentCode) {
      existing = await Student.findByCode(studentCode);
    }

    if (existing && existing.email) {
      const err = new Error('Ya existe una cuenta con ese código de estudiante. Inicia sesión o recupera tu contraseña en su lugar.');
      err.code = 'ALREADY_CLAIMED';
      throw err;
    }

    if (existing) {
      // Reclama la fila existente — conserva su nombre/grado si el
      // formulario los dejó vacíos, pero permite actualizarlos si
      // los volvió a escribir.
      await pool.query(
        `UPDATE students SET
           full_name = ?, grade = COALESCE(?, grade), email = ?, password_hash = ?,
           confirmation_token = ?, confirmation_expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR),
           email_confirmed_at = NULL
         WHERE id = ?`,
        [fullName || existing.full_name, grade || null, email, password_hash, confirmationToken, EmailConfirmation.TOKEN_TTL_HOURS, existing.id]
      );
      return { id: existing.id, confirmationToken, claimed: true };
    }

    const [result] = await pool.query(
      `INSERT INTO students
        (full_name, student_code, grade, email, password_hash, confirmation_token, confirmation_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
      [fullName, studentCode || null, grade || null, email, password_hash, confirmationToken, EmailConfirmation.TOKEN_TTL_HOURS]
    );
    return { id: result.insertId, confirmationToken, claimed: false };
  },

  async confirmEmail(token) {
    return EmailConfirmation.confirmByToken('students', token);
  },

  async deleteExpiredPending() {
    return EmailConfirmation.deleteExpiredPending('students');
  },

  async verifyPassword(student, plainPassword) {
    if (!student.password_hash) return false;
    return bcrypt.compare(plainPassword, student.password_hash);
  },

  async setPassword(id, newPassword) {
    const password_hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE students SET password_hash = ?, must_change_password = 0 WHERE id = ?',
      [password_hash, id]
    );
  },

  async assignTemporaryPassword(id) {
    const tempPassword = generateSecurePassword();
    const password_hash = await bcrypt.hash(tempPassword, 10);
    await pool.query(
      'UPDATE students SET password_hash = ?, must_change_password = 1 WHERE id = ?',
      [password_hash, id]
    );
    return tempPassword;
  },

  async updateProfile(id, { full_name, grade, phone, photo_url }) {
    await pool.query(
      'UPDATE students SET full_name = ?, grade = ?, phone = ?, photo_url = ? WHERE id = ?',
      [full_name, grade || null, phone || null, photo_url || null, id]
    );
  },

  async setNotifyDueReminder(id, enabled) {
    await pool.query('UPDATE students SET notify_due_reminder = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  },

  // Activa/desactiva la cuenta (no borra la fila — así se conserva
  // el historial de préstamos). Una cuenta inactiva no puede
  // iniciar sesión ni prestar.
  async setStatus(id, status) {
    await pool.query('UPDATE students SET status = ? WHERE id = ?', [status === 'inactive' ? 'inactive' : 'active', id]);
  },

  // Estadísticas para la ficha (resumen que ve el admin, y "mi
  // cuenta" del propio estudiante).
  async stats(id) {
    const [[row]] = await pool.query(
      `SELECT
         COUNT(*) AS total_loans,
         SUM(CASE WHEN loaned_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS loans_last_month,
         SUM(CASE WHEN returned_at IS NULL AND due_date < CURDATE() THEN 1 ELSE 0 END) AS currently_overdue,
         SUM(CASE WHEN returned_at IS NOT NULL AND returned_at > due_date THEN 1 ELSE 0 END) AS times_overdue_historically,
         SUM(CASE WHEN returned_at IS NULL THEN 1 ELSE 0 END) AS active_loans
       FROM loans WHERE student_id = ?`,
      [id]
    );
    return {
      total_loans: Number(row.total_loans) || 0,
      loans_last_month: Number(row.loans_last_month) || 0,
      currently_overdue: Number(row.currently_overdue) || 0,
      times_overdue_historically: Number(row.times_overdue_historically) || 0,
      active_loans: Number(row.active_loans) || 0,
    };
  },
};

module.exports = Student;

