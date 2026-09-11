// Dominios de correo permitidos al AUTO-REGISTRARSE un estudiante.
// Lista separada de models/EmailDomain.js (esa es solo para cuando
// un gestor crea una cuenta de administrador) — con auto-registro
// abierto, esta es la barrera principal contra registros externos.
module.exports = require('./makeEmailDomainList')('allowed_student_email_domains');
