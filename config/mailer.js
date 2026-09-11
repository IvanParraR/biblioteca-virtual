// ============================================================
// config/mailer.js — envío de correos (confirmación de cuenta,
// contraseña temporal). Usa SMTP mediante variables de entorno:
//
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
//
// Para Gmail: activa la verificación en 2 pasos en la cuenta que
// vaya a enviar los correos y genera una "contraseña de aplicación"
// en https://myaccount.google.com/apppasswords — esa es la que va
// en SMTP_PASSWORD (no la contraseña normal de la cuenta). Con Gmail:
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=465
//   SMTP_USER=tu-cuenta@gmail.com
//   SMTP_PASSWORD=<contraseña de aplicación, 16 caracteres>
//   SMTP_FROM=tu-cuenta@gmail.com
// ============================================================
const nodemailer = require('nodemailer');

let transporter = null;
let warnedOnce = false;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: parseInt(process.env.SMTP_PORT, 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

// Envía un correo. Si no hay SMTP configurado todavía (por ejemplo,
// en un entorno de prueba local sin credenciales reales), NO lanza
// error: en su lugar imprime el contenido en la consola del
// servidor, para que el flujo completo (confirmar cuenta, resetear
// contraseña) se pueda probar de punta a punta sin depender de un
// proveedor de correo real. Cuando SMTP_HOST/USER/PASSWORD estén
// configurados (por ejemplo en Railway), el envío real se activa
// solo con eso — no hay que tocar código.
async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();

  if (!t) {
    if (!warnedOnce) {
      console.warn('✉️  SMTP no configurado todavía (faltan SMTP_HOST/SMTP_USER/SMTP_PASSWORD) — los correos se imprimirán en esta consola en vez de enviarse de verdad.');
      warnedOnce = true;
    }
    console.log('--- ✉️  CORREO (modo de prueba, no enviado de verdad) ---');
    console.log('Para:', to);
    console.log('Asunto:', subject);
    console.log(text || html);
    console.log('--- fin del correo ---');
    return { sent: false, simulated: true };
  }

  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
  });
  return { sent: true, simulated: false };
}

module.exports = { sendMail, isConfigured };
