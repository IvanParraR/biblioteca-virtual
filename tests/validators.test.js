const test = require('node:test');
const assert = require('node:assert/strict');
const { isPhoneValid, isGradeValid, GRADES } = require('../utils/validators');

test('el teléfono es opcional: vacío o solo espacios es válido', () => {
  assert.equal(isPhoneValid(''), true);
  assert.equal(isPhoneValid('   '), true);
  assert.equal(isPhoneValid(undefined), true);
});

test('acepta formatos de teléfono comunes', () => {
  assert.equal(isPhoneValid('3001234567'), true);
  assert.equal(isPhoneValid('+57 300 123 4567'), true);
  assert.equal(isPhoneValid('(605) 123-4567'), true);
});

test('rechaza teléfonos con letras, muy cortos o muy largos', () => {
  assert.equal(isPhoneValid('abc1234567'), false);
  assert.equal(isPhoneValid('12345'), false);
  assert.equal(isPhoneValid('1'.repeat(25)), false);
  assert.equal(isPhoneValid('300-123-4567 ext 9'), false);
});

test('el grado es opcional', () => {
  assert.equal(isGradeValid(''), true);
  assert.equal(isGradeValid(undefined), true);
});

test('acepta todos los grados de la lista y nada más', () => {
  for (const g of GRADES) assert.equal(isGradeValid(g), true, g);
  assert.equal(isGradeValid('12°'), false);
  assert.equal(isGradeValid('Décimo'), false);
});
