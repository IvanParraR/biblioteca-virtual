const test = require('node:test');
const assert = require('node:assert/strict');
const { nameToApaInitial, formatAuthorsApa } = require('../utils/apaCitation');

test('un nombre se convierte en "Apellido, I."', () => {
  assert.equal(nameToApaInitial('Gabriel García Márquez'), 'Márquez, G. G.');
  assert.equal(nameToApaInitial('Isabel Allende'), 'Allende, I.');
});

test('un solo nombre se deja tal cual y vacío da cadena vacía', () => {
  assert.equal(nameToApaInitial('Homero'), 'Homero');
  assert.equal(nameToApaInitial('   '), '');
  assert.equal(nameToApaInitial(undefined), '');
});

test('sin autores devuelve "Autor desconocido"', () => {
  assert.equal(formatAuthorsApa([]), 'Autor desconocido');
  assert.equal(formatAuthorsApa(undefined), 'Autor desconocido');
  assert.equal(formatAuthorsApa([null, '']), 'Autor desconocido');
});

test('un autor y dos autores', () => {
  assert.equal(formatAuthorsApa(['Isabel Allende']), 'Allende, I.');
  assert.equal(formatAuthorsApa(['Isabel Allende', 'Mario Vargas Llosa']), 'Allende, I., & Llosa, M. V.');
});

test('tres autores usan coma y "&" antes del último', () => {
  assert.equal(
    formatAuthorsApa(['Ana Pérez', 'Luis Gómez', 'Sofía Ruiz']),
    'Pérez, A., Gómez, L., & Ruiz, S.'
  );
});

test('hasta 20 autores se listan todos', () => {
  const authors = Array.from({ length: 20 }, (_, i) => `Nombre Apellido${i + 1}`);
  const result = formatAuthorsApa(authors);
  assert.ok(result.includes('Apellido1,'));
  assert.ok(result.includes('& Apellido20, N.'));
  assert.ok(!result.includes('...'));
});

test('más de 20 autores: 19 + "..." + el último', () => {
  const authors = Array.from({ length: 25 }, (_, i) => `Nombre Apellido${i + 1}`);
  const result = formatAuthorsApa(authors);
  assert.ok(result.includes('Apellido19, N.'));
  assert.ok(result.includes(', ... Apellido25, N.'));
  assert.ok(!result.includes('Apellido20'));
});
