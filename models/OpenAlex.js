// ============================================================
// Modelo OpenAlex — búsqueda de artículos/papers científicos vía la
// API pública de OpenAlex.
// https://docs.openalex.org/api-entities/works
//
// Clave de API: desde 2026 OpenAlex limita mucho el tráfico
// anónimo (se satura con "429 rate limit exceeded" seguido) — con
// una clave gratuita (openalex.org/rest-api) el límite diario sube
// bastante. Se pasa en OPENALEX_API_KEY; sin ella, el buscador
// sigue funcionando pero puede fallar seguido por el límite bajo
// del grupo anónimo.
//
// Búsqueda solo por título: usa filter=title.search:<término>, que
// busca ÚNICAMENTE en el campo título (no en resumen ni texto
// completo) — a propósito, así lo pidió el usuario.
//
// Tipos reales de OpenAlex (no inventados): a diferencia de bases
// como IEEE, OpenAlex NO tiene un tipo separado para "actas de
// conferencia" — esos papers quedan clasificados como "article"
// igual que los de revista. Por eso el selector de tipo usa el
// vocabulario real de OpenAlex, ver TYPES más abajo.
//
// Filtro de autor: OpenAlex no permite filtrar por texto libre de
// autor sin resolverlo antes a un ID (dos llamadas). Para esta
// primera versión, se trae un lote más grande de resultados y se
// filtra por coincidencia de nombre del lado del servidor.
// ============================================================
const { formatAuthorsApa } = require('../utils/apaCitation');

const TYPES = [
  { value: '', label: 'Todos los tipos' },
  { value: 'article', label: 'Artículos' },
  { value: 'review', label: 'Reseñas' },
  { value: 'book', label: 'Libros' },
  { value: 'book-chapter', label: 'Capítulos de libro' },
  { value: 'dissertation', label: 'Tesis y disertaciones' },
  { value: 'preprint', label: 'Preprints' },
  { value: 'report', label: 'Reportes' },
];

const SORTS = [
  { value: '', label: 'Relevancia' },
  { value: 'publication_date:desc', label: 'Más nuevo' },
  { value: 'publication_date:asc', label: 'Más antiguo' },
  { value: 'cited_by_count:desc', label: 'Más citado' },
];

async function search(options) {
  const { query, type, yearFrom, yearTo, language, author, openAccessOnly, sort, perPage = 10, page = 1 } = options;

  const filters = [`title.search:${query}`];
  if (type) filters.push(`type:${type}`);
  if (yearFrom) filters.push(`from_publication_date:${yearFrom}-01-01`);
  if (yearTo) filters.push(`to_publication_date:${yearTo}-12-31`);
  if (language) filters.push(`language:${language}`);
  if (openAccessOnly) filters.push('is_oa:true');

  // Si hay filtro de autor, se trae un lote más grande para filtrar
  // después y no quedarse con muy pocos (o cero) resultados — el
  // filtrado sigue siendo por página (no perfecto, pero evita traer
  // miles de resultados solo para filtrar unos pocos).
  const fetchCount = author ? Math.max(perPage * 3, 25) : perPage;

  const params = new URLSearchParams();
  params.set('filter', filters.join(','));
  params.set('per-page', String(fetchCount));
  params.set('page', String(page));
  if (sort) params.set('sort', sort);

  if (process.env.OPENALEX_API_KEY) {
    params.set('api_key', process.env.OPENALEX_API_KEY);
  } else {
    // "Polite pool": sin clave, incluir un contacto es la
    // convención de respaldo de OpenAlex — ayuda algo, pero no
    // reemplaza a una clave de verdad contra el límite de 2026.
    params.set('mailto', process.env.OPENALEX_CONTACT_EMAIL || process.env.EMAIL_FROM || 'biblioteca@example.org');
  }

  const url = `https://api.openalex.org/works?${params.toString()}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error(`OpenAlex — no se pudo ni conectar a: ${url}`);
    console.error(err);
    throw new Error('OpenAlex no respondió (fallo de red)');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`OpenAlex — URL: ${url}`);
    console.error(`OpenAlex — respuesta ${res.status}: ${body.slice(0, 500)}`);
    throw new Error(`OpenAlex respondió ${res.status}`);
  }
  const data = await res.json();
  let results = (data.results || []).map(mapWork);

  if (author) {
    const needle = author.trim().toLowerCase();
    results = results.filter((r) => r.authors.some((a) => a.toLowerCase().includes(needle)));
  }

  return results.slice(0, perPage);
}

function mapWork(w) {
  const authors = (w.authorships || [])
    .map((a) => a.author && a.author.display_name)
    .filter(Boolean);

  const isOpenAccess = !!(w.open_access && w.open_access.is_oa);
  const openAccessUrl = (w.open_access && w.open_access.oa_url) || null;
  const doi = w.doi || null; // ej. "https://doi.org/10.1234/xxxx"
  const venue = (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || null;
  const landingUrl = w.primary_location && w.primary_location.landing_page_url;
  const sourceUrl = landingUrl || doi || w.id || null;

  return {
    source: 'OpenAlex',
    sourceType: 'openalex_paper',
    sourceId: (w.id || '').replace('https://openalex.org/', ''),
    title: w.title || 'Sin título',
    authors,
    year: w.publication_year || null,
    venue,
    type: w.type || null,
    citedByCount: w.cited_by_count || 0,
    isOpenAccess,
    openAccessUrl,
    sourceUrl,
    doi,
  };
}

// Apellido, I., & Apellido2, I. (Año). Título. Revista. https://doi.org/...
function citationApa(work) {
  const authorsPart = formatAuthorsApa(work.authors);
  const year = work.year ? `(${work.year})` : '(s.f.)';
  const title = work.title || 'Sin título';
  const titlePart = title.endsWith('.') ? title : `${title}.`;
  const venuePart = work.venue ? ` ${work.venue}.` : '';
  const linkPart = work.doi ? ` ${work.doi}` : (work.sourceUrl ? ` ${work.sourceUrl}` : '');
  return `${authorsPart} ${year}. ${titlePart}${venuePart}${linkPart}`.trim();
}

module.exports = { search, citationApa, TYPES, SORTS };
