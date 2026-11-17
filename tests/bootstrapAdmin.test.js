const test = require('node:test');
const assert = require('node:assert/strict');
const { readBootstrapConfig, ensureInitialAdmin } = require('../utils/bootstrapAdmin');

const silent = () => ({ lines: [], log(m) { this.lines.push(['log', m]); }, warn(m) { this.lines.push(['warn', m]); } });
const goodEnv = { INITIAL_ADMIN_USERNAME: 'gestor.biblio', INITIAL_ADMIN_PASSWORD: 'Clave#Segura1' };

test('sin variables no hay configuración (y se marca como ausente)', () => {
  const c = readBootstrapConfig({});
  assert.equal(c.ok, false);
  assert.equal(c.missing, true);
});

test('falta una de las dos variables', () => {
  assert.equal(readBootstrapConfig({ INITIAL_ADMIN_USERNAME: 'gestor' }).ok, false);
  assert.equal(readBootstrapConfig({ INITIAL_ADMIN_PASSWORD: 'Clave#Segura1' }).ok, false);
});

test('rechaza contraseñas que no cumplen la política', () => {
  const c = readBootstrapConfig({ ...goodEnv, INITIAL_ADMIN_PASSWORD: 'biblioteca123' });
  assert.equal(c.ok, false);
  assert.match(c.reason, /política/);
});

test('rechaza nombres de usuario inválidos', () => {
  for (const bad of ['ab', 'con espacio', "a'; DROP", 'x'.repeat(101)]) {
    assert.equal(readBootstrapConfig({ ...goodEnv, INITIAL_ADMIN_USERNAME: bad }).ok, false, bad);
  }
});

test('configuración válida, con nombre por defecto', () => {
  const c = readBootstrapConfig(goodEnv);
  assert.equal(c.ok, true);
  assert.equal(c.username, 'gestor.biblio');
  assert.equal(c.fullName, 'Administrador de Biblioteca');
  assert.equal(readBootstrapConfig({ ...goodEnv, INITIAL_ADMIN_NAME: ' Ana Pérez ' }).fullName, 'Ana Pérez');
});

function fakePool(total) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return /COUNT/.test(sql) ? [[{ total }]] : [{}]; } };
}

test('si ya hay administradores no crea nada', async () => {
  const pool = fakePool(2);
  const logger = silent();
  const r = await ensureInitialAdmin(pool, goodEnv, logger, { hash: async () => 'x' });
  assert.equal(r.created, false);
  assert.equal(pool.calls.length, 1); // solo el COUNT
});

test('tabla vacía + variables válidas: crea un gestor con cambio de contraseña obligatorio', async () => {
  const pool = fakePool(0);
  const r = await ensureInitialAdmin(pool, goodEnv, silent(), { hash: async (p) => `hash(${p})` });
  assert.deepEqual(r, { created: true, username: 'gestor.biblio' });
  const insert = pool.calls[1];
  assert.match(insert.sql, /INSERT INTO admins/);
  assert.match(insert.sql, /can_manage_admins, must_change_password/);
  assert.match(insert.sql, /VALUES \(\?, \?, \?, 1, 1\)/); // gestor y cambio obligatorio
  assert.equal(insert.params[0], 'gestor.biblio');
  assert.equal(insert.params[1], 'hash(Clave#Segura1)');  // nunca la contraseña en claro
});

test('tabla vacía sin variables: avisa en el log y no crea nada', async () => {
  const pool = fakePool(0);
  const logger = silent();
  const r = await ensureInitialAdmin(pool, {}, logger, { hash: async () => 'x' });
  assert.equal(r.created, false);
  assert.equal(pool.calls.length, 1);
  assert.ok(logger.lines.some(([level, m]) => level === 'warn' && /INITIAL_ADMIN_USERNAME/.test(m)));
});

test('la contraseña nunca se escribe en el log', async () => {
  const logger = silent();
  await ensureInitialAdmin(fakePool(0), goodEnv, logger, { hash: async () => 'h' });
  assert.ok(logger.lines.every(([, m]) => !m.includes('Clave#Segura1')));
});
