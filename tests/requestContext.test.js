const test = require('node:test');
const assert = require('node:assert/strict');
const rc = require('../utils/requestContext');
const { mockReq, mockRes } = require('./helpers/mocks');

test('clientIp quita el prefijo IPv4-en-IPv6 y limita el largo', () => {
  assert.equal(rc.clientIp({ ip: '::ffff:203.0.113.7' }), '203.0.113.7');
  assert.equal(rc.clientIp({ ip: '2001:db8::1' }), '2001:db8::1');
  assert.equal(rc.clientIp({}), null);
  assert.equal(rc.clientIp({ ip: 'x'.repeat(100) }).length, 45);
});

test('clientMeta toma IP y user-agent (recortado a 255)', () => {
  const req = mockReq({ ip: '::ffff:198.51.100.4', headers: { 'User-Agent': 'Mozilla/5.0 ' + 'x'.repeat(400) } });
  const meta = rc.clientMeta(req);
  assert.equal(meta.ip, '198.51.100.4');
  assert.equal(meta.userAgent.length, 255);
  assert.deepEqual(rc.clientMeta(mockReq({ ip: '1.2.3.4' })), { ip: '1.2.3.4', userAgent: null });
});

test('fuera de una petición no hay contexto (valores nulos, sin error)', () => {
  assert.deepEqual(rc.current(), { ip: null, userAgent: null });
});

test('dentro del middleware el contexto sobrevive a los await', async () => {
  const req = mockReq({ ip: '203.0.113.9', headers: { 'User-Agent': 'TestAgent/1.0' } });
  const seen = await new Promise((resolve) => {
    rc.middleware(req, mockRes(), async () => {
      await new Promise((r) => setTimeout(r, 5));
      await Promise.resolve();
      resolve(rc.current());
    });
  });
  assert.deepEqual(seen, { ip: '203.0.113.9', userAgent: 'TestAgent/1.0' });
  assert.deepEqual(rc.current(), { ip: null, userAgent: null }); // y no se filtra afuera
});

test('dos peticiones simultáneas no mezclan su contexto', async () => {
  const run = (ip, delay) => new Promise((resolve) => {
    rc.middleware(mockReq({ ip }), mockRes(), async () => {
      await new Promise((r) => setTimeout(r, delay));
      resolve(rc.current().ip);
    });
  });
  const [a, b] = await Promise.all([run('1.1.1.1', 20), run('2.2.2.2', 1)]);
  assert.equal(a, '1.1.1.1');
  assert.equal(b, '2.2.2.2');
});

test('sanitizeLoginIdentifier conserva usuarios y correos, en minúsculas', () => {
  assert.equal(rc.sanitizeLoginIdentifier('Admin'), 'admin');
  assert.equal(rc.sanitizeLoginIdentifier(' Ana.Perez+x@Gmail.com '), 'ana.perez+x@gmail.com');
});

test('sanitizeLoginIdentifier descarta lo que parece una contraseña o basura', () => {
  assert.equal(rc.sanitizeLoginIdentifier('Mi Clave Secreta 1'), null); // espacios
  assert.equal(rc.sanitizeLoginIdentifier('Cl4ve!Segura#'), null);      // símbolos de contraseña
  assert.equal(rc.sanitizeLoginIdentifier('a'.repeat(65)), null);       // demasiado largo
  assert.equal(rc.sanitizeLoginIdentifier(''), null);
  assert.equal(rc.sanitizeLoginIdentifier(undefined), null);
  assert.equal(rc.sanitizeLoginIdentifier("' OR 1=1 --"), null);
});
