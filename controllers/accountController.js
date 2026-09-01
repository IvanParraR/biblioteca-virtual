const Settings = require('../models/Settings');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const ActivityLog = require('../models/ActivityLog');

const SCHOOL_NAME = () => Settings.get().school_name;

exports.show = async (req, res) => {
  try {
    const admin = await Admin.findById(req.session.admin.id);
    res.render('admin/account', {
      pageTitle: 'Mi cuenta',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      account: admin,
      forcedChange: !!req.session.admin.must_change_password,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar tu cuenta.');
    res.redirect('/admin/dashboard');
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;
    const admin = await Admin.findByUsername(req.session.admin.username);

    const valid = await Admin.verifyPassword(admin, current_password || '');
    if (!valid) {
      req.flash('error', 'Tu contraseña actual no es correcta.');
      return res.redirect('/admin/account');
    }

    if (!new_password || new_password.length < 8) {
      req.flash('error', 'La nueva contraseña debe tener al menos 8 caracteres.');
      return res.redirect('/admin/account');
    }

    if (new_password !== confirm_password) {
      req.flash('error', 'La nueva contraseña y su confirmación no coinciden.');
      return res.redirect('/admin/account');
    }

    if (new_password === current_password) {
      req.flash('error', 'La nueva contraseña debe ser distinta a la actual.');
      return res.redirect('/admin/account');
    }

    await Admin.setPassword(admin.id, new_password);
    req.session.admin.must_change_password = false; // ya no aplica, refleja el cambio en la sesión activa
    await ActivityLog.log({
      adminId: admin.id,
      adminUsername: admin.username,
      actionType: 'account_password_changed',
      entityId: admin.id,
      entityLabel: admin.username,
    });
    req.flash('success', 'Tu contraseña se actualizó correctamente.');
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo actualizar tu contraseña.');
    res.redirect('/admin/account');
  }
};

exports.updateSecurityQuestion = async (req, res) => {
  try {
    const { current_password, security_question, security_answer } = req.body;
    const admin = await Admin.findByUsername(req.session.admin.username);

    const valid = await Admin.verifyPassword(admin, current_password || '');
    if (!valid) {
      req.flash('error', 'Tu contraseña actual no es correcta.');
      return res.redirect('/admin/account');
    }

    if (!security_question || !security_question.trim() || !security_answer || !security_answer.trim()) {
      req.flash('error', 'Escribe una pregunta y una respuesta.');
      return res.redirect('/admin/account');
    }

    await Admin.setSecurityQuestion(admin.id, security_question.trim(), security_answer);
    await ActivityLog.log({
      adminId: admin.id,
      adminUsername: admin.username,
      actionType: 'account_security_question_updated',
      entityId: admin.id,
      entityLabel: admin.username,
    });
    req.flash('success', 'Tu pregunta de seguridad se guardó correctamente.');
    res.redirect('/admin/account');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo guardar la pregunta de seguridad.');
    res.redirect('/admin/account');
  }
};
