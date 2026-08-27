const Book = require('../models/Book');

const SCHOOL_NAME = () => process.env.SCHOOL_NAME || 'Biblioteca Escolar';

exports.home = async (req, res) => {
  try {
    const [recent, categories, stats] = await Promise.all([
      Book.recent(4),
      Book.categories(),
      Book.stats(),
    ]);
    res.render('student/home', {
      pageTitle: 'Inicio',
      schoolName: SCHOOL_NAME(),
      recent,
      categories,
      totalBooks: stats.totals.total_books,
      dbConnected: true,
    });
  } catch (err) {
    console.error(err);
    res.render('student/home', {
      pageTitle: 'Inicio',
      schoolName: SCHOOL_NAME(),
      recent: [],
      categories: [],
      totalBooks: 0,
      dbConnected: false,
    });
  }
};

exports.catalog = async (req, res) => {
  try {
    const { q, category, availability, author, sort, order, page } = req.query;
    const [result, categories, authors] = await Promise.all([
      Book.search({
        q,
        category,
        availability,
        author,
        sort: sort || 'title',
        order: order || 'asc',
        page: parseInt(page, 10) || 1,
        perPage: 12,
      }),
      Book.categories(),
      Book.authorsList(),
    ]);

    res.render('student/catalog', {
      pageTitle: 'Catálogo',
      schoolName: SCHOOL_NAME(),
      ...result,
      categories,
      authors,
      filters: { q: q || '', category: category || '', availability: availability || '', author: author || '', sort: sort || 'title', order: order || 'asc' },
      dbConnected: true,
    });
  } catch (err) {
    console.error(err);
    res.render('student/catalog', {
      pageTitle: 'Catálogo',
      schoolName: SCHOOL_NAME(),
      books: [], total: 0, totalPages: 1, currentPage: 1, perPage: 12,
      categories: [], authors: [],
      filters: { q: '', category: '', availability: '', author: '', sort: 'title', order: 'asc' },
      dbConnected: false,
    });
  }
};

exports.bookDetail = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).render('errors/404', { pageTitle: 'Libro no encontrado', schoolName: SCHOOL_NAME() });
    }
    res.render('student/book-detail', { pageTitle: book.title, schoolName: SCHOOL_NAME(), book });
  } catch (err) {
    console.error(err);
    res.status(500).render('errors/404', { pageTitle: 'Error', schoolName: SCHOOL_NAME() });
  }
};

exports.categories = async (req, res) => {
  try {
    const categories = await Book.categories();
    res.render('student/categories', { pageTitle: 'Categorías', schoolName: SCHOOL_NAME(), categories, dbConnected: true });
  } catch (err) {
    console.error(err);
    res.render('student/categories', { pageTitle: 'Categorías', schoolName: SCHOOL_NAME(), categories: [], dbConnected: false });
  }
};
