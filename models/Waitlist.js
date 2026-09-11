// ============================================================
// Modelo Waitlist — cola de espera por libro, en orden de llegada.
//
// Cuando se libera una copia (devolución, o un admin la marca
// disponible por otro motivo), se avisa a la persona más antigua
// todavía esperando y se le reserva un cupo por HOLD_HOURS: durante
// ese plazo, SOLO ella puede prestar ese libro (ver Loan.create,
// que consulta activeHoldForOther antes de dejar prestar a
// cualquier otro estudiante). Si no lo reclama a tiempo, el cupo
// se libera y pasa al siguiente en la fila (ver expireStaleHolds,
// corrida periódicamente desde app.js).
// ============================================================
const { pool } = require('../config/db');

const HOLD_HOURS = 48;

const SELECT_BASE = `
  SELECT w.*, b.title AS book_title, b.cover_url AS book_cover_url,
         s.full_name AS student_name, s.email AS student_email
  FROM loan_waitlist w
  JOIN books b ON w.book_id = b.id
  JOIN students s ON w.student_id = s.id
`;

const Waitlist = {
  HOLD_HOURS,

  // ¿Ya está esta persona en la cola (activa) para este libro? —
  // evita que se anote dos veces para lo mismo.
  async findActiveEntry(bookId, studentId) {
    const [rows] = await pool.query(
      `SELECT * FROM loan_waitlist
       WHERE book_id = ? AND student_id = ? AND fulfilled_at IS NULL AND cancelled_at IS NULL`,
      [bookId, studentId]
    );
    return rows[0];
  },

  async join(bookId, studentId) {
    const existing = await Waitlist.findActiveEntry(bookId, studentId);
    if (existing) {
      const err = new Error('Ya estás en la lista de espera de este libro.');
      err.code = 'ALREADY_WAITING';
      throw err;
    }
    const [activeLoanRows] = await pool.query(
      'SELECT id FROM loans WHERE book_id = ? AND student_id = ? AND returned_at IS NULL LIMIT 1',
      [bookId, studentId]
    );
    if (activeLoanRows.length > 0) {
      const err = new Error('Ya tienes ese libro prestado — no hace falta anotarte en la lista de espera.');
      err.code = 'ALREADY_BORROWED';
      throw err;
    }
    const [result] = await pool.query(
      'INSERT INTO loan_waitlist (book_id, student_id) VALUES (?, ?)',
      [bookId, studentId]
    );
    return result.insertId;
  },

  async cancel(id, studentId) {
    await pool.query(
      'UPDATE loan_waitlist SET cancelled_at = NOW() WHERE id = ? AND student_id = ? AND fulfilled_at IS NULL',
      [id, studentId]
    );
  },

  // Todo lo que un estudiante tiene activo en cola (esperando o con
  // turno reservado ahora mismo) — para su "mi cuenta".
  async activeForStudent(studentId) {
    const [rows] = await pool.query(
      `${SELECT_BASE} WHERE w.student_id = ? AND w.fulfilled_at IS NULL AND w.cancelled_at IS NULL ORDER BY w.requested_at ASC`,
      [studentId]
    );
    return rows;
  },

  // El primero en la fila (todavía sin avisar) para un libro —
  // usado al liberarse una copia.
  async nextWaitingFor(bookId) {
    const [rows] = await pool.query(
      `SELECT * FROM loan_waitlist
       WHERE book_id = ? AND notified_at IS NULL AND fulfilled_at IS NULL AND cancelled_at IS NULL
       ORDER BY requested_at ASC LIMIT 1`,
      [bookId]
    );
    return rows[0];
  },

  // Cuántos cupos reservados (activos, no vencidos) hay ahora mismo
  // para este libro que NO le pertenecen a `studentId`. Se usa junto
  // con available_copies: si hay más copias libres que cupos
  // reservados para otros, sí queda margen para un préstamo general
  // — el bloqueo solo aplica cuando las copias libres restantes no
  // alcanzan ni para cubrir los cupos ya comprometidos.
  async countActiveHoldsForOther(bookId, studentId, conn = pool) {
    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS total FROM loan_waitlist
       WHERE book_id = ? AND student_id != ? AND notified_at IS NOT NULL
         AND hold_expires_at > NOW() AND fulfilled_at IS NULL AND cancelled_at IS NULL`,
      [bookId, studentId]
    );
    return Number(row.total) || 0;
  },

  // ¿Hay ahora mismo un cupo reservado para este libro que le
  // pertenece a OTRO estudiante (no el que está pidiendo prestar)?
  // Si sí, el préstamo general debe esperar a que se libere el cupo.
  async activeHoldForOther(bookId, studentId, conn = pool) {
    const [rows] = await conn.query(
      `SELECT * FROM loan_waitlist
       WHERE book_id = ? AND student_id != ? AND notified_at IS NOT NULL
         AND hold_expires_at > NOW() AND fulfilled_at IS NULL AND cancelled_at IS NULL
       ORDER BY hold_expires_at ASC LIMIT 1`,
      [bookId, studentId]
    );
    return rows[0];
  },

  // Si ESTE estudiante tiene un cupo reservado activo para este
  // libro, lo marca cumplido (se llama al concretar el préstamo).
  async fulfillIfHolding(bookId, studentId, conn = pool) {
    await conn.query(
      `UPDATE loan_waitlist SET fulfilled_at = NOW()
       WHERE book_id = ? AND student_id = ? AND notified_at IS NOT NULL
         AND fulfilled_at IS NULL AND cancelled_at IS NULL`,
      [bookId, studentId]
    );
  },

  // Avisa al siguiente en la fila (si hay alguien) que ya puede
  // prestar el libro. Devuelve la entrada notificada, o null si la
  // cola estaba vacía — en ese caso el controlador no manda correo.
  async notifyNext(bookId) {
    const next = await Waitlist.nextWaitingFor(bookId);
    if (!next) return null;
    await pool.query(
      'UPDATE loan_waitlist SET notified_at = NOW(), hold_expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id = ?',
      [HOLD_HOURS, next.id]
    );
    const [rows] = await pool.query(`${SELECT_BASE} WHERE w.id = ?`, [next.id]);
    return rows[0];
  },

  // Punto de entrada correcto para "se liberaron copias de este
  // libro" (devolución, +1 manual, o incluso editar el libro y
  // subir el número de copias a mano) — en vez de avisar a una sola
  // persona por evento, recalcula cuántos cupos DEBERÍAN estar
  // activos ahora mismo (copias disponibles menos los que ya tienen
  // un cupo reservado) y avisa a tantas personas de la fila como
  // haga falta para llenar esos cupos. Así, si se liberan 2 copias
  // de una sola vez (o en eventos separados antes de que alguien
  // reclame su turno), se llama a 2 personas seguidas en vez de
  // solo a la primera. Devuelve un arreglo (puede ser vacío) con
  // cada entrada recién notificada, para que el controlador le
  // mande el correo a cada una.
  async reconcileForBook(bookId) {
    const [[book]] = await pool.query('SELECT available_copies FROM books WHERE id = ?', [bookId]);
    if (!book) return [];

    const [[{ activeHolds }]] = await pool.query(
      `SELECT COUNT(*) AS activeHolds FROM loan_waitlist
       WHERE book_id = ? AND notified_at IS NOT NULL AND hold_expires_at > NOW()
         AND fulfilled_at IS NULL AND cancelled_at IS NULL`,
      [bookId]
    );

    const slotsToFill = Number(book.available_copies) - Number(activeHolds);
    const newlyNotified = [];
    for (let i = 0; i < slotsToFill; i++) {
      const next = await Waitlist.notifyNext(bookId);
      if (!next) break; // la fila se quedó sin nadie más esperando
      newlyNotified.push(next);
    }
    return newlyNotified;
  },

  // Cupos avisados cuyo plazo de 48h ya pasó sin que se prestara el
  // libro — se cancelan y se le pasa el turno al siguiente. Se
  // llama periódicamente desde app.js. Devuelve las entradas recién
  // notificadas como consecuencia (para que el controlador les
  // mande el correo de "ya te toca").
  async expireStaleHolds() {
    const [expired] = await pool.query(
      `SELECT * FROM loan_waitlist
       WHERE notified_at IS NOT NULL AND hold_expires_at < NOW()
         AND fulfilled_at IS NULL AND cancelled_at IS NULL`
    );
    const bookIdsAffected = new Set();
    for (const entry of expired) {
      await pool.query('UPDATE loan_waitlist SET cancelled_at = NOW() WHERE id = ?', [entry.id]);
      bookIdsAffected.add(entry.book_id);
    }
    // Se reconcilia por libro (no por cupo vencido individual) para
    // cubrir el caso de que a un mismo libro le hayan vencido varios
    // cupos a la vez — así se llama a tantas personas nuevas como
    // haga falta, no solo a una por cada vencido.
    const newlyNotified = [];
    for (const bookId of bookIdsAffected) {
      const notified = await Waitlist.reconcileForBook(bookId);
      newlyNotified.push(...notified);
    }
    return newlyNotified;
  },
};

module.exports = Waitlist;
