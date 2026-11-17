// ============================================================
// Ejecutor de migraciones — aplica solo, al arrancar, los .sql de
// database/migrations/ que todavía no se hayan corrido, en orden,
// y los anota en la tabla schema_migrations.
//
// Reglas:
//  - Archivos con nombre NNN_descripcion.sql (ej. 001_activity_log_actor.sql).
//  - Una migración ya aplicada NO se vuelve a ejecutar. Si alguien edita
//    un archivo ya aplicado, se avisa en el log (checksum distinto) pero
//    no se re-ejecuta: los cambios nuevos van en una migración nueva.
//  - Un GET_LOCK evita que dos instancias (deploys que se solapan)
//    migren a la vez.
//  - Si una sentencia falla porque el cambio YA existe (columna, índice
//    o tabla duplicados), se da por aplicada y se sigue: así una
//    migración que se cortó a la mitad puede reintentarse sin romperse.
//  - Cualquier otro error detiene la migración (y el arranque): Railway
//    mantiene la versión anterior en línea mientras el nuevo deploy no
//    pase el healthcheck.
//  - Las migraciones antiguas database/migrate_*.sql NO las toca este
//    ejecutor: asume que la base ya las tiene (ver README).
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATION_NAME = /^\d{3,}_[a-z0-9_]+\.sql$/;
const LOCK_NAME = 'biblioteca_virtual_migrations';

// Errores de MySQL que significan "esto ya estaba hecho".
const ALREADY_APPLIED_ERRNO = new Set([
  1050, // ER_TABLE_EXISTS_ERROR
  1060, // ER_DUP_FIELDNAME  (columna ya existe)
  1061, // ER_DUP_KEYNAME    (índice ya existe)
]);

function listMigrationFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => MIGRATION_NAME.test(f)).sort();
}

function checksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

// Parte un archivo SQL en sentencias separadas por ';', ignorando los
// ';' que están dentro de comentarios (-- y /* */) o de textos entre
// comillas. No soporta DELIMITER (no hace falta para migraciones simples).
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  let quote = null; // ' " `

  const flush = () => {
    const stmt = current.trim();
    if (stmt) statements.push(stmt);
    current = '';
  };

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (quote) {
      current += ch;
      if (ch === '\\' && quote !== '`' && next !== undefined) { current += next; i += 2; continue; }
      if (ch === quote) {
        if (next === quote) { current += next; i += 2; continue; } // comilla duplicada ''
        quote = null;
      }
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {            // comentario de línea
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '#') {                             // comentario estilo MySQL
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {             // comentario de bloque
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; current += ch; i += 1; continue; }
    if (ch === ';') { flush(); i += 1; continue; }

    current += ch;
    i += 1;
  }
  flush();
  return statements;
}

async function runMigrations(pool, { dir, logger = console } = {}) {
  const files = listMigrationFiles(dir);
  const conn = await pool.getConnection();
  const applied = [];
  let locked = false;

  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 60) AS got', [LOCK_NAME]);
    if (!lock.got) throw new Error('No se pudo obtener el bloqueo de migraciones (otra instancia está migrando).');
    locked = true;

    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name        VARCHAR(190) NOT NULL PRIMARY KEY,
         checksum    CHAR(64) NOT NULL,
         applied_at  DATETIME DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB`
    );
    const [rows] = await conn.query('SELECT name, checksum FROM schema_migrations');
    const done = new Map(rows.map((r) => [r.name, r.checksum]));

    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const sum = checksum(sql);

      if (done.has(file)) {
        if (done.get(file) !== sum) {
          logger.warn(`⚠️  La migración ${file} ya estaba aplicada pero su contenido cambió. No se vuelve a ejecutar; pon los cambios nuevos en una migración nueva.`);
        }
        continue;
      }

      logger.log(`🗄️  Aplicando migración ${file}...`);
      await conn.query('SET NAMES utf8mb4');
      for (const statement of splitStatements(sql)) {
        try {
          await conn.query(statement);
        } catch (err) {
          if (ALREADY_APPLIED_ERRNO.has(err.errno)) {
            logger.log(`   (ya existía, se omite: ${err.code})`);
            continue;
          }
          throw new Error(`Falló la migración ${file}: ${err.message}\n   Sentencia: ${statement.slice(0, 200)}`);
        }
      }
      await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [file, sum]);
      applied.push(file);
    }

    if (applied.length === 0) logger.log('🗄️  Base de datos al día (sin migraciones pendientes).');
    else logger.log(`🗄️  Migraciones aplicadas: ${applied.join(', ')}`);
    return applied;
  } finally {
    if (locked) {
      try { await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]); } catch (e) { /* se libera sola al cerrar la conexión */ }
    }
    conn.release();
  }
}

module.exports = { runMigrations, listMigrationFiles, splitStatements, checksum, MIGRATION_NAME, ALREADY_APPLIED_ERRNO };
