const Settings = require('../models/Settings');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const LoginLockout = require('../models/LoginLockout');
const EmailConfirmation = require('../models/EmailConfirmation');
const ActivityLog = require('../models/ActivityLog');
const { lockoutKeys } = require('../utils/lockoutKeys');
const { clientIp } = require('../utils/requestContext');
const { logAnonymousAccess } = require('../utils/auditLog');

const SCHOOL_NAME = () => Settings.get().school_name;

exports.showLogin = (req, res) => {
  res.render('admin/login', {
    pageTitle: 'Acceso administrador',
    schoolName: SCHOOL_NAME(),
  });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  // Claves por lo escrito en el campo (usuario o correo, incluso si no
  // existe) — evita que alguien distinga "usuario inválido" de
  // "contraseña inválida" a partir del bloqueo. Hay una por pareja
  // usuario+IP y otra general por usuario (ver utils/lockoutKeys.js).
  const keys = lockoutKeys('login', username, clientIp(req));

  try {
    const lockStatus = await LoginLockout.checkAny(keys);
    if (lockStatus.locked) {
      await logAnonymousAccess({ actionType: 'admin_login_blocked', typed: username });
      req.flash('error', `Demasiados intentos fallidos. Intenta de nuevo en ${lockStatus.minutesLeft} minuto${lockStatus.minutesLeft === 1 ? '' : 's'}.`);
      return res.redirect('/admin/login');
    }

    const admin = await Admin.findByUsernameOrEmail((username || '').trim());

    // Cuentas con correo aún sin confirmar no pueden entrar todavía
    // — esto no cuenta como intento fallido de contraseña (no es lo
    // mismo que una credencial incorrecta), así que no se registra
    // en el sistema de bloqueo por intentos.
    if (admin && EmailConfirmation.isPendingConfirmation(admin)) {
      req.flash('error', 'Esta cuenta todavía no ha sido confirmada. Revisa el correo que se envió al crearla (el enlace vence 24 horas después de la creación).');
      return res.redirect('/admin/login');
    }

    const valid = admin ? await bcrypt.compare(password, admin.password_hash) : false;

    if (!valid) {
      const result = await LoginLockout.recordFailureAll(keys);
      await logAnonymousAccess({
        actionType: 'admin_login_failed',
        account: admin,
        typed: username,
        details: result.lockedNow ? 'El acceso quedó bloqueado temporalmente' : null,
      });
      if (result.lockedNow) {
        req.flash('error', `Demasiados intentos fallidos. Tu acceso quedó bloqueado por ${LoginLockout.LOCK_DURATION_MINUTES} minutos.`);
      } else {
        req.flash('error', `Usuario/correo o contraseña incorrectos. Te quedan ${result.attemptsLeft} intento${result.attemptsLeft === 1 ? '' : 's'} antes de un bloqueo temporal.`);
      }
      return res.redirect('/admin/login');
    }

    await LoginLockout.recordSuccessAll(keys);

    req.session.admin = {
      id: admin.id,
      username: admin.username,
      full_name: admin.full_name,
      can_manage_admins: !!admin.can_manage_admins,
      must_change_password: !!admin.must_change_password,
    };
    await ActivityLog.log({
      adminId: admin.id,
      adminUsername: admin.username,
      actorType: 'admin',
      actionType: 'admin_login',
      entityLabel: admin.username,
    });
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo conectar con la base de datos. Revisa la configuración de MySQL.');
    res.redirect('/admin/login');
  }
};

// Confirmación de cuenta nueva — enlace enviado por correo al
// crearla. No requiere sesión: cualquiera con el enlace (correcto y
// no vencido) confirma la cuenta a la que pertenece ese enlace.
exports.confirmEmail = async (req, res) => {
  try {
    const admin = await Admin.confirmEmail(req.params.token);
    res.render('admin/confirm-email', {
      pageTitle: 'Confirmar cuenta',
      schoolName: SCHOOL_NAME(),
      success: !!admin,
      username: admin ? admin.username : null,
    });
  } catch (err) {
    console.error(err);
    res.render('admin/confirm-email', {
      pageTitle: 'Confirmar cuenta',
      schoolName: SCHOOL_NAME(),
      success: false,
      username: null,
    });
  }
};

exports.logout = async (req, res) => {
  const current = req.session && req.session.admin;
  if (current) {
    await ActivityLog.log({
      adminId: current.id,
      adminUsername: current.username,
      actorType: 'admin',
      actionType: 'admin_logout',
      entityLabel: current.username,
    });
  }
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
};
