// ============================================================
// Plantillas de correo — HTML simple e inline (sin motor de
// plantillas aparte), con los mismos colores del sistema de
// diseño (verde bosque + dorado) para que se sientan parte de
// la misma aplicación.
// ============================================================
const FOREST_DARK = '#1F3A2E';
const GOLD = '#C9A227';

function wrapper(schoolName, bodyHtml) {
  return `
    <div style="font-family:Georgia,serif; max-width:480px; margin:0 auto; padding:24px; color:#22281F;">
      <div style="background:${FOREST_DARK}; color:#fff; padding:18px 24px; border-radius:10px 10px 0 0;">
        <strong style="font-size:1.1rem;">${schoolName}</strong><br>
        <span style="font-size:0.85rem; opacity:0.85;">Biblioteca Virtual</span>
      </div>
      <div style="border:1px solid #E0DCC9; border-top:none; padding:24px; border-radius:0 0 10px 10px;">
        ${bodyHtml}
      </div>
      <p style="font-size:0.75rem; color:#7C8A78; text-align:center; margin-top:16px;">
        Este es un correo automático — no respondas a este mensaje.
      </p>
    </div>
  `;
}

function confirmationEmail({ schoolName, fullName, confirmUrl }) {
  const html = wrapper(schoolName, `
    <p>Hola${fullName ? ` ${fullName}` : ''},</p>
    <p>Se solicitó crear una cuenta de administrador de la biblioteca con este correo. Confirma que fuiste tú dando clic en el siguiente botón:</p>
    <p style="text-align:center; margin:26px 0;">
      <a href="${confirmUrl}" style="background:${GOLD}; color:#1F3A2E; text-decoration:none; font-weight:bold; padding:12px 26px; border-radius:8px; display:inline-block;">Confirmar mi cuenta</a>
    </p>
    <p style="font-size:0.85rem; color:#4E5A4C;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>${confirmUrl}</p>
    <p style="font-size:0.85rem; color:#4E5A4C;"><strong>Este enlace vence en 24 horas.</strong> Si no confirmas a tiempo, la cuenta se elimina automáticamente y tendrán que crearla de nuevo.</p>
    <p style="font-size:0.85rem; color:#4E5A4C;">Si tú no pediste esta cuenta, puedes ignorar este correo.</p>
  `);
  const text = `Confirma tu cuenta de administrador de ${schoolName} entrando a: ${confirmUrl}\nEste enlace vence en 24 horas.`;
  return { subject: `Confirma tu cuenta — ${schoolName}`, html, text };
}

function temporaryPasswordEmail({ schoolName, fullName, username, tempPassword, loginUrl }) {
  const html = wrapper(schoolName, `
    <p>Hola${fullName ? ` ${fullName}` : ''},</p>
    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta${username ? ` (<strong>${username}</strong>)` : ''}. Esta es tu contraseña temporal:</p>
    <p style="text-align:center; margin:22px 0;">
      <code style="background:#F2EFE2; padding:10px 18px; border-radius:8px; font-size:1.1rem; letter-spacing:1px;">${tempPassword}</code>
    </p>
    <p style="text-align:center; margin:22px 0;">
      <a href="${loginUrl}" style="background:${GOLD}; color:#1F3A2E; text-decoration:none; font-weight:bold; padding:12px 26px; border-radius:8px; display:inline-block;">Iniciar sesión</a>
    </p>
    <p style="font-size:0.85rem; color:#4E5A4C;">Al entrar, el sistema te va a pedir que definas una contraseña nueva antes de continuar — la temporal de arriba deja de servir en cuanto la cambies.</p>
    <p style="font-size:0.85rem; color:#4E5A4C;">Si tú no pediste este cambio, contacta a un administrador con permiso de gestión lo antes posible.</p>
  `);
  const text = `Tu contraseña temporal${username ? ` para ${username}` : ''} en ${schoolName} es: ${tempPassword}\nEntra en: ${loginUrl}\nEl sistema te pedirá cambiarla al iniciar sesión.`;
  return { subject: `Tu contraseña temporal — ${schoolName}`, html, text };
}

function loanConfirmationEmail({ schoolName, fullName, bookTitle, dueDate, myLoansUrl }) {
  const html = wrapper(schoolName, `
    <p>Hola${fullName ? ` ${fullName}` : ''},</p>
    <p>Se registró tu préstamo. Aquí el comprobante:</p>
    <div style="background:#F2EFE2; border-radius:8px; padding:16px 20px; margin:18px 0;">
      <p style="margin:0 0 6px;"><strong>Libro:</strong> ${bookTitle}</p>
      <p style="margin:0;"><strong>Fecha límite de devolución:</strong> ${dueDate}</p>
    </div>
    <p style="text-align:center; margin:22px 0;">
      <a href="${myLoansUrl}" style="background:${GOLD}; color:#1F3A2E; text-decoration:none; font-weight:bold; padding:12px 26px; border-radius:8px; display:inline-block;">Ver mis préstamos</a>
    </p>
    <p style="font-size:0.85rem; color:#4E5A4C;">Te avisaremos por correo un par de días antes de que venza, si tienes esa opción activada en tus preferencias.</p>
  `);
  const text = `Préstamo registrado: "${bookTitle}", fecha límite ${dueDate}. Revisa tus préstamos en: ${myLoansUrl}`;
  return { subject: `Comprobante de préstamo — ${bookTitle}`, html, text };
}

function dueReminderEmail({ schoolName, fullName, bookTitle, dueDate, myLoansUrl }) {
  const html = wrapper(schoolName, `
    <p>Hola${fullName ? ` ${fullName}` : ''},</p>
    <p>Tu préstamo de "<strong>${bookTitle}</strong>" vence pronto:</p>
    <div style="background:#F2EFE2; border-radius:8px; padding:16px 20px; margin:18px 0; text-align:center;">
      <strong style="font-size:1.05rem;">Fecha límite: ${dueDate}</strong>
    </div>
    <p style="text-align:center; margin:22px 0;">
      <a href="${myLoansUrl}" style="background:${GOLD}; color:#1F3A2E; text-decoration:none; font-weight:bold; padding:12px 26px; border-radius:8px; display:inline-block;">Ver mis préstamos</a>
    </p>
    <p style="font-size:0.85rem; color:#4E5A4C;">Puedes desactivar este recordatorio desde tus preferencias, dentro de tu cuenta.</p>
  `);
  const text = `Tu préstamo de "${bookTitle}" vence el ${dueDate}. Revisa tus préstamos en: ${myLoansUrl}`;
  return { subject: `Tu préstamo vence pronto — ${bookTitle}`, html, text };
}

function waitlistTurnEmail({ schoolName, fullName, bookTitle, holdExpiresAt, myLoansUrl }) {
  const html = wrapper(schoolName, `
    <p>Hola${fullName ? ` ${fullName}` : ''},</p>
    <p>¡Buenas noticias! Ya hay una copia disponible de "<strong>${bookTitle}</strong>", el libro que tenías en lista de espera.</p>
    <p>Tienes un cupo reservado <strong>hasta ${holdExpiresAt}</strong> para venir a prestarlo — pasado ese plazo, el turno pasa a la siguiente persona en la fila.</p>
    <p style="text-align:center; margin:22px 0;">
      <a href="${myLoansUrl}" style="background:${GOLD}; color:#1F3A2E; text-decoration:none; font-weight:bold; padding:12px 26px; border-radius:8px; display:inline-block;">Ir a la biblioteca</a>
    </p>
  `);
  const text = `"${bookTitle}" ya está disponible para ti — tienes hasta ${holdExpiresAt} para reclamarlo antes de que pase al siguiente en la fila.`;
  return { subject: `Ya te toca — "${bookTitle}" está disponible`, html, text };
}

module.exports = {
  confirmationEmail,
  temporaryPasswordEmail,
  loanConfirmationEmail,
  dueReminderEmail,
  waitlistTurnEmail,
};
