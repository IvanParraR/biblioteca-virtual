const fs = require('fs');
const csv = require('csv-parser');
const Book = require('../models/Book');
const Category = require('../models/Category');

const SCHOOL_NAME = () => process.env.SCHOOL_NAME || 'Biblioteca Escolar';

exports.dashboard = async (req, res) => {
  try {
    const stats = await Book.stats();
    res.render('admin/dashboard', {
      pageTitle: 'Panel de administración',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      stats,
      dbConnected: true,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar el panel: revisa la conexión a MySQL.');
    res.render('admin/dashboard', {
      pageTitle: 'Panel de administración',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      stats: { totals: { total_books: 0, total_copies: 0, available_copies: 0, borrowed_copies: 0, unavailable_books: 0 }, byCategory: [], recent: [] },
      dbConnected: false,
    });
  }
};

exports.listBooks = async (req, res) => {
  try {
    const { q, category, availability, page } = req.query;
    const result = await Book.search({ q, category, availability, page: parseInt(page, 10) || 1, perPage: 10 });
    const categories = await Book.categories();
    res.render('admin/books', {
      pageTitle: 'Gestionar libros',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      ...result,
      categories,
      filters: { q: q || '', category: category || '', availability: availability || '' },
      dbConnected: true,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar el listado de libros.');
    res.render('admin/books', {
      pageTitle: 'Gestionar libros',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      books: [], total: 0, totalPages: 1, currentPage: 1, perPage: 10,
      categories: [], filters: { q: '', category: '', availability: '' },
      dbConnected: false,
    });
  }
};

exports.showAddForm = async (req, res) => {
  const categories = await Category.all().catch(() => []);
  res.render('admin/add-book', {
    pageTitle: 'Agregar libro',
    schoolName: SCHOOL_NAME(),
    admin: req.session.admin,
    categories,
    formData: {},
  });
};

exports.createBook = async (req, res) => {
  try {
    const { title, author, isbn, category_id, new_category, description, publisher, publication_year, location, total_copies, library_only } = req.body;
    const cover_url = req.file ? `/uploads/covers/${req.file.filename}` : null;

    // Si el administrador escribió una categoría nueva, se crea (o se
    // reutiliza si ya existe con otra capitalización/espacios). Si no,
    // se usa la categoría existente seleccionada en el menú.
    const finalCategoryId = new_category && new_category.trim()
      ? await Category.findOrCreate(new_category)
      : parseInt(category_id, 10);

    if (!finalCategoryId) {
      req.flash('error', 'Selecciona una categoría existente o escribe una nueva.');
      return res.redirect('/admin/books/new');
    }

    await Book.create({
      title,
      author,
      isbn,
      category_id: finalCategoryId,
      description,
      publisher,
      publication_year: publication_year || null,
      cover_url,
      total_copies: parseInt(total_copies, 10) || 1,
      available_copies: parseInt(total_copies, 10) || 1,
      location,
      library_only: library_only === 'on',
    });

    req.flash('success', `"${title}" se agregó correctamente al catálogo.`);
    res.redirect('/admin/books');
  } catch (err) {
    console.error(err);
    const msg = err.code === 'ER_DUP_ENTRY' ? 'Ya existe un libro con ese ISBN.' : 'No se pudo guardar el libro. Revisa los datos e inténtalo de nuevo.';
    req.flash('error', msg);
    res.redirect('/admin/books/new');
  }
};

exports.showEditForm = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      req.flash('error', 'Libro no encontrado.');
      return res.redirect('/admin/books');
    }
    const categories = await Category.all();
    res.render('admin/edit-book', {
      pageTitle: `Editar: ${book.title}`,
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      book,
      categories,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar el libro.');
    res.redirect('/admin/books');
  }
};

exports.updateBook = async (req, res) => {
  try {
    const { title, author, isbn, category_id, new_category, description, publisher, publication_year, location, total_copies, library_only } = req.body;
    const existing = await Book.findById(req.params.id);
    const cover_url = req.file ? `/uploads/covers/${req.file.filename}` : existing.cover_url;

    const finalCategoryId = new_category && new_category.trim()
      ? await Category.findOrCreate(new_category)
      : parseInt(category_id, 10);

    if (!finalCategoryId) {
      req.flash('error', 'Selecciona una categoría existente o escribe una nueva.');
      return res.redirect(`/admin/books/${req.params.id}/edit`);
    }

    // El total de copias solo se cambia aquí, en "Editar libro" (los
    // botones +1/-1 de la tabla solo mueven cuántas están disponibles,
    // nunca el total). Si el admin sube el total, las copias nuevas se
    // suman como disponibles; si lo baja, se restan primero de las
    // disponibles (nunca queda available_copies por debajo de 0 ni por
    // encima del nuevo total).
    const newTotal = Math.max(0, parseInt(total_copies, 10) || 0);
    const delta = newTotal - existing.total_copies;
    const newAvailable = Math.min(newTotal, Math.max(0, existing.available_copies + delta));

    await Book.update(req.params.id, {
      title, author, isbn, category_id: finalCategoryId, description, publisher,
      publication_year: publication_year || null,
      cover_url, location,
      library_only: library_only === 'on',
      total_copies: newTotal,
      available_copies: newAvailable,
    });

    req.flash('success', `"${title}" se actualizó correctamente.`);
    res.redirect('/admin/books');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo actualizar el libro.');
    res.redirect(`/admin/books/${req.params.id}/edit`);
  }
};

exports.deleteBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    await Book.delete(req.params.id);
    req.flash('success', `"${book ? book.title : 'El libro'}" se eliminó del catálogo digital.`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo eliminar el libro.');
  }
  res.redirect('/admin/books');
};

exports.addCopies = async (req, res) => {
  try {
    const amount = Math.max(1, parseInt(req.body.amount, 10) || 1);
    await Book.addCopies(req.params.id, amount);
    req.flash('success', `Se agregaron ${amount} copia(s).`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudieron agregar copias.');
  }
  res.redirect('/admin/books');
};

exports.removeCopies = async (req, res) => {
  try {
    const amount = Math.max(1, parseInt(req.body.amount, 10) || 1);
    await Book.removeCopies(req.params.id, amount);
    req.flash('success', `Se retiraron ${amount} copia(s).`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudieron retirar copias.');
  }
  res.redirect('/admin/books');
};

// ------------------------------------------------------------
// Carga masiva vía CSV
// Columnas esperadas: title,author,isbn,category,description,
// publisher,publication_year,total_copies,location
// La columna "category" es texto libre en el CSV; se busca (sin
// distinguir mayúsculas) o se crea automáticamente en la tabla
// categories, evitando duplicados con las categorías existentes.
// ------------------------------------------------------------
exports.showImportForm = (req, res) => {
  res.render('admin/import-csv', {
    pageTitle: 'Importar libros (CSV)',
    schoolName: SCHOOL_NAME(),
    admin: req.session.admin,
  });
};

exports.importCsv = async (req, res) => {
  if (!req.file) {
    req.flash('error', 'Selecciona un archivo CSV para continuar.');
    return res.redirect('/admin/books/import');
  }

  const rows = [];
  const errors = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => rows.push(row))
    .on('end', async () => {
      let created = 0;
      for (const [i, row] of rows.entries()) {
        try {
          if (!row.title || !row.author || !row.isbn || !row.category) {
            errors.push(`Fila ${i + 2}: faltan campos obligatorios (title, author, isbn, category).`);
            continue;
          }
          const total = parseInt(row.total_copies, 10) || 1;
          const category_id = await Category.findOrCreate(row.category);
          await Book.create({
            title: row.title,
            author: row.author,
            isbn: row.isbn,
            category_id,
            description: row.description || '',
            publisher: row.publisher || '',
            publication_year: row.publication_year || null,
            cover_url: row.cover_url || null,
            total_copies: total,
            available_copies: total,
            location: row.location || '',
            library_only: false,
          });
          created += 1;
        } catch (err) {
          errors.push(`Fila ${i + 2} (${row.title || 'sin título'}): ${err.code === 'ER_DUP_ENTRY' ? 'ISBN duplicado' : 'error al guardar'}.`);
        }
      }

      fs.unlink(req.file.path, () => {});

      if (created > 0) req.flash('success', `Se importaron ${created} libro(s) correctamente.`);
      if (errors.length > 0) req.flash('error', `${errors.length} fila(s) tuvieron problemas: ${errors.slice(0, 5).join(' ')}`);
      res.redirect('/admin/books');
    })
    .on('error', (err) => {
      console.error(err);
      req.flash('error', 'No se pudo leer el archivo CSV.');
      res.redirect('/admin/books/import');
    });
};
