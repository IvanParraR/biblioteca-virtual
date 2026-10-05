const Settings = require('../models/Settings');
const Student = require('../models/Student');
const Loan = require('../models/Loan');
const Book = require('../models/Book');
const Waitlist = require('../models/Waitlist');
const SavedReference = require('../models/SavedReference');
const { isPasswordValid, passwordHint } = require('../utils/passwordPolicy');
const { isPhoneValid, isGradeValid, GRADES } = require('../utils/validators');

const SCHOOL_NAME = () => Settings.get().school_name;

exports.dashboard = async (req, res) => {
  try {
    const [student, stats] = await Promise.all([
      Student.findPublicById(req.session.student.id),
      Student.stats(req.session.student.id),
    ]);
    res.render('student/account/dashboard', {
      pageTitle: 'Mi cuenta',
      schoolName: SCHOOL_NAME(),
      student,
      stats,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar tu cuenta.');
    res.redirect('/');
  }
};

exports.loans = async (req, res) => {
  try {
    const [active, history] = await Promise.all([
      Loan.activeForStudent(req.session.student.id),
      Loan.historyForStudent(req.session.student.id),
    ]);
    res.render('student/account/loans', {
      pageTitle: 'Mis préstamos',
      schoolName: SCHOOL_NAME(),
      active,
      history,
      maxRenewals: Loan.MAX_RENEWALS,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudieron cargar tus préstamos.');
    res.redirect('/mi-cuenta');
  }
};

exports.showEdit = async (req, res) => {
  try {
    const student = await Student.findPublicById(req.session.student.id);
    res.render('student/account/edit', {
      pageTitle: 'Editar mi perfil',
      schoolName: SCHOOL_NAME(),
      student,
      grades: GRADES,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar tu perfil.');
    res.redirect('/mi-cuenta');
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { full_name, grade, phone, notify_due_reminder } = req.body;
    if (!full_name || !full_name.trim()) {
      req.flash('error', 'El nombre no puede quedar vacío.');
      return res.redirect('/mi-cuenta/editar');
    }
    if (grade && !isGradeValid(grade)) {
      req.flash('error', 'Selecciona un grado válido de la lista.');
      return res.redirect('/mi-cuenta/editar');
    }
    if (!isPhoneValid(phone)) {
      req.flash('error', 'Ese teléfono no parece válido — usa solo números, espacios o guiones, con el indicativo de país si quieres (ej. +57 300 123 4567).');
      return res.redirect('/mi-cuenta/editar');
    }
    await Student.updateProfile(req.session.student.id, {
      full_name: full_name.trim(),
      grade,
      phone,
      photo_url: null, // la subida de foto todavía no está conectada — ver nota en el resumen
    });
    await Student.setNotifyDueReminder(req.session.student.id, notify_due_reminder === 'on');
    req.session.student.full_name = full_name.trim();
    req.flash('success', 'Perfil actualizado.');
    res.redirect('/mi-cuenta');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo actualizar tu perfil.');
    res.redirect('/mi-cuenta/editar');
  }
};

exports.showChangePassword = (req, res) => {
  res.render('student/account/change-password', {
    pageTitle: 'Cambiar contraseña',
    schoolName: SCHOOL_NAME(),
    forced: !!req.session.student.must_change_password,
  });
};

exports.changePassword = async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  try {
    const student = await Student.findById(req.session.student.id);
    const forced = !!student.must_change_password;

    // Si la cuenta no está en modo "cambio forzado" (login normal
    // con contraseña temporal ya resuelto), se exige la contraseña
    // actual como confirmación de identidad.
    if (!forced) {
      const valid = await Student.verifyPassword(student, current_password || '');
      if (!valid) {
        req.flash('error', 'La contraseña actual no es correcta.');
        return res.redirect('/mi-cuenta/contrasena');
      }
    }
    if (!new_password || !isPasswordValid(new_password)) {
      req.flash('error', `Contraseña insegura. ${passwordHint()}`);
      return res.redirect('/mi-cuenta/contrasena');
    }
    if (new_password !== confirm_password) {
      req.flash('error', 'Las dos contraseñas nuevas no coinciden.');
      return res.redirect('/mi-cuenta/contrasena');
    }

    await Student.setPassword(student.id, new_password);
    req.session.student.must_change_password = false;
    req.flash('success', 'Contraseña actualizada.');
    res.redirect('/mi-cuenta');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo actualizar la contraseña.');
    res.redirect('/mi-cuenta/contrasena');
  }
};

// --- Lista de espera ---

exports.myWaitlist = async (req, res) => {
  try {
    const entries = await Waitlist.activeForStudent(req.session.student.id);
    res.render('student/account/waitlist', {
      pageTitle: 'Mi lista de espera',
      schoolName: SCHOOL_NAME(),
      entries,
      holdHours: Waitlist.HOLD_HOURS,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar tu lista de espera.');
    res.redirect('/mi-cuenta');
  }
};

exports.joinWaitlist = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) throw new Error('Ese libro no existe.');
    if (Number(book.available_copies) > 0) {
      req.flash('error', 'Ese libro tiene copias disponibles ahora mismo — puedes prestarlo directamente, no hace falta lista de espera.');
      return res.redirect(`/libro/${req.params.id}`);
    }
    await Waitlist.join(req.params.id, req.session.student.id);
    req.flash('success', `Te anotamos en la lista de espera de "${book.title}" — te avisamos por correo cuando te toque.`);
  } catch (err) {
    req.flash('error', err.code === 'ALREADY_WAITING' ? err.message : (err.message || 'No se pudo unir a la lista de espera.'));
  }
  res.redirect(`/libro/${req.params.id}`);
};

exports.cancelWaitlist = async (req, res) => {
  try {
    await Waitlist.cancel(req.params.id, req.session.student.id);
    req.flash('success', 'Saliste de la lista de espera.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo salir de la lista de espera.');
  }
  res.redirect('/mi-cuenta/espera');
};

// --- Mis referencias (Fuentes Abiertas) ---

exports.references = async (req, res) => {
  try {
    const references = await SavedReference.forStudent(req.session.student.id);
    res.render('student/account/references', {
      pageTitle: 'Mis referencias',
      schoolName: SCHOOL_NAME(),
      references,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudieron cargar tus referencias.');
    res.redirect('/mi-cuenta');
  }
};

exports.deleteReference = async (req, res) => {
  try {
    await SavedReference.delete(req.params.id, req.session.student.id);
    req.flash('success', 'Referencia eliminada.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo eliminar la referencia.');
  }
  res.redirect('/mi-cuenta/referencias');
};
