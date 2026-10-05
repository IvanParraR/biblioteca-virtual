// ============================================================
// Modelo DOAJ — búsqueda de artículos vía la API pública de DOAJ
// (Directory of Open Access Journals), Reino Unido. Gratis, sin
// necesidad de API key para lectura.
// https://doaj.org/api/v3/docs
//
// Todo lo que indexa DOAJ es, por definición, de una revista de
// acceso abierto — isOpenAccess siempre es true.
//
// IMPORTANTE sobre la consulta: al principio se armaba un query
// Lucene combinando título + autor + idioma + rango de año con
// AND y rangos con comodín ([2018 TO *]) — DOAJ lo rechaza con
// "400 disallowed Lucene features" (su API pública bloquea ciertas
// construcciones avanzadas). La solución: mandarle solo el título
// entre comillas (la sintaxis más simple y segura posible) y
// aplicar año/idioma/autor del lado del servidor sobre los
// resultados ya traídos — mismo patrón que ya se usa para el
// filtro de autor de OpenAlex.
// ============================================================
const { formatAuthorsApa } = require('../utils/apaCitation');

const SORTS = [
  { value: '', label: 'Relevancia' },
  { value: 'bibjson.year:desc', label: 'Más nuevo' },
  { value: 'bibjson.year:asc', label: 'Más antiguo' },
];

function escapeQuery(text) {
  return (text || '').replace(/"/g, '\\"');
}

async function search(options) {
  const { query, yearFrom, yearTo, language, author, sort, perPage = 10, page = 1 } = options;

  // Solo se le manda a DOAJ el título, entre comillas (frase
  // exacta) — es la construcción más simple que su parser acepta
  // sin quejarse. Todo lo demás se filtra después, acá mismo.
  const q = `bibjson.title:"${escapeQuery(query)}"`;

  const needsPostFilter = !!(yearFrom || yearTo || language || author);
  // Si hay que filtrar después, se trae un lote más grande para no
  // quedarse con muy pocos (o cero) resultados tras filtrar.
  const fetchCount = needsPostFilter ? Math.max(perPage * 3, 30) : perPage;

  const params = new URLSearchParams();
  params.set('pageSize', String(fetchCount));
  params.set('page', String(page));
  if (sort) params.set('sort', sort);

  const url = `https://doaj.org/api/v3/search/articles/${encodeURIComponent(q)}?${params.toString()}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error(`DOAJ — no se pudo ni conectar a: ${url}`);
    console.error(err);
    throw new Error('DOAJ no respondió (fallo de red)');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`DOAJ — URL: ${url}`);
    console.error(`DOAJ — respuesta ${res.status}: ${body.slice(0, 500)}`);
    throw new Error(`DOAJ respondió ${res.status}`);
  }
  const data = await res.json();
  let results = (data.results || []).map(mapArticle);

  if (yearFrom) results = results.filter((r) => r.year && r.year >= yearFrom);
  if (yearTo) results = results.filter((r) => r.year && r.year <= yearTo);
  if (language) {
    results = results.filter((r) => (r.journalLanguage || '').toLowerCase() === language.toLowerCase());
  }
  if (author) {
    const needle = author.trim().toLowerCase();
    results = results.filter((r) => r.authors.some((a) => a.toLowerCase().includes(needle)));
  }

  return results.slice(0, perPage);
}

function mapArticle(a) {
  const bib = a.bibjson || {};
  const authors = (bib.author || []).map((au) => au.name).filter(Boolean);
  const identifiers = bib.identifier || [];
  const doiEntry = identifiers.find((i) => i.type === 'doi');
  const doi = doiEntry ? `https://doi.org/${doiEntry.id}` : null;
  const links = bib.link || [];
  const fulltextLink = links.find((l) => l.type === 'fulltext') || links[0] || null;
  const openAccessUrl = (fulltextLink && fulltextLink.url) || doi || null;
  const sourceUrl = doi || openAccessUrl;

  return {
    source: 'DOAJ',
    sourceType: 'doaj_paper',
    sourceId: a.id,
    title: bib.title || 'Sin título',
    authors,
    year: bib.year ? parseInt(bib.year, 10) : null,
    venue: (bib.journal && bib.journal.title) || null,
    // bibjson.journal.language puede venir como arreglo o como texto
    // simple según el registro — se cubre cualquiera de las dos.
    journalLanguage: (() => {
      const lang = bib.journal && bib.journal.language;
      if (Array.isArray(lang)) return lang[0] || null;
      return lang || null;
    })(),
    type: 'article',
    citedByCount: null, // DOAJ no expone conteo de citas
    isOpenAccess: true,
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

module.exports = { search, citationApa, SORTS };
