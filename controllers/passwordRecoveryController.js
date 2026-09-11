const Settings = require('../models/Settings');
const Admin = require('../models/Admin');
const LoginLockout = require('../models/LoginLockout');
const ActivityLog = require('../models/ActivityLog');
const EmailConfirmation = require('../models/EmailConfirmation');
const { sendMail } = require('../config/mailer');
const { temporaryPasswordEmail } = require('../utils/emailTemplates');
const { isPasswordValid, passwordHint } = require('../utils/passwordPolicy');

const SCHOOL_NAME = () => Settings.get().school_name;

// La verificación de la respuesta se guarda en la sesión del
// NAVEGADOR (no requiere estar logueado), con expiración corta,
// para evitar que alguien reutilice una pestaña vieja.
const VERIFICATION_TTL_MS = 10 * 60 * 1000; // 10 minutos

function clearRecoverySession(req) {
  delete req.session.pwRecoveryUsername;
  delete req.session.pwRecoveryVerifiedAt;
}

// Paso 1: pedir el nombre de usuario
exports.showUsernameForm = (req, res) => {
  res.render('admin/forgot-password', {
    pageTitle: 'Recuperar contraseña',
    schoolName: SCHOOL_NAME(),
  });
};

exports.submitUsername = async (req, res) => {
  const { username } = req.body;
  try {
    const admin = await Admin.findByUsername(username);

    if (!admin || !admin.security_answer_hash) {
      req.flash('error', 'Esa cuenta no existe o no tiene una pregunta de seguridad configurada todavía. Pide a un administrador con permiso de gestión que te asigne una contraseña temporal.');
      return res.redirect('/admin/login');
    }

    req.session.pwRecoveryUsername = admin.username;
    res.render('admin/forgot-password-question', {
      pageTitle: 'Pregunta de seguridad',
      schoolName: SCHOOL_NAME(),
      username: admin.username,
      question: admin.security_question,
      formErrorMsg: null,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo procesar la solicitud.');
    res.redirect('/admin/forgot-password');
  }
};

// Paso 2: verificar la respuesta a la pregunta de seguridad
exports.submitAnswer = async (req, res) => {
  const { username, answer, question } = req.body;
  const lockoutId = `secquestion:${(username || '').trim().toLowerCase()}`;

  if (!req.session.pwRecoveryUsername || req.session.pwRecoveryUsername !== username) {
    req.flash('error', 'Tu sesión de recuperación expiró. Empieza de nuevo.');
    return res.redirect('/admin/forgot-password');
  }

  try {
    const lockStatus = await LoginLockout.check(lockoutId);
    if (lockStatus.locked) {
      return res.render('admin/forgot-password-question', {
        pageTitle: 'Pregunta de seguridad',
        schoolName: SCHOOL_NAME(),
        username,
        question,
        formErrorMsg: `Demasiados intentos fallidos. Intenta de nuevo en ${lockStatus.minutesLeft} minuto${lockStatus.minutesLeft === 1 ? '' : 's'}, o pide a un administrador con permiso de gestión que te asigne una contraseña temporal.`,
      });
    }

    const admin = await Admin.verifySecurityAnswer(username, answer);
    if (!admin) {
      const result = await LoginLockout.recordFailure(lockoutId);
      const msg = result.lockedNow
        ? `Demasiados intentos fallidos. Esta verificación quedó bloqueada por ${LoginLockout.LOCK_DURATION_MINUTES} minutos.`
        : `La respuesta no es correcta. Te quedan ${result.attemptsLeft} intento${result.attemptsLeft === 1 ? '' : 's'}. Si no la recuerdas, pide a un administrador con permiso de gestión que te asigne una contraseña temporal.`;
      return res.render('admin/forgot-password-question', {
        pageTitle: 'Pregunta de seguridad',
        schoolName: SCHOOL_NAME(),
        username,
        question,
        formErrorMsg: msg,
      });
    }

    await LoginLockout.recordSuccess(lockoutId);
    req.session.pwRecoveryVerifiedAt = Date.now();
    res.render('admin/forgot-password-reset', {
      pageTitle: 'Nueva contraseña',
      schoolName: SCHOOL_NAME(),
      username,
      formErrorMsg: null,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo verificar la respuesta.');
    res.redirect('/admin/forgot-password');
  }
};

// Paso 3: definir la nueva contraseña
exports.submitReset = async (req, res) => {
  const { username, password, confirm_password } = req.body;
  const verifiedAt = req.session.pwRecoveryVerifiedAt;
  const sessionUsername = req.session.pwRecoveryUsername;

  const expired = !verifiedAt || (Date.now() - verifiedAt) > VERIFICATION_TTL_MS;

  if (!sessionUsername || sessionUsername !== username || expired) {
    clearRecoverySession(req);
    req.flash('error', 'Tu verificación expiró. Empieza el proceso de nuevo.');
    return res.redirect('/admin/forgot-password');
  }

  if (!password || !isPasswordValid(password)) {
    return res.render('admin/forgot-password-reset', {
      pageTitle: 'Nueva contraseña',
      schoolName: SCHOOL_NAME(),
      username,
      formErrorMsg: `Contraseña insegura. ${passwordHint()}`,
    });
  }

  if (password !== confirm_password) {
    return res.render('admin/forgot-password-reset', {
      pageTitle: 'Nueva contraseña',
      schoolName: SCHOOL_NAME(),
      username,
      formErrorMsg: 'Las contraseñas no coinciden.',
    });
  }

  try {
    const admin = await Admin.findByUsername(username);
    if (!admin) {
      clearRecoverySession(req);
      req.flash('error', 'La cuenta ya no existe.');
      return res.redirect('/admin/login');
    }

    await Admin.setPassword(admin.id, password);
    clearRecoverySession(req);
    req.flash('success', 'Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión.');
    res.redirect('/admin/login');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo actualizar la contraseña.');
    res.redirect('/admin/forgot-password');
  }
};

// ============================================================
// Alternativa: recibir una contraseña temporal por correo, en vez
// de responder la pregunta de seguridad. Funciona con el nombre de
// usuario o el correo de la cuenta.
//
// Por seguridad, la respuesta es SIEMPRE el mismo mensaje genérico
// exista o no la cuenta — así nadie puede usar este formulario para
// averiguar qué usuarios o correos están registrados.
// ============================================================
const GENERIC_EMAIL_SENT_MSG = 'Si esa cuenta existe y tiene un correo confirmado, le enviamos una contraseña temporal. Revisa la bandeja de entrada (y spam) en unos minutos.';

exports.showEmailForm = (req, res) => {
  res.render('admin/forgot-password-email', {
    pageTitle: 'Recuperar contraseña por correo',
    schoolName: SCHOOL_NAME(),
  });
};

exports.submitEmailRequest = async (req, res) => {
  const { identifier } = req.body;
  try {
    const admin = await Admin.findByUsernameOrEmail((identifier || '').trim());

    // Solo se envía si la cuenta existe, tiene correo, Y ese correo
    // ya está confirmado (una cuenta pendiente de confirmar todavía
    // no debería poder resetear su contraseña por esta vía).
    if (admin && admin.email && !EmailConfirmation.isPendingConfirmation(admin)) {
      const tempPassword = await Admin.assignTemporaryPassword(admin.id);
      const { subject, html, text } = temporaryPasswordEmail({
        schoolName: SCHOOL_NAME(),
        fullName: admin.full_name,
        username: admin.username,
        tempPassword,
        loginUrl: `${process.env.APP_URL || `${req.protocol}://${req.get('host')}`}/admin/login`,
      });
      await sendMail({ to: admin.email, subject, html, text });

      await ActivityLog.log({
        adminId: admin.id,
        adminUsername: admin.username,
        actionType: 'admin_temp_password_assigned',
        entityId: admin.id,
        entityLabel: `${admin.username} (autoservicio por correo)`,
      });
    }

    req.flash('success', GENERIC_EMAIL_SENT_MSG);
    res.redirect('/admin/login');
  } catch (err) {
    console.error(err);
    // Igual mensaje genérico también en caso de error, por la misma
    // razón (no revelar si la cuenta existe).
    req.flash('success', GENERIC_EMAIL_SENT_MSG);
    res.redirect('/admin/login');
  }
};
