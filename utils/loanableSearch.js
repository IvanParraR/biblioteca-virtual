// ============================================================
// Búsqueda de libros prestables mientras se escribe (formulario de
// nuevo préstamo). Parte el texto en palabras y exige que CADA
// palabra aparezca en el título, el autor o el ISBN, en cualquier
// orden: "garcia marquez cien" encuentra "Cien años de soledad —
// Gabriel García Márquez". Mayúsculas y tildes no importan (lo da la
// collation utf8mb4_unicode_ci). Los comodines % y _ que escriba el
// usuario se tratan como texto normal.
// ============================================================

const MAX_WORDS = 5;

function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, '\\$&');
}

function parseWords(q, maxWords = MAX_WORDS) {
  return String(q == null ? '' : q).trim().split(/\s+/).filter(Boolean).slice(0, maxWords);
}

// Devuelve null si no hay nada que buscar. Si hay, las piezas para armar
// la consulta: whereSql/whereParams (filtro) y phraseLike/firstWordLike
// (para ordenar primero los títulos que EMPIEZAN con lo escrito).
function buildLoanableSearch(q) {
  const words = parseWords(q);
  if (words.length === 0) return null;

  const clauses = ['b.available_copies > 0', 'b.library_only = 0'];
  const whereParams = [];
  for (const word of words) {
    clauses.push('(b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?)');
    const like = `%${escapeLike(word)}%`;
    whereParams.push(like, like, like);
  }

  return {
    whereSql: clauses.join(' AND '),
    whereParams,
    phraseLike: `${escapeLike(words.join(' '))}%`,
    firstWordLike: `${escapeLike(words[0])}%`,
  };
}

module.exports = { buildLoanableSearch, parseWords, escapeLike, MAX_WORDS };
