const Settings = require('../models/Settings');
const fs = require('fs');
const csv = require('csv-parser');
const Book = require('../models/Book');
const Category = require('../models/Category');
const ActivityLog = require('../models/ActivityLog');

const SCHOOL_NAME = () => Settings.get().school_name;

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

    const newBookId = await Book.create({
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

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'book_created',
      entityId: newBookId,
      entityLabel: title,
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

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'book_updated',
      entityId: parseInt(req.params.id, 10),
      entityLabel: title,
      beforeState: {
        title: existing.title,
        author: existing.author,
        isbn: existing.isbn,
        category_id: existing.category_id,
        description: existing.description,
        publisher: existing.publisher,
        publication_year: existing.publication_year,
        cover_url: existing.cover_url,
        location: existing.location,
        library_only: existing.library_only,
        total_copies: existing.total_copies,
        available_copies: existing.available_copies,
      },
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
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'book_deleted',
      entityId: parseInt(req.params.id, 10),
      entityLabel: book ? book.title : `libro #${req.params.id}`,
      beforeState: book ? {
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        category_id: book.category_id,
        description: book.description,
        publisher: book.publisher,
        publication_year: book.publication_year,
        cover_url: book.cover_url,
        location: book.location,
        library_only: book.library_only,
        total_copies: book.total_copies,
        available_copies: book.available_copies,
      } : null,
    });
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
    const book = await Book.findById(req.params.id);
    await Book.addCopies(req.params.id, amount);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'book_copies_added',
      entityId: parseInt(req.params.id, 10),
      entityLabel: book ? book.title : `libro #${req.params.id}`,
      details: `+${amount}`,
      beforeState: book ? { available_copies: book.available_copies } : null,
    });
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
    const book = await Book.findById(req.params.id);
    await Book.removeCopies(req.params.id, amount);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'book_copies_removed',
      entityId: parseInt(req.params.id, 10),
      entityLabel: book ? book.title : `libro #${req.params.id}`,
      details: `-${amount}`,
      beforeState: book ? { available_copies: book.available_copies } : null,
    });
    req.flash('success', `Se retiraron ${amount} copia(s).`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudieron retirar copias.');
  }
  res.redirect('/admin/books');
};

// ------------------------------------------------------------
// Acciones masivas — seleccionar varios libros en la tabla y
// eliminarlos o cambiarles la categoría de una sola vez. No son
// "deshacer-ables" desde el historial de actividad (a diferencia de
// las acciones individuales) por su mayor alcance y riesgo — sí
// quedan registradas con el detalle de qué libros se vieron afectados.
// ------------------------------------------------------------
function parseIds(body) {
  let raw = body.ids;
  if (!raw) return [];
  if (!Array.isArray(raw)) raw = [raw];
  return raw.map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n) && n > 0);
}

exports.bulkDelete = async (req, res) => {
  try {
    const ids = parseIds(req.body);
    if (ids.length === 0) {
      req.flash('error', 'No seleccionaste ningún libro.');
      return res.redirect('/admin/books');
    }

    const books = await Book.findByIds(ids);
    const affected = await Book.deleteMany(ids);

    const titles = books.slice(0, 5).map((b) => b.title).join(', ');
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'book_bulk_deleted',
      entityLabel: `${affected} libro(s)`,
      details: books.length > 5 ? `${titles}, y ${books.length - 5} más` : titles,
    });

    req.flash('success', `Se eliminaron ${affected} libro(s) del catálogo.`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudieron eliminar los libros seleccionados.');
  }
  res.redirect('/admin/books');
};

exports.bulkChangeCategory = async (req, res) => {
  try {
    const ids = parseIds(req.body);
    const categoryId = parseInt(req.body.category_id, 10);

    if (ids.length === 0) {
      req.flash('error', 'No seleccionaste ningún libro.');
      return res.redirect('/admin/books');
    }
    if (!categoryId) {
      req.flash('error', 'Selecciona una categoría de destino.');
      return res.redirect('/admin/books');
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      req.flash('error', 'Esa categoría ya no existe.');
      return res.redirect('/admin/books');
    }

    const books = await Book.findByIds(ids);
    const affected = await Book.bulkSetCategory(ids, categoryId);

    const titles = books.slice(0, 5).map((b) => b.title).join(', ');
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'book_bulk_category_changed',
      entityLabel: `${affected} libro(s) → ${category.name}`,
      details: books.length > 5 ? `${titles}, y ${books.length - 5} más` : titles,
    });

    req.flash('success', `Se cambió la categoría de ${affected} libro(s) a "${category.name}".`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cambiar la categoría de los libros seleccionados.');
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

      if (created > 0) {
        await ActivityLog.log({
          adminId: req.session.admin.id,
          adminUsername: req.session.admin.username,
          actionType: 'book_csv_import',
          entityLabel: `${created} libro(s)`,
          details: errors.length ? `${errors.length} fila(s) con error` : null,
        });
        req.flash('success', `Se importaron ${created} libro(s) correctamente.`);
      }
      if (errors.length > 0) req.flash('error', `${errors.length} fila(s) tuvieron problemas: ${errors.slice(0, 5).join(' ')}`);
      res.redirect('/admin/books');
    })
    .on('error', (err) => {
      console.error(err);
      req.flash('error', 'No se pudo leer el archivo CSV.');
      res.redirect('/admin/books/import');
    });
};
