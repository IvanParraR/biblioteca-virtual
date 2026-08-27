// ============================================================
// Conexión a MySQL — pool de conexiones reutilizables.
// Cuando el colegio conecte su base de datos real, solo hace
// falta ajustar las variables de entorno en .env (ver .env.example)
// y, si las columnas tienen otros nombres, actualizar los SELECT
// en models/Book.js.
// ============================================================
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'biblioteca_virtual',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

// Verificación de conexión al iniciar (no detiene el servidor si falla,
// solo informa — así el prototipo puede revisarse aunque MySQL aún no
// esté configurado).
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Conectado a MySQL:', process.env.DB_NAME || 'biblioteca_virtual');
    conn.release();
  } catch (err) {
    console.warn('⚠️  No se pudo conectar a MySQL todavía.');
    console.warn('   Revisa tu archivo .env y asegúrate de haber importado database/schema.sql');
    console.warn('   Detalle:', err.code || err.message);
  }
}

module.exports = { pool, testConnection };
