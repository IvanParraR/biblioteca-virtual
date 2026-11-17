const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionStoreOptions, SESSION_MAX_AGE_MS } = require('../config/sessionStore');
const { sessionCookieOptions } = require('../middleware/security');

test('las sesiones guardadas vencen cuando vence la cookie', () => {
  assert.equal(SESSION_MAX_AGE_MS, sessionCookieOptions().maxAge);
  assert.equal(sessionStoreOptions().expiration, sessionCookieOptions().maxAge);
});

test('la tabla la crea la migración, no la librería', () => {
  const o = sessionStoreOptions();
  assert.equal(o.createDatabaseTable, false);
  assert.equal(o.schema.tableName, 'sessions');
  assert.equal(o.clearExpired, true);
});

test('la tabla `sessions` de la migración tiene las columnas que usa la librería', () => {
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '002_sessions_table.sql'), 'utf8');
  const { columnNames } = sessionStoreOptions().schema;
  for (const col of Object.values(columnNames)) assert.match(sql, new RegExp(`\\b${col}\\b`));
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sessions/);
});
