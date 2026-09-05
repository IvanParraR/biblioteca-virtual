// ============================================================
// Modelo Student — directorio de estudiantes usado únicamente
// para registrar a nombre de quién queda un préstamo. NO es un
// sistema de cuentas: los estudiantes nunca inician sesión (ver
// middleware/auth.js).
// ============================================================
const { pool } = require('../config/db');

const Student = {
  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM students WHERE id = ?', [id]);
    return rows[0];
  },

  async findByCode(code) {
    const [rows] = await pool.query('SELECT * FROM students WHERE student_code = ?', [code]);
    return rows[0];
  },

  // Lista completa para el <select> del formulario de nuevo
  // préstamo. Si el colegio llega a tener miles de estudiantes,
  // esto se puede cambiar más adelante por una búsqueda en vivo —
  // por ahora, un select ordenado por nombre alcanza de sobra.
  async all() {
    const [rows] = await pool.query('SELECT * FROM students ORDER BY full_name ASC');
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
      `SELECT *, (student_code LIKE ?) AS code_starts_match
       FROM students
       WHERE full_name LIKE ? OR student_code LIKE ?
       ORDER BY code_starts_match DESC, full_name ASC
       LIMIT ?`,
      [codeStartsWith, like, like, limit]
    );
    return rows;
  },

  async create({ fullName, studentCode, grade }) {
    const [result] = await pool.query(
      'INSERT INTO students (full_name, student_code, grade) VALUES (?, ?, ?)',
      [fullName, studentCode || null, grade || null]
    );
    return this.findById(result.insertId);
  },
};

module.exports = Student;
