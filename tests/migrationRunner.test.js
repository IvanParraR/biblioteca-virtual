const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { splitStatements, listMigrationFiles, checksum, runMigrations } = require('../utils/migrationRunner');

const silent = { log() {}, warn() {} };

// ---------- splitStatements ----------
test('separa varias sentencias por ;', () => {
  assert.deepEqual(splitStatements('SELECT 1; SELECT 2;'), ['SELECT 1', 'SELECT 2']);
});

test('la última sentencia no necesita ;', () => {
  assert.deepEqual(splitStatements('SELECT 1;\nSELECT 2'), ['SELECT 1', 'SELECT 2']);
});

test('ignora ; dentro de comentarios', () => {
  const sql = '-- paso 1; importante\nSELECT 1; /* nota; con punto y coma */ SELECT 2; # otro; comentario\nSELECT 3;';
  assert.deepEqual(splitStatements(sql), ['SELECT 1', 'SELECT 2', 'SELECT 3']);
});

test('ignora ; dentro de textos entre comillas y respeta comillas escapadas', () => {
  const sql = "INSERT INTO t (a) VALUES ('uno; dos'); INSERT INTO t (a) VALUES ('it''s; fine'); INSERT INTO t (a) VALUES (\"x;y\");";
  assert.equal(splitStatements(sql).length, 3);
  assert.ok(splitStatements(sql)[1].includes("it''s; fine"));
});

test('un hash bcrypt con $ y / dentro de comillas no se rompe', () => {
  const sql = "UPDATE admins SET must_change_password = 1 WHERE password_hash = '$2a$10$pSl5YAcRdw2NzKnTfzemTeQ4.7u/mjs1Uan17UdGQhv1HZzbsKFIq';";
  const out = splitStatements(sql);
  assert.equal(out.length, 1);
  assert.ok(out[0].includes('$2a$10$pSl5'));
});

test('archivo vacío o solo comentarios no produce sentencias', () => {
  assert.deepEqual(splitStatements(''), []);
  assert.deepEqual(splitStatements('-- nada\n/* nada */\n'), []);
});

// ---------- listMigrationFiles ----------
test('lista solo archivos NNN_nombre.sql, en orden', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const f of ['002_b.sql', '001_a.sql', '010_c.sql', 'README.md', 'notas.sql', '1_mal.sql', '003_Mayus.sql']) {
    fs.writeFileSync(path.join(dir, f), 'SELECT 1;');
  }
  assert.deepEqual(listMigrationFiles(dir), ['001_a.sql', '002_b.sql', '010_c.sql']);
});

test('una carpeta que no existe da lista vacía', () => {
  assert.deepEqual(listMigrationFiles('/ruta/que/no/existe'), []);
});

test('el checksum es estable y cambia con el contenido', () => {
  assert.equal(checksum('a'), checksum('a'));
  assert.notEqual(checksum('a'), checksum('b'));
  assert.equal(checksum('a').length, 64);
});

// ---------- runMigrations con una conexión simulada ----------
function fakePool({ applied = [], failOn = null } = {}) {
  const calls = [];
  const state = { released: false };
  const conn = {
    async query(sql, params) {
      calls.push({ sql: String(sql).trim(), params });
      if (/GET_LOCK/.test(sql)) return [[{ got: 1 }]];
      if (/SELECT name, checksum FROM schema_migrations/.test(sql)) return [applied];
      if (failOn && failOn.test(sql)) {
        const err = new Error(failOn.message || 'fallo simulado');
        err.errno = failOn.errno; err.code = failOn.code;
        throw err;
      }
      return [[]];
    },
    release() { state.released = true; },
  };
  return { pool: { getConnection: async () => conn }, calls, state };
}

function tempMigrations(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

test('aplica las pendientes en orden y las anota', async () => {
  const dir = tempMigrations({ '002_b.sql': 'CREATE TABLE b (id INT);', '001_a.sql': 'CREATE TABLE a (id INT); CREATE TABLE a2 (id INT);' });
  const { pool, calls, state } = fakePool();
  const applied = await runMigrations(pool, { dir, logger: silent });

  assert.deepEqual(applied, ['001_a.sql', '002_b.sql']);
  const ddl = calls.map((c) => c.sql).filter((s) => s.startsWith('CREATE TABLE a') || s.startsWith('CREATE TABLE b'));
  assert.deepEqual(ddl, ['CREATE TABLE a (id INT)', 'CREATE TABLE a2 (id INT)', 'CREATE TABLE b (id INT)']);
  const recorded = calls.filter((c) => /INSERT INTO schema_migrations/.test(c.sql)).map((c) => c.params[0]);
  assert.deepEqual(recorded, ['001_a.sql', '002_b.sql']);
  assert.equal(state.released, true);
  assert.ok(calls.some((c) => /RELEASE_LOCK/.test(c.sql)), 'debe liberar el bloqueo');
});

test('no vuelve a ejecutar una migración ya aplicada', async () => {
  const sql = 'CREATE TABLE a (id INT);';
  const dir = tempMigrations({ '001_a.sql': sql });
  const { pool, calls } = fakePool({ applied: [{ name: '001_a.sql', checksum: checksum(sql) }] });
  const applied = await runMigrations(pool, { dir, logger: silent });
  assert.deepEqual(applied, []);
  assert.ok(!calls.some((c) => c.sql.startsWith('CREATE TABLE a ')));
});

test('avisa si una migración ya aplicada cambió de contenido, sin ejecutarla', async () => {
  const dir = tempMigrations({ '001_a.sql': 'CREATE TABLE a (id INT, extra INT);' });
  const { pool } = fakePool({ applied: [{ name: '001_a.sql', checksum: 'otro-checksum' }] });
  const warnings = [];
  const applied = await runMigrations(pool, { dir, logger: { log() {}, warn: (m) => warnings.push(m) } });
  assert.deepEqual(applied, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /001_a\.sql/);
});

test('"columna duplicada" se da por aplicada y se continúa', async () => {
  const dir = tempMigrations({ '001_a.sql': 'ALTER TABLE t ADD COLUMN x INT; ALTER TABLE t ADD COLUMN y INT;' });
  const failOn = Object.assign(/ADD COLUMN x/, { errno: 1060, code: 'ER_DUP_FIELDNAME' });
  const { pool, calls } = fakePool({ failOn });
  const applied = await runMigrations(pool, { dir, logger: silent });
  assert.deepEqual(applied, ['001_a.sql']);
  assert.ok(calls.some((c) => /ADD COLUMN y/.test(c.sql)), 'debe seguir con la siguiente sentencia');
});

test('cualquier otro error detiene la migración, no la anota y libera la conexión', async () => {
  const dir = tempMigrations({ '001_a.sql': 'ALTER TABLE t ADD COLUMN x INT;', '002_b.sql': 'CREATE TABLE b (id INT);' });
  const failOn = Object.assign(/ADD COLUMN x/, { errno: 1146, code: 'ER_NO_SUCH_TABLE', message: "Table 't' doesn't exist" });
  const { pool, calls, state } = fakePool({ failOn });
  await assert.rejects(() => runMigrations(pool, { dir, logger: silent }), /Falló la migración 001_a\.sql/);
  assert.ok(!calls.some((c) => /INSERT INTO schema_migrations/.test(c.sql)));
  assert.ok(!calls.some((c) => c.sql.startsWith('CREATE TABLE b')), 'no debe seguir con la siguiente');
  assert.equal(state.released, true);
  assert.ok(calls.some((c) => /RELEASE_LOCK/.test(c.sql)));
});

// ---------- las migraciones reales del proyecto ----------
const realDir = path.join(__dirname, '..', 'database', 'migrations');

test('las migraciones del proyecto están numeradas sin saltos ni repetidos', () => {
  const files = listMigrationFiles(realDir);
  assert.ok(files.length >= 3);
  files.forEach((f, i) => assert.equal(Number(f.slice(0, 3)), i + 1, `salto o repetido en ${f}`));
});

test('las migraciones del proyecto no usan USE, DROP ni TRUNCATE', () => {
  for (const f of listMigrationFiles(realDir)) {
    const statements = splitStatements(fs.readFileSync(path.join(realDir, f), 'utf8'));
    assert.ok(statements.length > 0, `${f} está vacía`);
    for (const st of statements) {
      assert.doesNotMatch(st, /^\s*USE\s/i, `${f} usa USE (el nombre de la base varía en Railway)`);
      assert.doesNotMatch(st, /\bDROP\s+(TABLE|DATABASE|COLUMN)\b|\bTRUNCATE\b/i, `${f} tiene una sentencia destructiva`);
    }
  }
});

test('schema.sql ya no crea un administrador con contraseña conocida', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  assert.doesNotMatch(schema, /INSERT INTO admins/i);
  assert.doesNotMatch(schema, /biblioteca123/);
});
