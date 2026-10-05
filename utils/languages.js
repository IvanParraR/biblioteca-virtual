// ============================================================
// Idiomas para los filtros de Fuentes Abiertas. Las dos APIs usan
// códigos DISTINTOS para el mismo idioma:
//   - OpenAlex:      ISO 639-1, 2 letras (es, en, pt...)
//   - Open Library:  MARC, 3 letras (spa, eng, por...)
// Por eso cada opción trae ambos códigos — el controlador elige
// cuál usar según el modo (tipo=papers usa openalex, tipo=libros
// usa openlibrary).
// ============================================================
const LANGUAGES = [
  { label: 'Español', openalex: 'es', openlibrary: 'spa' },
  { label: 'Inglés', openalex: 'en', openlibrary: 'eng' },
  { label: 'Portugués', openalex: 'pt', openlibrary: 'por' },
  { label: 'Francés', openalex: 'fr', openlibrary: 'fre' },
  { label: 'Alemán', openalex: 'de', openlibrary: 'ger' },
  { label: 'Italiano', openalex: 'it', openlibrary: 'ita' },
];

module.exports = { LANGUAGES };
