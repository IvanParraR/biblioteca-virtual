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
//
// SMTP_INSECURE_SKIP_TLS_VERIFY=true — SOLO PARA DIAGNÓSTICO LOCAL.
// Ignora la validación del certificado TLS; existe para el caso de
// "self-signed certificate in certificate chain" que suele causar
// un antivirus o proxy interceptando el tráfico HTTPS en tu propia
// máquina/red. Nunca actives esto en Railway ni en ningún entorno
// real — baja la seguridad de la conexión (ya no confirma que de
// verdad estás hablando con los servidores de Gmail). Quítala de tu
// .env en cuanto termines de diagnosticar.
// ============================================================
const nodemailer = require('nodemailer');

let transporter = null;
let warnedOnce = false;
let warnedInsecureOnce = false;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    const insecure = process.env.SMTP_INSECURE_SKIP_TLS_VERIFY === 'true';
    if (insecure && !warnedInsecureOnce) {
      console.warn('⚠️  SMTP_INSECURE_SKIP_TLS_VERIFY está activo — la validación del certificado TLS está DESACTIVADA. Esto es solo para diagnóstico local: quítalo de tu .env en cuanto termines de probar.');
      warnedInsecureOnce = true;
    }
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: parseInt(process.env.SMTP_PORT, 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      tls: insecure ? { rejectUnauthorized: false } : undefined,
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
