const test = require('node:test');
const assert = require('node:assert/strict');
const { lockoutKeys, PAIR_MAX_ATTEMPTS, USER_MAX_ATTEMPTS } = require('../utils/lockoutKeys');

test('genera una clave por pareja usuario+IP y otra general por usuario', () => {
  const [pair, user] = lockoutKeys('login', 'Admin', '203.0.113.7');
  assert.equal(pair.id, 'login:admin|203.0.113.7');
  assert.equal(pair.scope, 'pair');
  assert.equal(pair.max, PAIR_MAX_ATTEMPTS);
  assert.equal(user.id, 'login:admin');            // mismo formato que antes
  assert.equal(user.scope, 'user');
  assert.equal(user.max, USER_MAX_ATTEMPTS);
  assert.ok(USER_MAX_ATTEMPTS > PAIR_MAX_ATTEMPTS);
});

test('mayúsculas y espacios no crean claves distintas', () => {
  assert.deepEqual(lockoutKeys('login', '  ADMIN ', '1.1.1.1'), lockoutKeys('login', 'admin', '1.1.1.1'));
});

test('IPs distintas dan claves de pareja distintas pero la misma clave de usuario', () => {
  const a = lockoutKeys('login', 'admin', '1.1.1.1');
  const b = lockoutKeys('login', 'admin', '2.2.2.2');
  assert.notEqual(a[0].id, b[0].id);
  assert.equal(a[1].id, b[1].id);
});

test('sin IP usa un marcador', () => {
  assert.equal(lockoutKeys('login', 'admin', null)[0].id, 'login:admin|sin-ip');
});

test('prefijos distintos no se mezclan (login, pregunta de seguridad, estudiantes)', () => {
  const ids = ['login', 'secquestion', 'studentlogin'].map((p) => lockoutKeys(p, 'x', '1.1.1.1')[0].id);
  assert.equal(new Set(ids).size, 3);
});

test('un identificador larguísimo se acorta y nunca excede la columna (150)', () => {
  const longIdent = 'a'.repeat(500) + '@ejemplo.com';
  const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
  for (const key of lockoutKeys('studentlogin', longIdent, ipv6)) {
    assert.ok(key.id.length <= 150, `${key.id.length} caracteres`);
  }
  // y sigue siendo determinista
  assert.equal(lockoutKeys('login', longIdent, '1.1.1.1')[0].id, lockoutKeys('login', longIdent, '1.1.1.1')[0].id);
});
