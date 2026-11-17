const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveSessionSecret, isProduction, sessionCookieOptions, helmetOptions,
  sameOriginOnly, uploadsStaticHeaders, UPLOADS_CSP,
} = require('../middleware/security');
const { mockReq, mockRes, run } = require('./helpers/mocks');

// ---------- SESSION_SECRET ----------
test('en desarrollo el secreto es opcional', () => {
  assert.ok(resolveSessionSecret({}));
  assert.equal(resolveSessionSecret({ SESSION_SECRET: 'otro-secreto' }), 'otro-secreto');
});

test('en producción rechaza secreto ausente, de ejemplo o corto', () => {
  assert.throws(() => resolveSessionSecret({ NODE_ENV: 'production' }), /SESSION_SECRET/);
  assert.throws(() => resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: 'cambia-esta-clave-por-una-segura' }), /SESSION_SECRET/);
  assert.throws(() => resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: 'corta' }), /SESSION_SECRET/);
});

test('en producción acepta un secreto largo', () => {
  const secret = 'x'.repeat(40);
  assert.equal(resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: secret }), secret);
});

test('detecta producción también por las variables de Railway', () => {
  assert.equal(isProduction({ RAILWAY_ENVIRONMENT_NAME: 'production' }), true);
  assert.equal(isProduction({ RAILWAY_ENVIRONMENT: 'production' }), true);
  assert.equal(isProduction({}), false);
  assert.throws(() => resolveSessionSecret({ RAILWAY_ENVIRONMENT_NAME: 'production' }), /SESSION_SECRET/);
});

test('la cookie de sesión es httpOnly, sameSite lax y secure automática', () => {
  const c = sessionCookieOptions();
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, 'lax');
  assert.equal(c.secure, 'auto');
  assert.ok(c.maxAge > 0);
});

// ---------- helmet ----------
test('la CSP arranca en modo solo reporte', () => {
  assert.equal(helmetOptions({}).contentSecurityPolicy.reportOnly, true);
  assert.equal(helmetOptions({ CSP_ENFORCE: 'false' }).contentSecurityPolicy.reportOnly, true);
});

test('CSP_ENFORCE=true activa la CSP', () => {
  assert.equal(helmetOptions({ CSP_ENFORCE: 'true' }).contentSecurityPolicy.reportOnly, false);
});

test('Referrer-Policy deja pasar Origin en los POST del mismo sitio', () => {
  // 'no-referrer' (el valor por defecto de helmet) haría que el navegador
  // omita Origin y sameOriginOnly rechazaría todos los formularios.
  assert.equal(helmetOptions({}).referrerPolicy.policy, 'strict-origin-when-cross-origin');
});

test('la CSP permite lo que usan las vistas (inline, Google Fonts, imágenes https)', () => {
  const d = helmetOptions({}).contentSecurityPolicy.directives;
  assert.ok(d.scriptSrc.includes("'unsafe-inline'"));
  assert.ok(d.scriptSrcAttr.includes("'unsafe-inline'"));
  assert.ok(d.styleSrc.includes('https://fonts.googleapis.com'));
  assert.ok(d.fontSrc.includes('https://fonts.gstatic.com'));
  assert.ok(d.imgSrc.includes('https:'));
  assert.deepEqual(d.frameAncestors, ["'none'"]);
});

// ---------- archivos subidos ----------
test('los archivos de /uploads se sirven con CSP sandbox', () => {
  const res = mockRes();
  uploadsStaticHeaders(res, '/app/public/uploads/covers/123.svg');
  assert.equal(res.headers['Content-Security-Policy'], UPLOADS_CSP);
  assert.match(UPLOADS_CSP, /sandbox/);
});

test('los archivos estáticos fuera de /uploads no reciben esa política', () => {
  const res = mockRes();
  uploadsStaticHeaders(res, '/app/public/css/style.css');
  assert.equal(res.headers['Content-Security-Policy'], undefined);
});

test('funciona con rutas de Windows', () => {
  const res = mockRes();
  uploadsStaticHeaders(res, 'C:\\proyecto\\public\\uploads\\covers\\1.svg');
  assert.equal(res.headers['Content-Security-Policy'], UPLOADS_CSP);
});

// ---------- CSRF por Origin/Referer ----------
const HOST = 'biblioteca.example.com';
const noLog = () => {};

test('GET pasa siempre, aunque no traiga Origin', () => {
  const mw = sameOriginOnly({ logger: noLog });
  assert.equal(run(mw, mockReq({ method: 'GET', headers: { Host: HOST } }), mockRes()), true);
});

test('POST con Origin del propio sitio pasa', () => {
  const mw = sameOriginOnly({ logger: noLog });
  const req = mockReq({ headers: { Host: HOST, Origin: `https://${HOST}` } });
  assert.equal(run(mw, req, mockRes()), true);
});

test('POST con Referer del propio sitio pasa (si no hay Origin)', () => {
  const mw = sameOriginOnly({ logger: noLog });
  const req = mockReq({ headers: { Host: HOST, Referer: `https://${HOST}/admin/books` } });
  assert.equal(run(mw, req, mockRes()), true);
});

test('POST con Origin de otro sitio se rechaza con 403 y se registra', () => {
  const logs = [];
  const mw = sameOriginOnly({ logger: (m) => logs.push(m) });
  const req = mockReq({ originalUrl: '/admin/books/5/delete', headers: { Host: HOST, Origin: 'https://sitio-malo.example' } });
  const res = mockRes();
  assert.equal(run(mw, req, res), false);
  assert.equal(res.statusCode, 403);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[CSRF\].*POST \/admin\/books\/5\/delete.*sitio-malo\.example/);
});

test('POST sin Origin ni Referer se rechaza y se registra', () => {
  const logs = [];
  const mw = sameOriginOnly({ logger: (m) => logs.push(m) });
  const res = mockRes();
  assert.equal(run(mw, mockReq({ headers: { Host: HOST } }), res), false);
  assert.equal(res.statusCode, 403);
  assert.match(logs[0], /sin Origin ni Referer/);
});

test('Origin "null" (documento aislado) se rechaza', () => {
  const mw = sameOriginOnly({ logger: noLog });
  const res = mockRes();
  assert.equal(run(mw, mockReq({ headers: { Host: HOST, Origin: 'null' } }), res), false);
  assert.equal(res.statusCode, 403);
});

test('un host que solo se parece al del sitio no engaña la comparación', () => {
  const mw = sameOriginOnly({ logger: noLog });
  const req = mockReq({ headers: { Host: HOST, Origin: `https://${HOST}.sitio-malo.example` } });
  assert.equal(run(mw, req, mockRes()), false);
});

test('PUT y DELETE también se verifican', () => {
  const mw = sameOriginOnly({ logger: noLog });
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    assert.equal(run(mw, mockReq({ method, headers: { Host: HOST } }), mockRes()), false, method);
  }
});

test('acepta el host original detrás del proxy (X-Forwarded-Host)', () => {
  const mw = sameOriginOnly({ logger: noLog });
  const req = mockReq({ headers: { Host: 'interno:8080', 'X-Forwarded-Host': HOST, Origin: `https://${HOST}` } });
  assert.equal(run(mw, req, mockRes()), true);
});

test('acepta hosts extra configurados (APP_URL)', () => {
  const mw = sameOriginOnly({ allowedHosts: ['dominio-propio.example'], logger: noLog });
  const req = mockReq({ headers: { Host: HOST, Origin: 'https://dominio-propio.example' } });
  assert.equal(run(mw, req, mockRes()), true);
});
