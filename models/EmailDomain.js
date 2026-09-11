// Dominios de correo permitidos al crear una cuenta de ADMINISTRADOR.
// Ver models/makeEmailDomainList.js para la lógica compartida, y
// models/StudentEmailDomain.js para la lista equivalente de
// estudiantes (separada a propósito).
module.exports = require('./makeEmailDomainList')('allowed_email_domains');
