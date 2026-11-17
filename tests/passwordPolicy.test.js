const test = require('node:test');
const assert = require('node:assert/strict');
const { isPasswordValid, generateSecurePassword, MIN_LENGTH } = require('../utils/passwordPolicy');

test('acepta una contraseña que cumple todas las reglas', () => {
  assert.equal(isPasswordValid('Biblio#2026'), true);
});

test('rechaza contraseñas vacías o ausentes', () => {
  assert.equal(isPasswordValid(''), false);
  assert.equal(isPasswordValid(undefined), false);
  assert.equal(isPasswordValid(null), false);
});

test('rechaza contraseñas más cortas que el mínimo', () => {
  assert.equal(isPasswordValid('Ab1!'), false);
  assert.equal(isPasswordValid('Abc1!ef'), false); // 7 caracteres
  assert.equal(isPasswordValid('Abc1!efg'.slice(0, MIN_LENGTH)), true);
});

test('exige mayúscula, número y carácter especial', () => {
  assert.equal(isPasswordValid('biblio#2026'), false); // sin mayúscula
  assert.equal(isPasswordValid('Biblio#abcd'), false); // sin número
  assert.equal(isPasswordValid('Biblio20260'), false); // sin especial
});

test('las contraseñas temporales generadas siempre cumplen la política', () => {
  for (let i = 0; i < 300; i++) {
    const pwd = generateSecurePassword();
    assert.equal(pwd.length, 10);
    assert.equal(isPasswordValid(pwd), true, `no cumple la política: ${pwd}`);
  }
});

test('las contraseñas temporales no se repiten', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(generateSecurePassword());
  assert.equal(seen.size, 100);
});
