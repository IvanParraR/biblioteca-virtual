const EmailDomain = require('../models/EmailDomain');
const StudentEmailDomain = require('../models/StudentEmailDomain');
const ActivityLog = require('../models/ActivityLog');

exports.add = async (req, res) => {
  try {
    const domain = await EmailDomain.add(req.body.domain);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'email_domain_added',
      entityLabel: domain,
    });
    req.flash('success', `Dominio "${domain}" agregado a la lista permitida de administradores.`);
  } catch (err) {
    req.flash('error', err.message || 'No se pudo agregar el dominio.');
  }
  res.redirect('/admin/settings');
};

exports.delete = async (req, res) => {
  try {
    const domains = await EmailDomain.all();
    const target = domains.find((d) => d.id === parseInt(req.params.id, 10));
    await EmailDomain.delete(req.params.id);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'email_domain_removed',
      entityLabel: target ? target.domain : `dominio #${req.params.id}`,
    });
    req.flash('success', 'Dominio eliminado de la lista permitida de administradores.');
  } catch (err) {
    req.flash('error', err.message || 'No se pudo eliminar el dominio.');
  }
  res.redirect('/admin/settings');
};

exports.addStudentDomain = async (req, res) => {
  try {
    const domain = await StudentEmailDomain.add(req.body.domain);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'email_domain_added',
      entityLabel: `${domain} (estudiantes)`,
    });
    req.flash('success', `Dominio "${domain}" agregado a la lista permitida de estudiantes.`);
  } catch (err) {
    req.flash('error', err.message || 'No se pudo agregar el dominio.');
  }
  res.redirect('/admin/settings');
};

exports.deleteStudentDomain = async (req, res) => {
  try {
    const domains = await StudentEmailDomain.all();
    const target = domains.find((d) => d.id === parseInt(req.params.id, 10));
    await StudentEmailDomain.delete(req.params.id);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'email_domain_removed',
      entityLabel: target ? `${target.domain} (estudiantes)` : `dominio #${req.params.id}`,
    });
    req.flash('success', 'Dominio eliminado de la lista permitida de estudiantes.');
  } catch (err) {
    req.flash('error', err.message || 'No se pudo eliminar el dominio.');
  }
  res.redirect('/admin/settings');
};
