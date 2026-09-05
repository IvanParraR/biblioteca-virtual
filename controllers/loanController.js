const Loan = require('../models/Loan');
const Book = require('../models/Book');
const Student = require('../models/Student');
const ActivityLog = require('../models/ActivityLog');
const Settings = require('../models/Settings');

const SCHOOL_NAME = () => Settings.get().school_name;

exports.list = async (req, res) => {
  try {
    const { q, view, page } = req.query;
    const activeView = view === 'history' ? 'history' : 'active';

    if (activeView === 'history') {
      const result = await Loan.listHistory({ q, page: parseInt(page, 10) || 1, perPage: 20 });
      return res.render('admin/loans', {
        pageTitle: 'Préstamos',
        schoolName: SCHOOL_NAME(),
        admin: req.session.admin,
        activeView,
        q: q || '',
        loans: result.loans,
        totalPages: result.totalPages,
        currentPage: result.currentPage,
        currentUrl: req.originalUrl,
        maxRenewals: Loan.MAX_RENEWALS,
        loanDays: Loan.loanDaysDefault(),
      });
    }

    const loans = await Loan.listActive({ q });
    res.render('admin/loans', {
      pageTitle: 'Préstamos',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      activeView,
      q: q || '',
      loans,
      totalPages: 1,
      currentPage: 1,
      currentUrl: req.originalUrl,
      maxRenewals: Loan.MAX_RENEWALS,
      loanDays: Loan.loanDaysDefault(),
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudieron cargar los préstamos.');
    res.render('admin/loans', {
      pageTitle: 'Préstamos',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      activeView: 'active',
      q: '',
      loans: [],
      totalPages: 1,
      currentPage: 1,
      currentUrl: req.originalUrl,
      maxRenewals: Loan.MAX_RENEWALS,
      loanDays: Loan.loanDaysDefault(),
    });
  }
};

exports.showNewForm = async (req, res) => {
  try {
    const allBooks = await Book.all();
    const availableBooks = allBooks.filter((b) => b.available_copies > 0 && !b.library_only);
    res.render('admin/new-loan', {
      pageTitle: 'Nuevo préstamo',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      books: availableBooks,
      preselectedBookId: req.query.book_id ? parseInt(req.query.book_id, 10) : null,
      defaultDueDate: Loan.defaultDueDate(),
      loanDays: Loan.loanDaysDefault(),
      formValues: {},
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar el formulario de préstamo.');
    res.redirect('/admin/loans');
  }
};

// Usado por el buscador de estudiantes del formulario de préstamo
// (fetch en vivo mientras el admin escribe, en vez de cargar los
// cientos de estudiantes de una vez en un <select>).
exports.searchStudents = async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 1) return res.json([]);
  try {
    const students = await Student.search(q, 15);
    res.json(students.map((s) => ({
      id: s.id,
      full_name: s.full_name,
      student_code: s.student_code,
      grade: s.grade,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
};

exports.create = async (req, res) => {
  const { book_id, due_date, is_new_student, student_id, new_student_name, new_student_code, new_student_grade } = req.body;

  try {
    if (!book_id) throw new Loan.LoanError('Selecciona un libro.');

    let finalStudentId = student_id;

    if (is_new_student === '1') {
      if (!new_student_name || !new_student_name.trim()) {
        throw new Loan.LoanError('Escribe el nombre del estudiante nuevo.');
      }
      const student = await Student.create({
        fullName: new_student_name.trim(),
        studentCode: new_student_code ? new_student_code.trim() : null,
        grade: new_student_grade ? new_student_grade.trim() : null,
      });
      finalStudentId = student.id;
    } else if (!student_id) {
      throw new Loan.LoanError('Selecciona un estudiante o registra uno nuevo.');
    }

    const loanId = await Loan.create({
      bookId: parseInt(book_id, 10),
      studentId: parseInt(finalStudentId, 10),
      dueDate: due_date || null,
      loanedBy: req.session.admin.username,
    });

    const [book, loan] = await Promise.all([Book.findById(book_id), Loan.findById(loanId)]);

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'loan_created',
      entityId: loanId,
      entityLabel: `"${book ? book.title : 'libro #' + book_id}" → ${loan ? loan.student_name : 'estudiante'}`,
      details: `Fecha límite: ${loan ? loan.due_date : ''}`,
    });

    req.flash('success', `Préstamo registrado: "${book ? book.title : ''}" para ${loan ? loan.student_name : 'el estudiante'}.`);
    res.redirect('/admin/loans');
  } catch (err) {
    if (err instanceof Loan.LoanError) {
      req.flash('error', err.message);
    } else {
      console.error(err);
      req.flash('error', 'No se pudo registrar el préstamo.');
    }
    res.redirect(`/admin/loans/new${book_id ? `?book_id=${book_id}` : ''}`);
  }
};

exports.markReturned = async (req, res) => {
  try {
    const loanBefore = await Loan.findById(req.params.id);
    await Loan.markReturned(req.params.id, req.session.admin.username);

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'loan_returned',
      entityId: parseInt(req.params.id, 10),
      entityLabel: loanBefore ? `"${loanBefore.book_title}" → ${loanBefore.student_name}` : `préstamo #${req.params.id}`,
    });

    req.flash('success', 'Préstamo marcado como devuelto.');
  } catch (err) {
    if (err instanceof Loan.LoanError) {
      req.flash('error', err.message);
    } else {
      console.error(err);
      req.flash('error', 'No se pudo marcar el préstamo como devuelto.');
    }
  }
  // redirect_to viene de un campo oculto con la URL desde la que se
  // envió el formulario (lista de activos o historial, con sus
  // filtros/página tal como estaban) — evita depender del header
  // Referer, que no siempre llega. Se valida que sea una ruta propia
  // de préstamos para no volverse una redirección abierta.
  const redirectTo = req.body.redirect_to;
  res.redirect(redirectTo && redirectTo.startsWith('/admin/loans') ? redirectTo : '/admin/loans');
};

exports.renew = async (req, res) => {
  try {
    const loan = await Loan.renew(req.params.id, req.session.admin.username);

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'loan_renewed',
      entityId: parseInt(req.params.id, 10),
      entityLabel: `"${loan.book_title}" → ${loan.student_name || ''}`,
      details: `Nueva fecha límite: ${loan.due_date}`,
    });

    req.flash('success', `Préstamo renovado — nueva fecha límite: ${new Date(loan.due_date).toLocaleDateString('es-CO')}.`);
  } catch (err) {
    if (err instanceof Loan.LoanError) {
      req.flash('error', err.message);
    } else {
      console.error(err);
      req.flash('error', 'No se pudo renovar el préstamo.');
    }
  }
  const redirectTo = req.body.redirect_to;
  res.redirect(redirectTo && redirectTo.startsWith('/admin/loans') ? redirectTo : '/admin/loans');
};
