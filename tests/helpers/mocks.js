// Objetos req/res mínimos para probar middleware sin levantar Express
// ni la base de datos.
function mockReq({ method = 'POST', headers = {}, originalUrl = '/formulario', ip = '203.0.113.7', withFlash = false } = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const req = {
    method,
    originalUrl,
    path: originalUrl.split('?')[0],
    ip,
    get: (name) => lower[name.toLowerCase()],
  };
  if (withFlash) {
    req.flashed = [];
    req.flash = (type, msg) => req.flashed.push([type, msg]);
  }
  return req;
}

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, redirectedTo: undefined, headersSent: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.type = () => res;
  res.send = (body) => { res.body = body; res.headersSent = true; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.setHeader = res.set;
  res.redirect = (a, b) => {
    if (typeof a === 'number') { res.statusCode = a; res.redirectedTo = b; } else { res.statusCode = 302; res.redirectedTo = a; }
    res.headersSent = true;
    return res;
  };
  return res;
}

// Ejecuta un middleware y dice si llamó a next().
function run(middleware, req, res) {
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return nextCalled;
}

module.exports = { mockReq, mockRes, run };
