// ============================================================
// Modelo Book — encapsula todas las consultas SQL sobre libros.
// El "status" de un libro NO se guarda como texto libre: se
// deriva de available_copies / total_copies / library_only,
// para que el catálogo nunca muestre un estado desincronizado.
//
// La categoría se almacena normalizada (books.category_id →
// categories.id) para evitar duplicados como "Matemáticas" vs
// "matematicas". Todas las consultas hacen JOIN con categories
// y devuelven "category" (nombre) y "category_id" para que las
// vistas existentes sigan funcionando sin cambios.
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

const SELECT_BASE = `
  SELECT b.*, c.name AS category
  FROM books b
  JOIN categories c ON b.category_id = c.id
`;

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
  // `category` es el ID numérico de la categoría (categories.id).
  async search({ q, category, availability, author, sort = 'title', order = 'asc', page = 1, perPage = 12 } = {}) {
    const where = [];
    const params = [];

    if (q) {
      where.push('(b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (category) {
      where.push('b.category_id = ?');
      params.push(category);
    }
    if (author) {
      where.push('b.author LIKE ?');
      params.push(`%${author}%`);
    }

    const sortable = { title: 'b.title', author: 'b.author', publication_year: 'b.publication_year' };
    const sortCol = sortable[sort] || 'b.title';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `${SELECT_BASE} ${whereSql} ORDER BY ${sortCol} ${sortOrder}, b.title ASC`,
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
    const [rows] = await pool.query(`${SELECT_BASE} WHERE b.id = ?`, [id]);
    return attachStatus(rows[0]);
  },

  async findByIsbn(isbn) {
    const [rows] = await pool.query(`${SELECT_BASE} WHERE b.isbn = ?`, [isbn]);
    return attachStatus(rows[0]);
  },

  async recent(limit = 4) {
    const [rows] = await pool.query(`${SELECT_BASE} ORDER BY b.created_at DESC LIMIT ?`, [limit]);
    return rows.map(attachStatus);
  },

  // Lista de categorías con su conteo de libros — delega en el
  // modelo Category para mantener una sola fuente de verdad.
  async categories() {
    const Category = require('./Category');
    return Category.withCounts();
  },

  async authorsList() {
    const [rows] = await pool.query('SELECT DISTINCT author FROM books ORDER BY author ASC');
    return rows.map((r) => r.author);
  },

  async all() {
    const [rows] = await pool.query(`${SELECT_BASE} ORDER BY b.title ASC`);
    return rows.map(attachStatus);
  },

  async create(data) {
    const [result] = await pool.query(
      `INSERT INTO books
        (title, author, isbn, category_id, description, publisher, publication_year, cover_url, total_copies, available_copies, location, library_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        data.author,
        data.isbn,
        data.category_id,
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
        title = ?, author = ?, isbn = ?, category_id = ?, description = ?,
        publisher = ?, publication_year = ?, cover_url = ?, location = ?, library_only = ?
       WHERE id = ?`,
      [
        data.title,
        data.author,
        data.isbn,
        data.category_id,
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
      `SELECT c.name AS category, COUNT(b.id) as book_count,
        COALESCE(SUM(b.total_copies),0) as total_copies,
        COALESCE(SUM(b.available_copies),0) as available_copies
       FROM categories c LEFT JOIN books b ON b.category_id = c.id
       GROUP BY c.id, c.name ORDER BY book_count DESC`
    );
    const recent = await Book.recent(5);
    return { totals, byCategory, recent };
  },
};

module.exports = Book;
