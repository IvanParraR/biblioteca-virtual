const Settings = require('../models/Settings');
const Admin = require('../models/Admin');
const EmailDomain = require('../models/EmailDomain');
const ActivityLog = require('../models/ActivityLog');
const { sendMail } = require('../config/mailer');
const { confirmationEmail } = require('../utils/emailTemplates');
const { isPasswordValid, passwordHint } = require('../utils/passwordPolicy');

const SCHOOL_NAME = () => Settings.get().school_name;

// Construye el enlace de confirmación. APP_URL debe apuntar al
// dominio público real (ej. https://tu-app.up.railway.app) — se
// configura como variable de entorno; si falta, se usa el host de
// la propia petición como respaldo razonable.
function baseUrl(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

exports.list = async (req, res) => {
  try {
    await Admin.deleteExpiredPending();
    const admins = await Admin.all();
    res.render('admin/admins', {
      pageTitle: 'Administradores',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      admins,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar la lista de administradores.');
    res.redirect('/admin/dashboard');
  }
};

exports.create = async (req, res) => {
  try {
    const { username, password, email, full_name, can_manage_admins } = req.body;

    if (!username || !password || !email) {
      req.flash('error', 'El usuario, el correo y la contraseña son obligatorios.');
      return res.redirect('/admin/admins');
    }
    if (!isPasswordValid(password)) {
      req.flash('error', `Contraseña insegura. ${passwordHint()}`);
      return res.redirect('/admin/admins');
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      req.flash('error', 'Ese correo no tiene un formato válido.');
      return res.redirect('/admin/admins');
    }

    const domainAllowed = await EmailDomain.isAllowed(cleanEmail);
    if (!domainAllowed) {
      const domains = await EmailDomain.all();
      req.flash('error', `Ese dominio de correo no está permitido. Dominios aceptados: ${domains.map((d) => d.domain).join(', ')}.`);
      return res.redirect('/admin/admins');
    }

    const { id: newAdminId, confirmationToken } = await Admin.create({
      username,
      password,
      email: cleanEmail,
      full_name,
      can_manage_admins: can_manage_admins === 'on',
    });

    const confirmUrl = `${baseUrl(req)}/admin/confirm-email/${confirmationToken}`;
    const { subject, html, text } = confirmationEmail({ schoolName: SCHOOL_NAME(), fullName: full_name, confirmUrl });
    await sendMail({ to: cleanEmail, subject, html, text });

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'admin_created',
      entityId: newAdminId,
      entityLabel: username,
      details: `Correo: ${cleanEmail} — pendiente de confirmación (vence en 24h)`,
    });

    req.flash('success', `Se creó la cuenta "${username}" — le enviamos un correo a ${cleanEmail} para confirmarla. Tiene 24 horas antes de que la cuenta se elimine sola si no confirma.`);
    res.redirect('/admin/admins');
  } catch (err) {
    console.error(err);
    let msg = 'No se pudo crear la cuenta.';
    if (err.code === 'ER_DUP_ENTRY') {
      msg = (err.sqlMessage || '').includes('email')
        ? 'Ya existe una cuenta registrada con ese correo.'
        : 'Ya existe una cuenta con ese nombre de usuario.';
    }
    req.flash('error', msg);
    res.redirect('/admin/admins');
  }
};

// Activa/desactiva el permiso de gestionar administradores en otra cuenta.
exports.togglePermission = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const target = await Admin.findById(targetId);

    if (!target) {
      req.flash('error', 'Cuenta no encontrada.');
      return res.redirect('/admin/admins');
    }

    // Evita que la última cuenta con permiso se quite el permiso a sí misma
    // (o a la única otra cuenta con permiso), lo que dejaría el sistema sin
    // nadie que pueda gestionar administradores.
    if (target.can_manage_admins) {
      const managers = await Admin.countManagers();
      if (managers <= 1) {
        req.flash('error', 'No puedes quitar este permiso: debe existir al menos una cuenta que pueda gestionar administradores.');
        return res.redirect('/admin/admins');
      }
    }

    await Admin.setCanManage(targetId, !target.can_manage_admins);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: target.can_manage_admins ? 'admin_permission_revoked' : 'admin_permission_granted',
      entityId: targetId,
      entityLabel: target.username,
      beforeState: { can_manage_admins: !!target.can_manage_admins },
    });
    req.flash('success', `Permisos actualizados para "${target.username}".`);
    res.redirect('/admin/admins');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo actualizar el permiso.');
    res.redirect('/admin/admins');
  }
};

// Reseteo asistido: genera una contraseña temporal para otra cuenta.
// Es una acción sensible (el gestor obtiene acceso total a esa cuenta
// hasta que la persona cambie la contraseña), por eso se pide
// confirmación explícita en el formulario antes de llegar aquí, y no
// se permite usarla sobre la propia cuenta del gestor (para eso existe
// "Mi cuenta" → cambiar contraseña).
exports.assignTemporaryPassword = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);

    if (targetId === req.session.admin.id) {
      req.flash('error', 'No puedes asignarte una contraseña temporal a ti mismo. Usa "Mi cuenta" para cambiar tu propia contraseña.');
      return res.redirect('/admin/admins');
    }

    const target = await Admin.findById(targetId);
    if (!target) {
      req.flash('error', 'Cuenta no encontrada.');
      return res.redirect('/admin/admins');
    }

    const tempPassword = await Admin.assignTemporaryPassword(targetId);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'admin_temp_password_assigned',
      entityId: targetId,
      entityLabel: target.username,
    });
    req.flash('success', `Contraseña temporal para "${target.username}": ${tempPassword} — compártela de forma segura. Deberá cambiarla al iniciar sesión.`);
    res.redirect('/admin/admins');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo asignar la contraseña temporal.');
    res.redirect('/admin/admins');
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);

    if (targetId === req.session.admin.id) {
      req.flash('error', 'No puedes eliminar tu propia cuenta mientras tienes sesión iniciada.');
      return res.redirect('/admin/admins');
    }

    const target = await Admin.findById(targetId);
    if (!target) {
      req.flash('error', 'Cuenta no encontrada.');
      return res.redirect('/admin/admins');
    }

    const totalAdmins = await Admin.count();
    if (totalAdmins <= 1) {
      req.flash('error', 'No puedes eliminar la única cuenta de administrador existente.');
      return res.redirect('/admin/admins');
    }

    if (target.can_manage_admins) {
      const managers = await Admin.countManagers();
      if (managers <= 1) {
        req.flash('error', 'No puedes eliminar la única cuenta que puede gestionar administradores.');
        return res.redirect('/admin/admins');
      }
    }

    await Admin.delete(targetId);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'admin_deleted',
      entityId: targetId,
      entityLabel: target.username,
    });
    req.flash('success', `Se eliminó la cuenta "${target.username}".`);
    res.redirect('/admin/admins');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo eliminar la cuenta.');
    res.redirect('/admin/admins');
  }
};
