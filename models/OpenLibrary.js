// ============================================================
// Modelo OpenLibrary — búsqueda de libros vía la API pública de
// Open Library (gratis, sin necesidad de API key).
// https://openlibrary.org/dev/docs/api/search
//
// Búsqueda solo por título: se arma como title:(<término>) dentro
// de la consulta Solr — busca únicamente en el campo título, igual
// que se pidió para el modo de papers.
//
// Los demás filtros (autor, materia, año) se agregan como cláusulas
// AND dentro de la misma consulta Solr — es la forma soportada por
// el buscador de Open Library para combinarlos con precisión.
// El idioma SÍ es un parámetro aparte (usa código MARC de 3 letras,
// distinto del de 2 letras que usa OpenAlex — ver utils/languages.js).
// ============================================================
const { formatAuthorsApa } = require('../utils/apaCitation');

const SORTS = [
  { value: '', label: 'Relevancia' },
  { value: 'new', label: 'Más nuevo' },
  { value: 'old', label: 'Más antiguo' },
];

function escapeSolrPhrase(text) {
  // Evita que comillas sueltas rompan la sintaxis de la consulta.
  return (text || '').replace(/"/g, '\\"');
}

async function search(options) {
  const { query, yearFrom, yearTo, language, author, subject, openAccessOnly, sort, limit = 10, page = 1 } = options;

  let q = `title:(${escapeSolrPhrase(query)})`;
  if (author) q += ` AND author_name:(${escapeSolrPhrase(author)})`;
  if (subject) q += ` AND subject:(${escapeSolrPhrase(subject)})`;
  if (yearFrom || yearTo) q += ` AND first_publish_year:[${yearFrom || '*'} TO ${yearTo || '*'}]`;

  // Si hay filtro de acceso abierto, se trae un lote más grande para
  // filtrar después (Open Library no tiene un filtro de servidor
  // para "tiene texto completo gratis").
  const fetchLimit = openAccessOnly ? Math.max(limit * 3, 25) : limit;

  const params = new URLSearchParams();
  params.set('q', q);
  params.set('limit', String(fetchLimit));
  params.set('page', String(page));
  if (language) params.set('language', language);
  if (sort === 'new' || sort === 'old') params.set('sort', sort);

  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error(`Open Library — no se pudo ni conectar a: ${url}`);
    console.error(err);
    throw new Error('Open Library no respondió (fallo de red)');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`Open Library — URL: ${url}`);
    console.error(`Open Library — respuesta ${res.status}: ${body.slice(0, 500)}`);
    throw new Error(`Open Library respondió ${res.status}`);
  }
  const data = await res.json();
  let results = (data.docs || []).map(mapDoc);

  if (openAccessOnly) {
    results = results.filter((r) => r.isOpenAccess);
  }

  return results.slice(0, limit);
}

function mapDoc(d) {
  const workKey = d.key || null; // ej. "/works/OL45804W"
  const sourceId = workKey ? workKey.replace('/works/', '') : String(d.cover_edition_key || d.cover_i || `${d.title}-${d.first_publish_year || ''}`);
  const sourceUrl = workKey ? `https://openlibrary.org${workKey}` : null;

  // "ia" son los identificadores en Internet Archive — si tiene al
  // menos uno, significa que hay una versión de lectura/descarga
  // gratuita del libro completo.
  const hasFullText = Array.isArray(d.ia) && d.ia.length > 0;
  const openAccessUrl = hasFullText ? `https://archive.org/details/${d.ia[0]}` : null;

  return {
    sourceType: 'openlibrary_book',
    sourceId,
    title: d.title || 'Sin título',
    authors: d.author_name || [],
    year: d.first_publish_year || null,
    publisher: (d.publisher && d.publisher[0]) || null,
    subjects: (d.subject || []).slice(0, 3),
    isOpenAccess: hasFullText,
    openAccessUrl,
    sourceUrl,
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
  };
}

// Apellido, I. (Año). Título. Editorial.
function citationApa(book) {
  const authorsPart = formatAuthorsApa(book.authors);
  const year = book.year ? `(${book.year})` : '(s.f.)';
  const title = book.title || 'Sin título';
  const titlePart = title.endsWith('.') ? title : `${title}.`;
  const publisherPart = book.publisher ? ` ${book.publisher}.` : '';
  return `${authorsPart} ${year}. ${titlePart}${publisherPart}`.trim();
}

module.exports = { search, citationApa, SORTS };
