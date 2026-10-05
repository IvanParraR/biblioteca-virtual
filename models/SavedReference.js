// ============================================================
// Modelo SavedReference — referencias que un estudiante guardó
// desde Fuentes Abiertas (libros de Open Library o papers de
// OpenAlex, distinguidos por source_type). La cita en APA se
// guarda ya generada, no se recalcula después.
// ============================================================
const { pool } = require('../config/db');

const SavedReference = {
  async forStudent(studentId) {
    const [rows] = await pool.query(
      'SELECT * FROM saved_references WHERE student_id = ? ORDER BY saved_at DESC',
      [studentId]
    );
    return rows;
  },

  // No lanza error si ya estaba guardada (mismo estudiante + mismo
  // source_type + mismo source_id) — simplemente no hace nada, para
  // que "Guardar" nunca falle si el estudiante ya la tenía.
  async save(studentId, ref) {
    await pool.query(
      `INSERT INTO saved_references
        (student_id, source_type, source_id, title, authors, year, citation_apa, source_url, open_access_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE saved_at = saved_at`,
      [
        studentId,
        ref.sourceType,
        ref.sourceId,
        ref.title,
        ref.authors || null,
        ref.year || null,
        ref.citationApa,
        ref.sourceUrl || null,
        ref.openAccessUrl || null,
      ]
    );
  },

  async delete(id, studentId) {
    await pool.query('DELETE FROM saved_references WHERE id = ? AND student_id = ?', [id, studentId]);
  },
};

module.exports = SavedReference;
