const Settings = require('../models/Settings');
const Student = require('../models/Student');
const Loan = require('../models/Loan');
const ActivityLog = require('../models/ActivityLog');

const SCHOOL_NAME = () => Settings.get().school_name;

exports.list = async (req, res) => {
  try {
    await Student.deleteExpiredPending();
    const { q } = req.query;
    let students;
    if (q) {
      students = await Student.search(q, 200);
    } else {
      students = await Student.all();
    }
    res.render('admin/students', {
      pageTitle: 'Estudiantes',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      students,
      q: q || '',
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar la lista de estudiantes.');
    res.redirect('/admin/dashboard');
  }
};

exports.show = async (req, res) => {
  try {
    const [student, stats, history] = await Promise.all([
      Student.findPublicById(req.params.id),
      Student.stats(req.params.id),
      Loan.historyForStudent(req.params.id),
    ]);
    if (!student) {
      req.flash('error', 'Ese estudiante no existe.');
      return res.redirect('/admin/students');
    }
    res.render('admin/student-detail', {
      pageTitle: student.full_name,
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      student,
      stats,
      history,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar la ficha del estudiante.');
    res.redirect('/admin/students');
  }
};

exports.setStatus = async (req, res) => {
  try {
    const student = await Student.findPublicById(req.params.id);
    await Student.setStatus(req.params.id, req.body.status);
    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'student_status_changed',
      entityId: parseInt(req.params.id, 10),
      entityLabel: student ? student.full_name : `estudiante #${req.params.id}`,
      details: req.body.status === 'inactive' ? 'Desactivada' : 'Reactivada',
    });
    req.flash('success', req.body.status === 'inactive' ? 'Cuenta desactivada.' : 'Cuenta reactivada.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cambiar el estado de la cuenta.');
  }
  res.redirect(`/admin/students/${req.params.id}`);
};
