// Crea un error cuyo mensaje SÍ es seguro mostrar al usuario
// (ej. "Formato de imagen no permitido"). El manejador de errores
// global solo muestra mensajes de errores marcados así.
function userError(message) {
  const err = new Error(message);
  err.expose = true;
  return err;
}

module.exports = { userError };
