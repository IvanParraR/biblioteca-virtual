// ============================================================
// makeEmailDomainList — fábrica que arma un modelo de "dominios de
// correo permitidos" contra la tabla que se le indique. Se usa dos
// veces: allowed_email_domains (administradores) y
// allowed_student_email_domains (estudiantes) — listas separadas a
// propósito, porque el auto-registro de estudiantes hace que ESA
// lista sea la barrera principal contra registros externos, y el
// colegio puede querer un dominio distinto (o más permisivo) que el
// de administradores.
//
// `table` nunca debe venir de datos de usuario — siempre un literal
// fijo (ver EmailConfirmation.js para la misma precaución).
// ============================================================
const { pool } = require('../config/db');

function assertSafeTableName(table) {
  if (!/^[a-z_]+$/.test(table)) {
    throw new Error(`Nombre de tabla no seguro para makeEmailDomainList: "${table}"`);
  }
}

function extractDomain(email) {
  const parts = (email || '').trim().toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : null;
}

function makeEmailDomainList(table) {
  assertSafeTableName(table);

  return {
    async all() {
      const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY domain ASC`);
      return rows;
    },

    async count() {
      const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM ${table}`);
      return row.total;
    },

    async isAllowed(email) {
      const domain = extractDomain(email);
      if (!domain) return false;
      const [rows] = await pool.query(`SELECT id FROM ${table} WHERE domain = ?`, [domain]);
      return rows.length > 0;
    },

    async add(domain) {
      const clean = (domain || '').trim().toLowerCase().replace(/^@/, '');
      if (!clean || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
        throw new Error('Ese dominio no parece válido (ej. gmail.com, colegio.edu.co).');
      }
      await pool.query(`INSERT INTO ${table} (domain) VALUES (?) ON DUPLICATE KEY UPDATE domain = domain`, [clean]);
      return clean;
    },

    async delete(id) {
      const total = await this.count();
      if (total <= 1) {
        throw new Error('Debe quedar al menos un dominio permitido — agrega otro antes de eliminar este.');
      }
      await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    },
  };
}

module.exports = makeEmailDomainList;
