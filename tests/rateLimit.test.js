const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../middleware/rateLimit');
const { mockReq, mockRes, run } = require('./helpers/mocks');

function makeLimiter(extra = {}) {
  const clock = { t: 1_000_000 };
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, message: 'Demasiados intentos.', now: () => clock.t, ...extra });
  return { limiter, clock };
}

test('deja pasar hasta el máximo y bloquea el siguiente con 429', () => {
  const { limiter } = makeLimiter();
  for (let i = 0; i < 3; i++) assert.equal(run(limiter, mockReq(), mockRes()), true);
  const res = mockRes();
  assert.equal(run(limiter, mockReq(), res), false);
  assert.equal(res.statusCode, 429);
  assert.match(res.body, /Demasiados intentos\. Intenta de nuevo en 1 minuto\./);
  assert.ok(Number(res.headers['Retry-After']) > 0);
});

test('cada IP tiene su propio contador', () => {
  const { limiter } = makeLimiter();
  for (let i = 0; i < 4; i++) run(limiter, mockReq({ ip: '198.51.100.1' }), mockRes());
  assert.equal(run(limiter, mockReq({ ip: '198.51.100.2' }), mockRes()), true);
});

test('pasada la ventana se vuelve a permitir', () => {
  const { limiter, clock } = makeLimiter();
  for (let i = 0; i < 4; i++) run(limiter, mockReq(), mockRes());
  clock.t += 60_001;
  assert.equal(run(limiter, mockReq(), mockRes()), true);
});

test('con redirectTo y flash avisa en pantalla y redirige (303)', () => {
  const { limiter } = makeLimiter({ redirectTo: '/iniciar-sesion' });
  let res;
  for (let i = 0; i < 4; i++) { res = mockRes(); run(limiter, mockReq({ withFlash: true }), res); }
  const req = mockReq({ withFlash: true });
  res = mockRes();
  run(limiter, req, res);
  assert.equal(res.statusCode, 303);
  assert.equal(res.redirectedTo, '/iniciar-sesion');
  assert.equal(req.flashed[0][0], 'error');
});

test('redirectTo puede ser una función de la petición', () => {
  const { limiter } = makeLimiter({ redirectTo: (req) => (req.path.startsWith('/a') ? '/uno' : '/dos') });
  for (let i = 0; i < 3; i++) run(limiter, mockReq({ originalUrl: '/b' }), mockRes());
  const res = mockRes();
  run(limiter, mockReq({ originalUrl: '/b', withFlash: true }), res);
  assert.equal(res.redirectedTo, '/dos');
});

test('reset() limpia los contadores', () => {
  const { limiter } = makeLimiter();
  for (let i = 0; i < 4; i++) run(limiter, mockReq(), mockRes());
  limiter.reset();
  assert.equal(limiter.size(), 0);
  assert.equal(run(limiter, mockReq(), mockRes()), true);
});
