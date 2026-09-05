// ============================================================
// Modelo Loan — préstamos de libros a estudiantes.
//
// Reglas de negocio (decididas junto con el usuario):
//   - Duración por defecto: 7 días desde hoy (LOAN_DAYS_DEFAULT).
//     El admin puede ajustar la fecha límite al registrar.
//   - Máximo MAX_ACTIVE_LOANS_PER_STUDENT préstamos activos a la
//     vez, por estudiante.
//   - Un estudiante con un préstamo atrasado no puede registrar
//     uno nuevo hasta devolver el atrasado.
//   - Libros "solo biblioteca" (library_only=1) nunca circulan:
//     no se pueden prestar.
//
// El estado "atrasado" no se guarda como columna: se deriva
// comparando due_date con CURDATE(), igual que el estado de los
// libros en models/Book.js — así nunca queda desincronizado.
// ============================================================
const { pool } = require('../config/db');
const Settings = require('./Settings');

const LOAN_DAYS_DEFAULT = 7; // respaldo si Settings aún no cargó o no tiene el campo
const MAX_ACTIVE_LOANS_PER_STUDENT = 3;
const MAX_RENEWALS = 1; // una sola renovación por préstamo

// Errores de regla de negocio — su .message es seguro para
// mostrarle directamente al admin (a diferencia de un error de
// MySQL crudo, que solo debe ir a los logs).
class LoanError extends Error {}

function loanDaysDefault() {
  const configured = Settings.get().loan_days_default;
  return Number.isInteger(configured) && configured > 0 ? configured : LOAN_DAYS_DEFAULT;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function defaultDueDate() {
  return addDays(new Date(), loanDaysDefault());
}

const SELECT_BASE = `
  SELECT
    l.*,
    b.title AS book_title, b.author AS book_author, b.cover_url AS book_cover_url,
    s.full_name AS student_name, s.student_code AS student_code, s.grade AS student_grade,
    (l.returned_at IS NULL AND l.due_date < CURDATE()) AS is_overdue
  FROM loans l
  JOIN books b ON l.book_id = b.id
  JOIN students s ON l.student_id = s.id
`;

const Loan = {
  LOAN_DAYS_DEFAULT,
  MAX_ACTIVE_LOANS_PER_STUDENT,
  MAX_RENEWALS,
  LoanError,
  defaultDueDate,
  loanDaysDefault,

  async findById(id) {
    const [rows] = await pool.query(`${SELECT_BASE} WHERE l.id = ?`, [id]);
    return rows[0];
  },

  async countActiveForStudent(studentId) {
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM loans WHERE student_id = ? AND returned_at IS NULL',
      [studentId]
    );
    return count;
  },

  async hasOverdue(studentId) {
    const [rows] = await pool.query(
      'SELECT id FROM loans WHERE student_id = ? AND returned_at IS NULL AND due_date < CURDATE() LIMIT 1',
      [studentId]
    );
    return rows.length > 0;
  },

  // Registra un préstamo nuevo. Todo corre en una sola transacción
  // para que la validación de disponibilidad y el descuento de
  // available_copies queden consistentes aunque dos admins
  // intenten prestar el mismo último ejemplar al mismo tiempo.
  async create({ bookId, studentId, dueDate, loanedBy }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [bookRows] = await conn.query(
        'SELECT id, title, available_copies, library_only FROM books WHERE id = ? FOR UPDATE',
        [bookId]
      );
      const book = bookRows[0];
      if (!book) throw new LoanError('El libro seleccionado no existe.');
      if (Number(book.library_only) === 1) {
        throw new LoanError('Ese libro es solo de consulta en sala y no se puede prestar.');
      }
      if (Number(book.available_copies) <= 0) {
        throw new LoanError('No quedan copias disponibles de ese libro.');
      }

      const [studentRows] = await conn.query('SELECT id, full_name FROM students WHERE id = ?', [studentId]);
      const student = studentRows[0];
      if (!student) throw new LoanError('El estudiante seleccionado no existe.');

      const [[{ activeCount }]] = await conn.query(
        'SELECT COUNT(*) AS activeCount FROM loans WHERE student_id = ? AND returned_at IS NULL FOR UPDATE',
        [studentId]
      );
      if (activeCount >= MAX_ACTIVE_LOANS_PER_STUDENT) {
        throw new LoanError(
          `${student.full_name} ya tiene ${MAX_ACTIVE_LOANS_PER_STUDENT} préstamos activos — no puede llevar otro hasta devolver alguno.`
        );
      }

      const [overdueRows] = await conn.query(
        'SELECT id FROM loans WHERE student_id = ? AND returned_at IS NULL AND due_date < CURDATE() LIMIT 1',
        [studentId]
      );
      if (overdueRows.length > 0) {
        throw new LoanError(`${student.full_name} tiene un préstamo atrasado — debe devolverlo antes de llevar otro libro.`);
      }

      const finalDueDate = dueDate || defaultDueDate();

      const [result] = await conn.query(
        'INSERT INTO loans (book_id, student_id, loaned_by, due_date) VALUES (?, ?, ?, ?)',
        [bookId, studentId, loanedBy, finalDueDate]
      );

      await conn.query(
        'UPDATE books SET available_copies = GREATEST(0, available_copies - 1) WHERE id = ?',
        [bookId]
      );

      await conn.commit();
      return result.insertId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async markReturned(id, returnedBy) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query('SELECT * FROM loans WHERE id = ? FOR UPDATE', [id]);
      const loan = rows[0];
      if (!loan) throw new LoanError('Ese préstamo no existe.');
      if (loan.returned_at) throw new LoanError('Ese préstamo ya estaba marcado como devuelto.');

      await conn.query('UPDATE loans SET returned_at = NOW(), returned_by = ? WHERE id = ?', [returnedBy, id]);
      await conn.query(
        'UPDATE books SET available_copies = LEAST(total_copies, available_copies + 1) WHERE id = ?',
        [loan.book_id]
      );

      await conn.commit();
      return loan;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  // Extiende la fecha límite de un préstamo activo. No toca
  // available_copies (el libro sigue en las mismas manos) — solo
  // mueve due_date hacia adelante y sube el contador de
  // renovaciones. Máximo MAX_RENEWALS veces por préstamo.
  //
  // Si el préstamo ya estaba atrasado, la nueva fecha se cuenta
  // desde HOY (no desde la fecha límite vieja) para que la
  // renovación sirva de algo — extenderla desde una fecha ya
  // pasada dejaría el préstamo igual de atrasado.
  async renew(id, adminUsername) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT l.*, b.title AS book_title, s.full_name AS student_name
         FROM loans l
         JOIN books b ON l.book_id = b.id
         JOIN students s ON l.student_id = s.id
         WHERE l.id = ? FOR UPDATE`,
        [id]
      );
      const loan = rows[0];
      if (!loan) throw new LoanError('Ese préstamo no existe.');
      if (loan.returned_at) throw new LoanError('Ese préstamo ya fue devuelto — no se puede renovar.');
      if (loan.renewal_count >= MAX_RENEWALS) {
        throw new LoanError(`"${loan.book_title}" ya se renovó el máximo de ${MAX_RENEWALS} vez/veces permitido.`);
      }

      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const currentDueDate = new Date(loan.due_date);
      const anchor = currentDueDate > todayMidnight ? currentDueDate : todayMidnight;
      const newDueDate = addDays(anchor, loanDaysDefault());

      await conn.query(
        'UPDATE loans SET due_date = ?, renewal_count = renewal_count + 1 WHERE id = ?',
        [newDueDate, id]
      );

      await conn.commit();
      return { ...loan, due_date: newDueDate };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  // Préstamos activos (no devueltos), con filtro opcional de texto
  // sobre libro/estudiante/código. Los atrasados salen marcados
  // con is_overdue = 1, pero no se separan en otra tabla — el
  // controlador/vista decide si los resalta o los filtra.
  async listActive({ q } = {}) {
    const where = ['l.returned_at IS NULL'];
    const params = [];
    if (q) {
      where.push('(b.title LIKE ? OR s.full_name LIKE ? OR s.student_code LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const [rows] = await pool.query(
      `${SELECT_BASE} WHERE ${where.join(' AND ')} ORDER BY is_overdue DESC, l.due_date ASC`,
      params
    );
    return rows;
  },

  // Historial completo (activos + devueltos), paginado — para
  // revisar qué pasó con un libro o un estudiante en el tiempo.
  async listHistory({ q, page = 1, perPage = 20 } = {}) {
    const where = [];
    const params = [];
    if (q) {
      where.push('(b.title LIKE ? OR s.full_name LIKE ? OR s.student_code LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM loans l JOIN books b ON l.book_id = b.id JOIN students s ON l.student_id = s.id ${whereSql}`,
      params
    );
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const offset = (currentPage - 1) * perPage;

    const [rows] = await pool.query(
      `${SELECT_BASE} ${whereSql} ORDER BY l.loaned_at DESC LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );
    return { loans: rows, total, totalPages, currentPage, perPage };
  },

  // Para exportar (Excel/PDF): mismo filtro que el historial, pero
  // sin paginar — trae todas las filas que coincidan, en el mismo
  // orden. Se usa solo al generar el archivo, no en la pantalla.
  async exportHistory({ q } = {}) {
    const where = [];
    const params = [];
    if (q) {
      where.push('(b.title LIKE ? OR s.full_name LIKE ? OR s.student_code LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(`${SELECT_BASE} ${whereSql} ORDER BY l.loaned_at DESC`, params);
    return rows;
  },

  // Para las tarjetas del panel general (dashboard).
  async stats() {
    const [[row]] = await pool.query(`
      SELECT
        SUM(CASE WHEN returned_at IS NULL THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN returned_at IS NULL AND due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue
      FROM loans
    `);
    return {
      active: Number(row.active) || 0,
      overdue: Number(row.overdue) || 0,
    };
  },
};

module.exports = Loan;
