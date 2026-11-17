const test = require('node:test');
const assert = require('node:assert/strict');
const { errorHandler, friendlyMessage, backTarget, GENERIC_MESSAGE } = require('../middleware/errorHandler');
const { userError } = require('../utils/userError');
const { mockReq, mockRes } = require('./helpers/mocks');

// El manejador hace console.error del error real; en las pruebas lo silenciamos.
test.beforeEach((t) => { t.mock.method(console, 'error', () => {}); });

test('un error interno NO muestra su mensaje al usuario', () => {
  const err = new Error("ER_BAD_FIELD_ERROR: Unknown column 'x' in 'field list' en /app/models/Book.js");
  assert.equal(friendlyMessage(err), GENERIC_MESSAGE);
});

test('un userError sí muestra su mensaje', () => {
  assert.equal(friendlyMessage(userError('Formato de imagen no permitido.')), 'Formato de imagen no permitido.');
});

test('los errores de Multer se traducen a mensajes amables', () => {
  const big = Object.assign(new Error('File too large'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' });
  assert.equal(friendlyMessage(big), 'El archivo es demasiado grande.');
  const other = Object.assign(new Error('x'), { name: 'MulterError', code: 'OTRO' });
  assert.equal(friendlyMessage(other), 'No se pudo procesar el archivo subido.');
});

test('POST vuelve a la página de origen si es del mismo sitio', () => {
  const req = mockReq({ headers: { Host: 'sitio.example', Referer: 'https://sitio.example/admin/books/new?x=1' } });
  assert.equal(backTarget(req), '/admin/books/new?x=1');
});

test('POST con Referer de otro sitio o sin él va al inicio', () => {
  assert.equal(backTarget(mockReq({ headers: { Host: 'sitio.example', Referer: 'https://otro.example/x' } })), '/');
  assert.equal(backTarget(mockReq({ headers: { Host: 'sitio.example' } })), '/');
  assert.equal(backTarget(mockReq({ headers: { Host: 'sitio.example', Referer: 'no-es-url' } })), '/');
});

test('GET siempre va al inicio (evita bucles)', () => {
  const req = mockReq({ method: 'GET', headers: { Host: 'sitio.example', Referer: 'https://sitio.example/admin' } });
  assert.equal(backTarget(req), '/');
});

test('errorHandler avisa con flash genérico y redirige', () => {
  const req = mockReq({ withFlash: true, headers: { Host: 'sitio.example', Referer: 'https://sitio.example/admin/books' } });
  const res = mockRes();
  errorHandler(new Error('detalle interno secreto'), req, res, () => {});
  assert.equal(res.redirectedTo, '/admin/books');
  assert.deepEqual(req.flashed, [['error', GENERIC_MESSAGE]]);
});

test('si el destino sería la misma URL que falló, responde 500 en vez de redirigir en bucle', () => {
  const req = mockReq({ method: 'GET', originalUrl: '/', withFlash: true });
  const res = mockRes();
  errorHandler(new Error('boom'), req, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.redirectedTo, undefined);
  assert.equal(res.body, GENERIC_MESSAGE);
});

test('si ya se enviaron cabeceras delega en el siguiente manejador', () => {
  const res = mockRes();
  res.headersSent = true;
  let delegated = null;
  errorHandler(new Error('x'), mockReq(), res, (e) => { delegated = e; });
  assert.ok(delegated);
});
