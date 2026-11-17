// ============================================================
// Conexión a MySQL — pool de conexiones reutilizables.
// Cuando el colegio conecte su base de datos real, solo hace
// falta ajustar las variables de entorno en .env (ver .env.example)
// y, si las columnas tienen otros nombres, actualizar los SELECT
// en models/Book.js.
// ============================================================
require('dotenv').config();
const mysql = require('mysql2/promise');

// Railway (y otros PaaS) exponen la base de datos con sus propias
// variables (MYSQLHOST, MYSQLPORT, etc. si usas su plugin de MySQL).
// Se aceptan como respaldo de las variables DB_* de siempre, así el
// mismo código corre en local y en Railway sin tocar nada: en Railway
// basta con crear las variables DB_HOST, DB_USER, etc. en el servicio
// y apuntarlas a las del plugin de MySQL (ej. ${{MySQL.MYSQLHOST}}),
// o directamente dejar que estos respaldos las tomen si coinciden en
// nombre. Ver DEPLOY.md para el paso a paso.
const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  port: process.env.DB_PORT || process.env.MYSQLPORT || 3306,
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'biblioteca_virtual',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  charset: 'utf8mb4', // Evita que tildes/eñes se corrompan sin importar el charset por defecto del servidor
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

// Al arrancar en Railway, MySQL a veces tarda unos segundos más que la
// app en aceptar conexiones. Antes de migrar se reintenta unas veces en
// vez de rendirse al primer intento. Devuelve true si logró conectar.
async function waitForConnection({ retries = 6, delayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const conn = await pool.getConnection();
      conn.release();
      return true;
    } catch (err) {
      console.warn(`⚠️  MySQL aún no responde (intento ${attempt}/${retries}): ${err.code || err.message}`);
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

module.exports = { pool, testConnection, waitForConnection };
