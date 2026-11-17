const test = require('node:test');
const assert = require('node:assert/strict');
const { isSvgSafe } = require('../utils/svgSafety');

const wrap = (inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`);

test('acepta un SVG simple', () => {
  assert.equal(isSvgSafe(wrap('<rect width="10" height="10" fill="#c00"/>')), true);
});

test('acepta referencias internas (#id) e imágenes data:', () => {
  assert.equal(isSvgSafe(wrap('<defs><g id="a"/></defs><use href="#a"/>')), true);
  assert.equal(isSvgSafe(wrap('<image href="data:image/png;base64,AAAA"/>')), true);
});

test('rechaza lo que no es un SVG', () => {
  assert.equal(isSvgSafe(Buffer.from('<html><body>hola</body></html>')), false);
  assert.equal(isSvgSafe(Buffer.from('')), false);
});

test('rechaza <script> en cualquier forma', () => {
  assert.equal(isSvgSafe(wrap('<script>alert(1)</script>')), false);
  assert.equal(isSvgSafe(wrap('<SCRIPT >alert(1)</SCRIPT>')), false);
});

test('rechaza handlers de eventos', () => {
  assert.equal(isSvgSafe(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')), false);
  assert.equal(isSvgSafe(wrap('<rect onclick="x()"/>')), false);
});

test('rechaza enlaces javascript: y href externos', () => {
  assert.equal(isSvgSafe(wrap('<a href="javascript:alert(1)"><rect/></a>')), false);
  assert.equal(isSvgSafe(wrap('<image href="https://sitio-malo.example/x.png"/>')), false);
  assert.equal(isSvgSafe(wrap('<a xlink:href="https://sitio-malo.example"><rect/></a>')), false);
});

test('rechaza HTML incrustado y entidades XML', () => {
  assert.equal(isSvgSafe(wrap('<foreignObject><iframe src="x"/></foreignObject>')), false);
  assert.equal(isSvgSafe(Buffer.from('<!DOCTYPE svg [<!ENTITY a "b">]><svg xmlns="http://www.w3.org/2000/svg"></svg>')), false);
});

test('no se deja engañar por un script escondido tras un SVG válido', () => {
  assert.equal(isSvgSafe(wrap('<rect/><g><SCRipt>x</SCRipt></g>')), false);
});
