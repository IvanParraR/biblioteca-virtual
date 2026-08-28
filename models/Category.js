// ============================================================
// Modelo Category — evita duplicados como "Matemáticas" vs
// "matematicas" al mantener las categorías en su propia tabla.
// El administrador elige de una lista existente al crear un
// libro, y puede agregar categorías nuevas si lo necesita.
// ============================================================
const { pool } = require('../config/db');

const Category = {
  async all() {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    return rows;
  },

  async withCounts() {
    const [rows] = await pool.query(
      `SELECT c.id, c.name AS category, COUNT(b.id) as count
       FROM categories c LEFT JOIN books b ON b.category_id = c.id
       GROUP BY c.id, c.name
       ORDER BY c.name ASC`
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM categories WHERE id = ?', [id]);
    return rows[0];
  },

  // Búsqueda insensible a mayúsculas/espacios — evita crear
  // "Matemáticas" de nuevo si ya existe "matemáticas ".
  async findByName(name) {
    const [rows] = await pool.query(
      'SELECT * FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
      [name]
    );
    return rows[0];
  },

  async create(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('El nombre de la categoría no puede estar vacío.');

    const existing = await Category.findByName(trimmed);
    if (existing) return existing.id;

    const [result] = await pool.query('INSERT INTO categories (name) VALUES (?)', [trimmed]);
    return result.insertId;
  },

  // Encuentra la categoría por nombre (sin distinguir mayúsculas) o
  // la crea si no existe todavía. Usado al agregar/editar libros
  // cuando el administrador escribe una categoría nueva.
  async findOrCreate(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const existing = await Category.findByName(trimmed);
    if (existing) return existing.id;
    return Category.create(trimmed);
  },

  async rename(id, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) throw new Error('El nombre de la categoría no puede estar vacío.');
    await pool.query('UPDATE categories SET name = ? WHERE id = ?', [trimmed, id]);
  },

  async delete(id) {
    await pool.query('DELETE FROM categories WHERE id = ?', [id]);
  },

  async bookCount(id) {
    const [[row]] = await pool.query('SELECT COUNT(*) as total FROM books WHERE category_id = ?', [id]);
    return row.total;
  },

  // Reasigna todos los libros de una categoría a otra (útil para
  // fusionar duplicados manualmente) y elimina la categoría vieja.
  async mergeInto(sourceId, targetId) {
    await pool.query('UPDATE books SET category_id = ? WHERE category_id = ?', [targetId, sourceId]);
    await pool.query('DELETE FROM categories WHERE id = ?', [sourceId]);
  },
};

module.exports = Category;
