const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildLoanableSearch, parseWords, escapeLike, MAX_WORDS } = require('../utils/loanableSearch');

test('sin texto no hay búsqueda', () => {
  assert.equal(buildLoanableSearch(''), null);
  assert.equal(buildLoanableSearch('   '), null);
  assert.equal(buildLoanableSearch(undefined), null);
});

test('una palabra: busca en título, autor e ISBN y solo libros prestables', () => {
  const s = buildLoanableSearch('cien');
  assert.match(s.whereSql, /b\.available_copies > 0/);
  assert.match(s.whereSql, /b\.library_only = 0/);
  assert.match(s.whereSql, /b\.title LIKE \? OR b\.author LIKE \? OR b\.isbn LIKE \?/);
  assert.deepEqual(s.whereParams, ['%cien%', '%cien%', '%cien%']);
});

test('varias palabras: cada una debe aparecer (en cualquier orden y campo)', () => {
  const s = buildLoanableSearch('garcia marquez cien');
  assert.equal((s.whereSql.match(/b\.title LIKE/g) || []).length, 3);
  assert.equal(s.whereParams.length, 9);
  assert.deepEqual(s.whereParams.slice(0, 3), ['%garcia%', '%garcia%', '%garcia%']);
  assert.deepEqual(s.whereParams.slice(6, 9), ['%cien%', '%cien%', '%cien%']);
});

test('espacios de más no crean palabras vacías', () => {
  assert.deepEqual(parseWords('  cien    años  '), ['cien', 'años']);
});

test('limita la cantidad de palabras para no armar consultas enormes', () => {
  const words = parseWords('a b c d e f g h i j');
  assert.equal(words.length, MAX_WORDS);
  assert.equal(buildLoanableSearch('a b c d e f g h').whereParams.length, MAX_WORDS * 3);
});

test('los comodines que escribe el usuario se tratan como texto', () => {
  assert.equal(escapeLike('100%'), '100\\%');
  assert.equal(escapeLike('a_b'), 'a\\_b');
  assert.equal(escapeLike('a\\b'), 'a\\\\b');
  const s = buildLoanableSearch('%');
  assert.deepEqual(s.whereParams, ['%\\%%', '%\\%%', '%\\%%']); // no devuelve "todo"
});

test('el orden prioriza los títulos que EMPIEZAN con lo escrito', () => {
  const s = buildLoanableSearch('Cien años');
  assert.equal(s.phraseLike, 'Cien años%');
  assert.equal(s.firstWordLike, 'Cien%');
});

test('nunca mete lo escrito dentro del SQL, solo como parámetros', () => {
  const s = buildLoanableSearch("x'; DROP TABLE books; --");
  assert.doesNotMatch(s.whereSql, /DROP|--|x'/);
});

// ---------- la vista ----------
const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin', 'new-loan.ejs'), 'utf8');

test('el formulario ya no depende de una lista desplegable con todos los libros', () => {
  assert.doesNotMatch(view, /<select id="book_id"/);
  assert.doesNotMatch(view, /books\.forEach|books\.length|preselectedBookId/);
  assert.match(view, /\/admin\/loans\/available-books/);
});

test('todo texto que viene del servidor se escapa antes de entrar como HTML', () => {
  // En cada renderItem, quitando las llamadas a escapeHtml(...), no debe
  // quedar ningún campo de libro/estudiante suelto.
  const blocks = [...view.matchAll(/renderItem:\s*function \((\w+)\) \{([\s\S]*?)\n\s{8}\},/g)];
  assert.equal(blocks.length, 2, 'esperaba el renderItem de libros y el de estudiantes');
  for (const [, param, body] of blocks) {
    // Se ignoran las llamadas a escapeHtml(...) y las condiciones tipo
    // "b.isbn ? ... : ..." (ahí el campo se evalúa, no se imprime).
    const withoutEscaped = body
      .replace(/escapeHtml\([^)]*\)/g, '')
      .replace(new RegExp(`\\b${param}\\.\\w+\\s*\\?`, 'g'), '');
    const raw = withoutEscaped.match(new RegExp(`\\b${param}\\.(title|author|isbn|full_name|student_code|grade)\\b`));
    assert.equal(raw, null, `campo sin escapar en renderItem(${param}): ${raw && raw[0]}`);
  }
});
