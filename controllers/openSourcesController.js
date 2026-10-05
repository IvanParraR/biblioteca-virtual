const Settings = require('../models/Settings');
const OpenAlex = require('../models/OpenAlex');
const OpenLibrary = require('../models/OpenLibrary');
const DOAJ = require('../models/DOAJ');
const SavedReference = require('../models/SavedReference');
const { LANGUAGES } = require('../utils/languages');

const SCHOOL_NAME = () => Settings.get().school_name;
const CURRENT_YEAR = new Date().getFullYear();
// Para los <select> de año — de la más reciente hacia atrás.
const YEAR_OPTIONS = [];
for (let y = CURRENT_YEAR; y >= 1900; y--) YEAR_OPTIONS.push(y);

const PER_PAGE = 10;

function citationFor(tipo, r) {
  if (tipo === 'libros') return OpenLibrary.citationApa(r);
  return r.source === 'DOAJ' ? DOAJ.citationApa(r) : OpenAlex.citationApa(r);
}

exports.show = async (req, res) => {
  const tipo = req.query.tipo === 'libros' ? 'libros' : 'papers';
  const q = (req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const filters = {
    type: req.query.type || '',
    yearFrom: req.query.yearFrom ? parseInt(req.query.yearFrom, 10) : null,
    yearTo: req.query.yearTo ? parseInt(req.query.yearTo, 10) : null,
    language: req.query.language || '',
    author: (req.query.author || '').trim(),
    subject: (req.query.subject || '').trim(),
    openAccessOnly: req.query.openAccessOnly === 'on',
    sort: req.query.sort || '',
  };

  // "Hasta" nunca puede quedar antes que "Desde" — en vez de
  // rechazar la búsqueda, se corrigen solos intercambiándolos.
  if (filters.yearFrom && filters.yearTo && filters.yearFrom > filters.yearTo) {
    [filters.yearFrom, filters.yearTo] = [filters.yearTo, filters.yearFrom];
  }

  let results = [];
  let searchError = null;
  let sourceWarnings = [];
  // "¿hay más?" es una aproximación: si una fuente devolvió una
  // página llena, asumimos que probablemente tenga más — no
  // conocemos el total exacto combinado entre dos fuentes distintas
  // sin gastar otra consulta solo para contar.
  let hasNextPage = false;

  if (q) {
    if (tipo === 'libros') {
      try {
        const raw = await OpenLibrary.search({
          query: q,
          page,
          yearFrom: filters.yearFrom,
          yearTo: filters.yearTo,
          language: (LANGUAGES.find((l) => l.openalex === filters.language) || {}).openlibrary || '',
          author: filters.author,
          subject: filters.subject,
          openAccessOnly: filters.openAccessOnly,
          sort: filters.sort,
          limit: PER_PAGE,
        });
        results = raw;
        hasNextPage = raw.length >= PER_PAGE;
      } catch (err) {
        console.error(err);
        searchError = 'No se pudo consultar Open Library en este momento — intenta de nuevo en un rato.';
      }
    } else {
      // DOAJ solo indexa artículos de revista — si el filtro de tipo
      // pide otra cosa (tesis, capítulo, etc.), no tiene sentido
      // consultarla, esos resultados nunca podrían venir de ahí.
      const shouldQueryDoaj = !filters.type || filters.type === 'article';

      const [openAlexResult, doajResult] = await Promise.allSettled([
        OpenAlex.search({
          query: q,
          page,
          type: filters.type,
          yearFrom: filters.yearFrom,
          yearTo: filters.yearTo,
          language: filters.language,
          author: filters.author,
          openAccessOnly: filters.openAccessOnly,
          sort: filters.sort,
          perPage: PER_PAGE,
        }),
        shouldQueryDoaj
          ? DOAJ.search({
              query: q,
              page,
              yearFrom: filters.yearFrom,
              yearTo: filters.yearTo,
              language: filters.language,
              author: filters.author,
              sort: filters.sort,
              perPage: PER_PAGE,
            })
          : Promise.resolve([]),
      ]);

      if (openAlexResult.status === 'fulfilled') {
        results = results.concat(openAlexResult.value);
        if (openAlexResult.value.length >= PER_PAGE) hasNextPage = true;
      } else {
        console.error(openAlexResult.reason);
        sourceWarnings.push('No se pudo consultar OpenAlex en este momento.');
      }

      if (doajResult.status === 'fulfilled') {
        results = results.concat(doajResult.value);
        if (doajResult.value.length >= PER_PAGE) hasNextPage = true;
      } else {
        console.error(doajResult.reason);
        sourceWarnings.push('No se pudo consultar DOAJ en este momento.');
      }

      if (results.length === 0 && sourceWarnings.length === 2) {
        searchError = 'No se pudo consultar ninguna de las dos fuentes en este momento — intenta de nuevo en un rato.';
      }

      // Con dos fuentes combinadas, "más nuevo/antiguo/citado" se
      // reordena aquí mismo en vez de confiar en el orden de cada
      // API por separado — así el resultado combinado sí respeta el
      // orden elegido. DOAJ no expone conteo de citas, así que en
      // "más citado" sus resultados quedan al final del todo.
      if (filters.sort === 'publication_date:desc') {
        results.sort((a, b) => (b.year || 0) - (a.year || 0));
      } else if (filters.sort === 'publication_date:asc') {
        results.sort((a, b) => (a.year || 0) - (b.year || 0));
      } else if (filters.sort === 'cited_by_count:desc') {
        results.sort((a, b) => (b.citedByCount ?? -1) - (a.citedByCount ?? -1));
      }
    }
  }

  // La cita se genera ya aquí, una sola vez — el formulario de
  // "Guardar" de cada resultado la manda de vuelta tal cual en un
  // campo oculto, así nunca hay que recalcularla ni volver a pegarle
  // a la API externa solo para guardar.
  results = results.map((r) => ({ ...r, citationApa: citationFor(tipo, r) }));

  // Todos los filtros armados como querystring, SIN "page" — así la
  // vista arma los links de Anterior/Siguiente pegándole el número
  // de página que corresponda.
  const pageParams = new URLSearchParams();
  pageParams.set('tipo', tipo);
  if (q) pageParams.set('q', q);
  if (filters.type) pageParams.set('type', filters.type);
  if (filters.yearFrom) pageParams.set('yearFrom', filters.yearFrom);
  if (filters.yearTo) pageParams.set('yearTo', filters.yearTo);
  if (filters.language) pageParams.set('language', filters.language);
  if (filters.author) pageParams.set('author', filters.author);
  if (filters.subject) pageParams.set('subject', filters.subject);
  if (filters.openAccessOnly) pageParams.set('openAccessOnly', 'on');
  if (filters.sort) pageParams.set('sort', filters.sort);

  res.render('student/open-sources', {
    pageTitle: 'Fuentes abiertas',
    schoolName: SCHOOL_NAME(),
    tipo,
    q,
    filters,
    results,
    searchError,
    sourceWarnings,
    searched: !!q,
    languages: LANGUAGES,
    paperTypes: OpenAlex.TYPES,
    paperSorts: OpenAlex.SORTS,
    bookSorts: OpenLibrary.SORTS,
    yearOptions: YEAR_OPTIONS,
    currentUrl: req.originalUrl,
    page,
    hasNextPage,
    pageBaseQuery: pageParams.toString(),
  });
};

exports.save = async (req, res) => {
  const { source_type, source_id, title, authors, year, citation_apa, source_url, open_access_url } = req.body;
  try {
    if (!source_type || !source_id || !title || !citation_apa) {
      req.flash('error', 'Faltan datos para guardar esa referencia.');
    } else {
      await SavedReference.save(req.session.student.id, {
        sourceType: source_type,
        sourceId: source_id,
        title,
        authors,
        year: year ? parseInt(year, 10) : null,
        citationApa: citation_apa,
        sourceUrl: source_url,
        openAccessUrl: open_access_url,
      });
      req.flash('success', `"${title}" se guardó en tus referencias.`);
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo guardar esa referencia.');
  }
  // redirect_back trae toda la búsqueda armada (tipo, q, filtros,
  // página) tal como estaba en la página desde la que se guardó.
  const redirectBack = req.body.redirect_back;
  res.redirect(redirectBack && redirectBack.startsWith('/fuentes-abiertas') ? redirectBack : '/fuentes-abiertas');
};
