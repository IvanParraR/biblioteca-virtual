// ============================================================
// Envío de los 3 correos relacionados con préstamos:
//   1. Comprobante al prestar — SIEMPRE se envía (no configurable).
//   2. Recordatorio de vencimiento — solo si el estudiante lo tiene
//      activado en sus preferencias (notify_due_reminder).
//   3. Aviso de turno en lista de espera — SIEMPRE se envía.
//
// Usado tanto por el lado admin (registra un préstamo en persona)
// como por el lado estudiante (autoservicio) — un solo lugar para
// esta lógica evita tenerla duplicada en dos controladores.
// ============================================================
const Loan = require('../models/Loan');
const Student = require('../models/Student');
const Settings = require('../models/Settings');
const { sendMail } = require('../config/mailer');
const { loanConfirmationEmail, dueReminderEmail, waitlistTurnEmail } = require('./emailTemplates');

const SCHOOL_NAME = () => Settings.get().school_name;

function myLoansUrl(appUrl) {
  return `${appUrl}/mi-cuenta/prestamos`;
}

// Se llama justo después de un Loan.create() exitoso. Si el
// estudiante no tiene correo confirmado (cuenta creada por el
// bibliotecario, sin auto-registro), no hay a quién mandarle nada
// y no pasa nada.
async function sendLoanConfirmation(loanId, appUrl) {
  const loan = await Loan.findById(loanId);
  if (!loan) return;
  const student = await Student.findById(loan.student_id);
  if (!student || !student.email || !student.email_confirmed_at) return;

  const { subject, html, text } = loanConfirmationEmail({
    schoolName: SCHOOL_NAME(),
    fullName: student.full_name,
    bookTitle: loan.book_title,
    dueDate: new Date(loan.due_date).toLocaleDateString('es-CO'),
    myLoansUrl: myLoansUrl(appUrl),
  });
  await sendMail({ to: student.email, subject, html, text });
}

// Corre periódicamente (ver app.js): busca préstamos que vencen en
// 2 días y todavía no se avisaron, manda el correo, y marca
// reminder_sent_at para no repetirlo.
async function sendDueReminders(appUrl) {
  const due = await Loan.findDueForReminder();
  for (const loan of due) {
    const { subject, html, text } = dueReminderEmail({
      schoolName: SCHOOL_NAME(),
      fullName: loan.student_name,
      bookTitle: loan.book_title,
      dueDate: new Date(loan.due_date).toLocaleDateString('es-CO'),
      myLoansUrl: myLoansUrl(appUrl),
    });
    try {
      await sendMail({ to: loan.student_email || undefined, subject, html, text });
    } catch (err) {
      console.warn(`No se pudo enviar el recordatorio del préstamo #${loan.id}:`, err.message);
    }
    await Loan.markReminderSent(loan.id);
  }
  return due.length;
}

// `entry` es lo que devuelven Waitlist.notifyNext() /
// expireStaleHolds() — ya trae book_title, student_name, student_email.
async function sendWaitlistTurnNotification(entry, appUrl) {
  if (!entry || !entry.student_email) return;
  const { subject, html, text } = waitlistTurnEmail({
    schoolName: SCHOOL_NAME(),
    fullName: entry.student_name,
    bookTitle: entry.book_title,
    holdExpiresAt: new Date(entry.hold_expires_at).toLocaleString('es-CO'),
    myLoansUrl: myLoansUrl(appUrl),
  });
  await sendMail({ to: entry.student_email, subject, html, text });
}

module.exports = { sendLoanConfirmation, sendDueReminders, sendWaitlistTurnNotification };
