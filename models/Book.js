// ============================================================
// Modelo Book — encapsula todas las consultas SQL sobre libros.
// El "status" de un libro NO se guarda como texto libre: se
// deriva de available_copies / total_copies / library_only,
// para que el catálogo nunca muestre un estado desincronizado.
//
// Estados posibles:
//   - "disponible"        → available_copies > 0 y no es solo-sala
//   - "prestado"          → available_copies === 0 y total_copies > 0
//   - "solo_biblioteca"    → library_only = 1 (no circula, solo consulta en sala)
//   - "no_disponible"     → total_copies === 0
// ============================================================
const { pool } = require('../config/db');

const STATUS_LABELS = {
  disponible: 'Disponible',
  prestado: 'Prestado',
  solo_biblioteca: 'Disponible en biblioteca',
  no_disponible: 'No disponible',
};

function deriveStatus(book) {
  if (Number(book.total_copies) === 0) return 'no_disponible';
  if (Number(book.library_only) === 1) return 'solo_biblioteca';
  if (Number(book.available_copies) > 0) return 'disponible';
  return 'prestado';
}

function attachStatus(book) {
  if (!book) return book;
  const status = deriveStatus(book);
  return { ...book, status, status_label: STATUS_LABELS[status] };
}

const Book = {
  STATUS_LABELS,

  // Búsqueda + filtros + orden, con paginación simple.
  async search({ q, category, availability, author, sort = 'title', order = 'asc', page = 1, perPage = 12 } = {}) {
    const where = [];
    const params = [];

    if (q) {
      where.push('(title LIKE ? OR author LIKE ? OR isbn LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (author) {
      where.push('author LIKE ?');
      params.push(`%${author}%`);
    }

    const sortable = { title: 'title', author: 'author', publication_year: 'publication_year' };
    const sortCol = sortable[sort] || 'title';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT * FROM books ${whereSql} ORDER BY ${sortCol} ${sortOrder}, title ASC`,
      params
    );

    let results = rows.map(attachStatus);

    // El filtro de disponibilidad se aplica después de derivar el estado.
    if (availability) {
      results = results.filter((b) => b.status === availability);
    }

    const total = results.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * perPage;
    const paged = results.slice(start, start + perPage);

    return { books: paged, total, totalPages, currentPage, perPage };
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM books WHERE id = ?', [id]);
    return attachStatus(rows[0]);
  },

  async findByIsbn(isbn) {
    const [rows] = await pool.query('SELECT * FROM books WHERE isbn = ?', [isbn]);
    return attachStatus(rows[0]);
  },

  async recent(limit = 4) {
    const [rows] = await pool.query('SELECT * FROM books ORDER BY created_at DESC LIMIT ?', [limit]);
    return rows.map(attachStatus);
  },

  async categories() {
    const [rows] = await pool.query(
      'SELECT category, COUNT(*) as count FROM books GROUP BY category ORDER BY category ASC'
    );
    return rows;
  },

  async authorsList() {
    const [rows] = await pool.query('SELECT DISTINCT author FROM books ORDER BY author ASC');
    return rows.map((r) => r.author);
  },

  async all() {
    const [rows] = await pool.query('SELECT * FROM books ORDER BY title ASC');
    return rows.map(attachStatus);
  },

  async create(data) {
    const [result] = await pool.query(
      `INSERT INTO books
        (title, author, isbn, category, description, publisher, publication_year, cover_url, total_copies, available_copies, location, library_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        data.author,
        data.isbn,
        data.category,
        data.description || null,
        data.publisher || null,
        data.publication_year || null,
        data.cover_url || null,
        data.total_copies,
        data.available_copies,
        data.location || null,
        data.library_only ? 1 : 0,
      ]
    );
    return result.insertId;
  },

  async update(id, data) {
    await pool.query(
      `UPDATE books SET
        title = ?, author = ?, isbn = ?, category = ?, description = ?,
        publisher = ?, publication_year = ?, cover_url = ?, location = ?, library_only = ?
       WHERE id = ?`,
      [
        data.title,
        data.author,
        data.isbn,
        data.category,
        data.description || null,
        data.publisher || null,
        data.publication_year || null,
        data.cover_url || null,
        data.location || null,
        data.library_only ? 1 : 0,
        id,
      ]
    );
  },

  async delete(id) {
    await pool.query('DELETE FROM books WHERE id = ?', [id]);
  },

  async addCopies(id, amount) {
    await pool.query(
      'UPDATE books SET total_copies = total_copies + ?, available_copies = available_copies + ? WHERE id = ?',
      [amount, amount, id]
    );
  },

  async removeCopies(id, amount) {
    // Nunca deja available_copies o total_copies en negativo, y nunca
    // deja available_copies por encima de total_copies.
    const [[row]] = await pool.query('SELECT total_copies, available_copies FROM books WHERE id = ?', [id]);
    if (!row) return;
    const newTotal = Math.max(0, row.total_copies - amount);
    const newAvailable = Math.min(newTotal, Math.max(0, row.available_copies - amount));
    await pool.query('UPDATE books SET available_copies = ?, total_copies = ? WHERE id = ?', [newAvailable, newTotal, id]);
  },

  async stats() {
    const [[totals]] = await pool.query(
      `SELECT
        COUNT(*) as total_books,
        COALESCE(SUM(total_copies), 0) as total_copies,
        COALESCE(SUM(available_copies), 0) as available_copies,
        COALESCE(SUM(CASE WHEN available_copies = 0 AND total_copies > 0 AND library_only = 0 THEN total_copies ELSE 0 END), 0) as borrowed_copies,
        COALESCE(SUM(CASE WHEN total_copies = 0 THEN 1 ELSE 0 END), 0) as unavailable_books
       FROM books`
    );
    const [byCategory] = await pool.query(
      `SELECT category, COUNT(*) as book_count, COALESCE(SUM(total_copies),0) as total_copies, COALESCE(SUM(available_copies),0) as available_copies
       FROM books GROUP BY category ORDER BY book_count DESC`
    );
    const recent = await Book.recent(5);
    return { totals, byCategory, recent };
  },
};

module.exports = Book;
