// ============================================================
// Sesiones guardadas en MySQL (tabla `sessions`, creada por la
// migración 002) en vez de en la memoria del proceso: un reinicio o un
// deploy en Railway ya no cierra la sesión de todos.
// ============================================================
const { sessionCookieOptions } = require('../middleware/security');

// Las sesiones vencen cuando vence la cookie: misma fuente para ambos.
const SESSION_MAX_AGE_MS = sessionCookieOptions().maxAge;

function sessionStoreOptions(maxAgeMs = SESSION_MAX_AGE_MS) {
  return {
    // La tabla la crea la migración 002_sessions_table.sql (así todo el
    // esquema pasa por el mismo ejecutor de migraciones).
    createDatabaseTable: false,
    schema: {
      tableName: 'sessions',
      columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' },
    },
    expiration: maxAgeMs,            // las sesiones vencen cuando vence la cookie
    clearExpired: true,              // borra las vencidas...
    checkExpirationInterval: 15 * 60 * 1000, // ...cada 15 minutos
  };
}

function createSessionStore(session) {
  // Se cargan aquí (no arriba) para poder probar sessionStoreOptions()
  // sin la librería ni una conexión a MySQL.
  const MySQLStore = require('express-mysql-session')(session);
  const { pool } = require('./db');
  return new MySQLStore(sessionStoreOptions(), pool);
}

module.exports = { createSessionStore, sessionStoreOptions, SESSION_MAX_AGE_MS };
