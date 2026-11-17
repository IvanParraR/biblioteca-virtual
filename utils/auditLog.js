// ============================================================
// Atajos para registrar en el historial los eventos de ACCESO y las
// acciones de ESTUDIANTES. La IP y el navegador salen solos de la
// petición en curso (utils/requestContext.js).
// ============================================================
const ActivityLog = require('../models/ActivityLog');
const { sanitizeLoginIdentifier } = require('./requestContext');

// Intento de acceso sin sesión (fallido o bloqueado). `account` es la
// cuenta encontrada (si existe) y `typed` lo que se escribió en el campo.
function logAnonymousAccess({ actionType, account, typed, details }) {
  return ActivityLog.log({
    actorType: 'anonymous',
    adminId: actionType.startsWith('admin_') && account ? account.id : null,
    studentId: actionType.startsWith('student_') && account ? account.id : null,
    adminUsername: (account && (account.username || account.email)) || sanitizeLoginIdentifier(typed) || '(no válido)',
    actionType,
    details,
  });
}

// Acción de un estudiante con sesión iniciada (req.session.student).
function logStudent(req, actionType, extra = {}) {
  const student = req.session && req.session.student;
  return ActivityLog.log({
    actorType: 'student',
    studentId: student ? student.id : null,
    adminUsername: student ? student.email : '(estudiante)',
    actionType,
    ...extra,
  });
}

module.exports = { logAnonymousAccess, logStudent };
