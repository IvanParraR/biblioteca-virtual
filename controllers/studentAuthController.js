const Settings = require('../models/Settings');
const Student = require('../models/Student');
const StudentEmailDomain = require('../models/StudentEmailDomain');
const EmailConfirmation = require('../models/EmailConfirmation');
const LoginLockout = require('../models/LoginLockout');
const { sendMail } = require('../config/mailer');
const { confirmationEmail, temporaryPasswordEmail } = require('../utils/emailTemplates');
const { isPasswordValid, passwordHint } = require('../utils/passwordPolicy');
const { isGradeValid, GRADES } = require('../utils/validators');

const SCHOOL_NAME = () => Settings.get().school_name;

function baseUrl(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

exports.showRegister = (req, res) => {
  res.render('student/register', {
    pageTitle: 'Crear cuenta',
    schoolName: SCHOOL_NAME(),
    grades: GRADES,
  });
};

exports.register = async (req, res) => {
  const { full_name, student_code, grade, email, password } = req.body;
  try {
    if (!full_name || !full_name.trim() || !email || !password) {
      req.flash('error', 'El nombre, el correo y la contraseña son obligatorios.');
      return res.redirect('/registro');
    }
    if (!isPasswordValid(password)) {
      req.flash('error', `Contraseña insegura. ${passwordHint()}`);
      return res.redirect('/registro');
    }
    if (grade && !isGradeValid(grade.trim())) {
      req.flash('error', 'Selecciona un grado válido de la lista.');
      return res.redirect('/registro');
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      req.flash('error', 'Ese correo no tiene un formato válido.');
      return res.redirect('/registro');
    }

    const domainAllowed = await StudentEmailDomain.isAllowed(cleanEmail);
    if (!domainAllowed) {
      const domains = await StudentEmailDomain.all();
      req.flash('error', `Ese dominio de correo no está permitido. Dominios aceptados: ${domains.map((d) => d.domain).join(', ')}.`);
      return res.redirect('/registro');
    }

    const { id, confirmationToken, claimed } = await Student.claimOrRegister({
      fullName: full_name.trim(),
      studentCode: student_code ? student_code.trim() : null,
      grade: grade ? grade.trim() : null,
      email: cleanEmail,
      password,
    });

    const confirmUrl = `${baseUrl(req)}/confirmar-correo/${confirmationToken}`;
    const { subject, html, text } = confirmationEmail({ schoolName: SCHOOL_NAME(), fullName: full_name, confirmUrl });
    // El envío va aparte de la creación de la cuenta a propósito: la
    // cuenta ya quedó creada en la base en la línea de arriba, así
    // que si el correo falla (SMTP mal configurado, credenciales
    // rechazadas, etc.) no debe verse como si hubiera fallado el
    // registro completo — el estudiante ya existe, solo que el
    // correo de confirmación no salió. Se intenta enviar sin
    // bloquear la respuesta, y si falla, queda en el log del
    // servidor para que el admin lo note.
    let emailSent = true;
    try {
      await sendMail({ to: cleanEmail, subject, html, text });
    } catch (mailErr) {
      emailSent = false;
      console.error('No se pudo enviar el correo de confirmación de cuenta:', mailErr.message);
    }

    if (emailSent) {
      req.flash('success', claimed
        ? `Encontramos tu registro con ese código y le agregamos tu cuenta — te enviamos un correo a ${cleanEmail} para confirmarla. Tienes 24 horas.`
        : `Cuenta creada — te enviamos un correo a ${cleanEmail} para confirmarla. Tienes 24 horas antes de que se elimine sola si no confirmas.`);
    } else {
      req.flash('error', `Tu cuenta se creó, pero no pudimos enviarte el correo de confirmación a ${cleanEmail} (hubo un problema técnico enviando correos). Avisa a la biblioteca para que lo revisen — tu cuenta quedará pendiente y se eliminará sola en 24 horas si no se confirma.`);
    }
    res.redirect('/iniciar-sesion');
  } catch (err) {
    if (err.code === 'ALREADY_CLAIMED') {
      req.flash('error', err.message);
    } else if (err.code === 'ER_DUP_ENTRY') {
      req.flash('error', 'Ya existe una cuenta registrada con ese correo.');
    } else {
      console.error(err);
      req.flash('error', 'No se pudo crear la cuenta.');
    }
    res.redirect('/registro');
  }
};

exports.showLogin = (req, res) => {
  res.render('student/login', {
    pageTitle: 'Iniciar sesión',
    schoolName: SCHOOL_NAME(),
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const lockoutId = `studentlogin:${(email || '').trim().toLowerCase()}`;

  try {
    const lockStatus = await LoginLockout.check(lockoutId);
    if (lockStatus.locked) {
      req.flash('error', `Demasiados intentos fallidos. Intenta de nuevo en ${lockStatus.minutesLeft} minuto${lockStatus.minutesLeft === 1 ? '' : 's'}.`);
      return res.redirect('/iniciar-sesion');
    }

    const student = await Student.findByEmail((email || '').trim().toLowerCase());

    if (student && EmailConfirmation.isPendingConfirmation(student)) {
      req.flash('error', 'Tu cuenta todavía no ha sido confirmada. Revisa el correo que te enviamos al registrarte (el enlace vence 24 horas después).');
      return res.redirect('/iniciar-sesion');
    }
    if (student && student.status === 'inactive') {
      req.flash('error', 'Esta cuenta está inactiva. Contacta a la biblioteca si crees que es un error.');
      return res.redirect('/iniciar-sesion');
    }

    const valid = student ? await Student.verifyPassword(student, password) : false;

    if (!valid) {
      const result = await LoginLockout.recordFailure(lockoutId);
      if (result.lockedNow) {
        req.flash('error', `Demasiados intentos fallidos. Tu acceso quedó bloqueado por ${LoginLockout.LOCK_DURATION_MINUTES} minutos.`);
      } else {
        req.flash('error', `Correo o contraseña incorrectos. Te quedan ${result.attemptsLeft} intento${result.attemptsLeft === 1 ? '' : 's'} antes de un bloqueo temporal.`);
      }
      return res.redirect('/iniciar-sesion');
    }

    await LoginLockout.recordSuccess(lockoutId);

    req.session.student = {
      id: student.id,
      full_name: student.full_name,
      email: student.email,
      must_change_password: !!student.must_change_password,
    };
    res.redirect('/mi-cuenta');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo conectar con la base de datos.');
    res.redirect('/iniciar-sesion');
  }
};

exports.logout = (req, res) => {
  delete req.session.student;
  res.redirect('/iniciar-sesion');
};

// Confirmación de cuenta nueva — pública, sin sesión.
exports.confirmEmail = async (req, res) => {
  try {
    const student = await Student.confirmEmail(req.params.token);
    res.render('student/confirm-email', {
      pageTitle: 'Confirmar cuenta',
      schoolName: SCHOOL_NAME(),
      success: !!student,
      fullName: student ? student.full_name : null,
    });
  } catch (err) {
    console.error(err);
    res.render('student/confirm-email', {
      pageTitle: 'Confirmar cuenta',
      schoolName: SCHOOL_NAME(),
      success: false,
      fullName: null,
    });
  }
};

const GENERIC_EMAIL_SENT_MSG = 'Si esa cuenta existe y tiene un correo confirmado, le enviamos una contraseña temporal. Revisa la bandeja de entrada (y spam) en unos minutos.';

exports.showForgotPasswordEmail = (req, res) => {
  res.render('student/forgot-password-email', {
    pageTitle: 'Recuperar contraseña',
    schoolName: SCHOOL_NAME(),
  });
};

exports.submitForgotPasswordEmail = async (req, res) => {
  try {
    const student = await Student.findByEmail((req.body.email || '').trim().toLowerCase());
    if (student && !EmailConfirmation.isPendingConfirmation(student) && student.status !== 'inactive') {
      const tempPassword = await Student.assignTemporaryPassword(student.id);
      const { subject, html, text } = temporaryPasswordEmail({
        schoolName: SCHOOL_NAME(),
        fullName: student.full_name,
        username: null,
        tempPassword,
        loginUrl: `${baseUrl(req)}/iniciar-sesion`,
      });
      await sendMail({ to: student.email, subject, html, text });
    }
    req.flash('success', GENERIC_EMAIL_SENT_MSG);
    res.redirect('/iniciar-sesion');
  } catch (err) {
    console.error(err);
    req.flash('success', GENERIC_EMAIL_SENT_MSG);
    res.redirect('/iniciar-sesion');
  }
};
