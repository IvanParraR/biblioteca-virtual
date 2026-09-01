const Settings = require('../models/Settings');
const Category = require('../models/Category');
const ActivityLog = require('../models/ActivityLog');

const SCHOOL_NAME = () => Settings.get().school_name;

exports.list = async (req, res) => {
  try {
    const categories = await Category.withCounts();
    res.render('admin/categories', {
      pageTitle: 'Categorías',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      categories,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudieron cargar las categorías.');
    res.redirect('/admin/dashboard');
  }
};

exports.create = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      req.flash('error', 'Escribe un nombre para la categoría.');
      return res.redirect('/admin/categories');
    }
    const existing = await Category.findByName(name);
    if (existing) {
      req.flash('error', `Ya existe una categoría llamada "${existing.name}".`);
      return res.redirect('/admin/categories');
    }
    const newCategoryId = await Category.create(name);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'category_created',
      entityId: newCategoryId,
      entityLabel: name.trim(),
    });
    req.flash('success', `Categoría "${name.trim()}" creada correctamente.`);
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo crear la categoría.');
    res.redirect('/admin/categories');
  }
};

exports.rename = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      req.flash('error', 'Escribe un nombre válido.');
      return res.redirect('/admin/categories');
    }
    const duplicate = await Category.findByName(name);
    if (duplicate && String(duplicate.id) !== req.params.id) {
      req.flash('error', `Ya existe una categoría llamada "${duplicate.name}". Si quieres fusionarlas, elimina esta y reasigna sus libros primero.`);
      return res.redirect('/admin/categories');
    }
    const before = await Category.findById(req.params.id);
    await Category.rename(req.params.id, name);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'category_renamed',
      entityId: parseInt(req.params.id, 10),
      entityLabel: name.trim(),
      details: before ? `antes: "${before.name}"` : null,
      beforeState: before ? { name: before.name } : null,
    });
    req.flash('success', 'Categoría actualizada correctamente.');
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo renombrar la categoría.');
    res.redirect('/admin/categories');
  }
};

exports.delete = async (req, res) => {
  try {
    const count = await Category.bookCount(req.params.id);
    if (count > 0) {
      req.flash('error', `No se puede eliminar: ${count} libro(s) todavía usan esta categoría. Cambia su categoría primero desde "Editar libro".`);
      return res.redirect('/admin/categories');
    }
    const category = await Category.findById(req.params.id);
    await Category.delete(req.params.id);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'category_deleted',
      entityId: parseInt(req.params.id, 10),
      entityLabel: category ? category.name : `categoría #${req.params.id}`,
      beforeState: category ? { name: category.name } : null,
    });
    req.flash('success', 'Categoría eliminada.');
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo eliminar la categoría.');
    res.redirect('/admin/categories');
  }
};

// Fusiona dos categorías duplicadas (ej. "Matemáticas" y "matematicas"
// creadas antes de normalizar): todos los libros de la categoría de
// origen pasan a la de destino, y la de origen se elimina.
exports.merge = async (req, res) => {
  try {
    const sourceId = parseInt(req.params.id, 10);
    const targetId = parseInt(req.body.target_id, 10);

    if (!targetId || targetId === sourceId) {
      req.flash('error', 'Selecciona una categoría de destino distinta para fusionar.');
      return res.redirect('/admin/categories');
    }

    const source = await Category.findById(sourceId);
    const target = await Category.findById(targetId);
    if (!source || !target) {
      req.flash('error', 'Una de las categorías no existe.');
      return res.redirect('/admin/categories');
    }

    await Category.mergeInto(sourceId, targetId);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'category_merged',
      entityId: sourceId,
      entityLabel: source.name,
      details: `fusionada dentro de "${target.name}"`,
    });
    req.flash('success', `Se fusionó "${source.name}" dentro de "${target.name}". Todos sus libros ahora usan "${target.name}".`);
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo fusionar las categorías.');
    res.redirect('/admin/categories');
  }
};
