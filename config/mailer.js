// ============================================================
// config/mailer.js — envío de correos (confirmación de cuenta,
// contraseña temporal, etc.) usando la API HTTP de Brevo.
//
// Por qué API y no SMTP: Railway bloquea las conexiones SMTP
// salientes (puertos 25/465/587/2525) en el plan Hobby — solo las
// permite desde el plan Pro para arriba. La API de Brevo viaja por
// HTTPS (puerto 443), que nunca está bloqueado, así que funciona
// igual en local y en Railway sin depender del plan.
//
// Variables de entorno necesarias:
//   BREVO_API_KEY   — tu API key de Brevo (Settings → SMTP & API →
//                      pestaña API, botón "Generate a new API key").
//                      NO es la SMTP key ni tu contraseña de Brevo.
//   EMAIL_FROM      — el correo remitente (debe estar verificado en
//                      Brevo: Senders, Domains & Dedicated IPs →
//                      Senders → Add a sender).
//   EMAIL_FROM_NAME — nombre que se muestra como remitente
//                      (opcional, por defecto "Biblioteca Virtual").
//
// Si BREVO_API_KEY o EMAIL_FROM faltan (por ejemplo, en desarrollo
// local sin haberlos configurado todavía), NO se lanza error: el
// correo se imprime en la consola del servidor en vez de enviarse
// de verdad, para poder probar el flujo completo sin depender de
// una cuenta real.
// ============================================================

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

let warnedOnce = false;

function isConfigured() {
  return !!(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

async function sendMail({ to, subject, html, text }) {
  if (!isConfigured()) {
    if (!warnedOnce) {
      console.warn('✉️  Brevo no configurado todavía (faltan BREVO_API_KEY/EMAIL_FROM) — los correos se imprimirán en esta consola en vez de enviarse de verdad.');
      warnedOnce = true;
    }
    console.log('--- ✉️  CORREO (modo de prueba, no enviado de verdad) ---');
    console.log('Para:', to);
    console.log('Asunto:', subject);
    console.log(text || html);
    console.log('--- fin del correo ---');
    return { sent: false, simulated: true };
  }

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: process.env.EMAIL_FROM_NAME || 'Biblioteca Virtual',
        email: process.env.EMAIL_FROM,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API respondió ${res.status}: ${body}`);
  }

  return { sent: true, simulated: false };
}

module.exports = { sendMail, isConfigured };
