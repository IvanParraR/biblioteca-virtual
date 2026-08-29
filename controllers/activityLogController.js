const ActivityLog = require('../models/ActivityLog');
const Book = require('../models/Book');
const Category = require('../models/Category');
const Admin = require('../models/Admin');

const SCHOOL_NAME = () => process.env.SCHOOL_NAME || 'Biblioteca Escolar';

exports.list = async (req, res) => {
  try {
    const {
      timeRange, dateFrom, dateTo, specificDate,
      actionType, adminUsername, entityType,
      sort, order, page,
    } = req.query;

    const [result, admins] = await Promise.all([
      ActivityLog.search({
        timeRange: timeRange || '',
        dateFrom: dateFrom || '',
        dateTo: dateTo || '',
        specificDate: specificDate || '',
        actionType: actionType || '',
        adminUsername: adminUsername || '',
        entityType: entityType || '',
        sort: sort || 'created_at',
        order: order || 'desc',
        page: parseInt(page, 10) || 1,
        perPage: 20,
      }),
      ActivityLog.distinctAdmins(),
    ]);

    // Para cada entrada potencialmente deshacer-able, evaluamos si es
    // la más reciente de su entidad (única forma de saber si "hubo
    // cambios posteriores" que bloqueen el deshacer) y si el admin
    // actual tiene permiso/tiempo para hacerlo.
    const entriesWithUndo = await Promise.all(
      result.entries.map(async (entry) => {
        if (!entry.is_undoable || entry.undone_at) {
          return { ...entry, canUndo: false };
        }
        const isLatest = await ActivityLog.isLatestForEntity(entry.entity_type, entry.entity_id, entry.id);
        if (!isLatest) {
          return { ...entry, canUndo: false, undoBlockedReason: 'Hubo cambios posteriores sobre esto.' };
        }
        const evalResult = ActivityLog.evaluateUndo(entry, req.session.admin);
        return { ...entry, canUndo: evalResult.ok, undoMode: evalResult.mode, undoBlockedReason: evalResult.ok ? null : evalResult.reason };
      })
    );

    res.render('admin/activity-log', {
      pageTitle: 'Actividad',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      ...result,
      entries: entriesWithUndo,
      admins,
      actionTypes: ActivityLog.ACTION_TYPES,
      entityLabels: ActivityLog.ENTITY_LABELS,
      filters: {
        timeRange: timeRange || '',
        dateFrom: dateFrom || '',
        dateTo: dateTo || '',
        specificDate: specificDate || '',
        actionType: actionType || '',
        adminUsername: adminUsername || '',
        entityType: entityType || '',
        sort: sort || 'created_at',
        order: order || 'desc',
      },
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar el historial de actividad.');
    res.redirect('/admin/dashboard');
  }
};

// ------------------------------------------------------------
// Deshacer una acción. Solo aplica a la lista blanca de acciones
// "seguras" (ver ActivityLog.UNDOABLE_ACTIONS). Cada tipo de acción
// tiene su propia forma de revertirse usando el `before_state`
// guardado en el momento original.
// ------------------------------------------------------------
exports.undo = async (req, res) => {
  const logId = parseInt(req.params.id, 10);

  try {
    const entry = await ActivityLog.findById(logId);
    if (!entry) {
      req.flash('error', 'No se encontró ese registro de actividad.');
      return res.redirect('/admin/activity-log');
    }

    const isLatest = await ActivityLog.isLatestForEntity(entry.entity_type, entry.entity_id, entry.id);
    if (!isLatest) {
      req.flash('error', 'No se puede deshacer: hubo cambios posteriores sobre esto.');
      return res.redirect('/admin/activity-log');
    }

    const evalResult = ActivityLog.evaluateUndo(entry, req.session.admin);
    if (!evalResult.ok) {
      req.flash('error', evalResult.reason);
      return res.redirect('/admin/activity-log');
    }

    const before = entry.before_state ? JSON.parse(entry.before_state) : null;
    const actor = req.session.admin;
    let revertLabel = entry.entity_label;
    let revertBeforeState = null; // antes del deshacer = el estado que había justo antes de deshacer

    switch (entry.action_type) {
      case 'book_created': {
        const book = await Book.findById(entry.entity_id);
        if (!book) throw new Error('El libro ya no existe.');
        await Book.delete(entry.entity_id);
        revertLabel = book.title;
        break;
      }

      case 'book_updated': {
        const current = await Book.findById(entry.entity_id);
        if (!current) throw new Error('El libro ya no existe.');
        if (!before) throw new Error('No hay datos guardados para restaurar.');
        revertBeforeState = {
          title: current.title, author: current.author, isbn: current.isbn,
          category_id: current.category_id, description: current.description,
          publisher: current.publisher, publication_year: current.publication_year,
          cover_url: current.cover_url, location: current.location,
          library_only: current.library_only, total_copies: current.total_copies,
          available_copies: current.available_copies,
        };
        await Book.update(entry.entity_id, before);
        revertLabel = before.title;
        break;
      }

      case 'book_deleted': {
        if (!before) throw new Error('No hay datos guardados para restaurar.');
        const existingIsbn = await Book.findByIsbn(before.isbn);
        if (existingIsbn) throw new Error(`No se puede restaurar: ya existe otro libro con el ISBN ${before.isbn}.`);
        const newId = await Book.create(before);
        entry.entity_id = newId; // el libro restaurado tiene un id nuevo
        revertLabel = before.title;
        break;
      }

      case 'category_created': {
        const cat = await Category.findById(entry.entity_id);
        if (!cat) throw new Error('La categoría ya no existe.');
        const count = await Category.bookCount(entry.entity_id);
        if (count > 0) throw new Error('No se puede deshacer: la categoría ya tiene libros asignados.');
        await Category.delete(entry.entity_id);
        revertLabel = cat.name;
        break;
      }

      case 'category_renamed': {
        const current = await Category.findById(entry.entity_id);
        if (!current) throw new Error('La categoría ya no existe.');
        if (!before) throw new Error('No hay datos guardados para restaurar.');
        const dup = await Category.findByName(before.name);
        if (dup) throw new Error(`No se puede restaurar: ya existe una categoría llamada "${before.name}".`);
        revertBeforeState = { name: current.name };
        await Category.rename(entry.entity_id, before.name);
        revertLabel = before.name;
        break;
      }

      case 'category_deleted': {
        if (!before) throw new Error('No hay datos guardados para restaurar.');
        const dup = await Category.findByName(before.name);
        if (dup) throw new Error(`No se puede restaurar: ya existe una categoría llamada "${before.name}".`);
        const newId = await Category.create(before.name);
        entry.entity_id = newId;
        revertLabel = before.name;
        break;
      }

      case 'admin_permission_granted':
      case 'admin_permission_revoked': {
        const target = await Admin.findById(entry.entity_id);
        if (!target) throw new Error('Esa cuenta ya no existe.');
        if (!before) throw new Error('No hay datos guardados para restaurar.');
        if (!before.can_manage_admins) {
          const managers = await Admin.countManagers();
          if (managers <= 1) throw new Error('No se puede deshacer: debe quedar al menos una cuenta con permiso de gestión.');
        }
        revertBeforeState = { can_manage_admins: !!target.can_manage_admins };
        await Admin.setCanManage(entry.entity_id, before.can_manage_admins);
        revertLabel = target.username;
        break;
      }

      case 'book_copies_added':
      case 'book_copies_removed': {
        const book = await Book.findById(entry.entity_id);
        if (!book) throw new Error('El libro ya no existe.');
        if (!before) throw new Error('No hay datos guardados para restaurar.');
        revertBeforeState = { available_copies: book.available_copies };
        await Book.setAvailableCopies(entry.entity_id, before.available_copies);
        revertLabel = book.title;
        break;
      }

      default:
        throw new Error('Esta acción no se puede deshacer.');
    }

    await ActivityLog.markUndone(entry.id, actor.username);
    await ActivityLog.log({
      adminId: actor.id,
      adminUsername: actor.username,
      actionType: ActivityLog.REVERT_ACTION_MAP[entry.action_type] || entry.action_type,
      entityId: entry.entity_id,
      entityLabel: revertLabel,
      details: `Deshecho (acción original de "${entry.admin_username}")`,
      beforeState: revertBeforeState,
      isRevert: true,
    });

    req.flash('success', 'La acción se deshizo correctamente.');
    res.redirect('/admin/activity-log');
  } catch (err) {
    console.error(err);
    req.flash('error', err.message || 'No se pudo deshacer la acción.');
    res.redirect('/admin/activity-log');
  }
};
