// ============================================================
// Validadores compartidos de campos sueltos que antes eran texto
// libre: teléfono (acepta indicativo de país con +) y grado
// (lista cerrada en vez de cualquier texto).
// ============================================================

// Acepta un + opcional al inicio (indicativo de país, ej. +57),
// seguido solo de dígitos, espacios, guiones o paréntesis.
// Es opcional en los formularios — cadena vacía siempre es válida.
const PHONE_PATTERN = /^\+?[0-9\s\-()]{7,20}$/;

function isPhoneValid(phone) {
  if (!phone || !phone.trim()) return true;
  return PHONE_PATTERN.test(phone.trim());
}

// Grados de colegio en Colombia (por el indicativo +57 del
// ejemplo) — sin secciones (A/B/C): eso puede seguir siendo texto
// aparte si algún día hace falta, este selector solo fija el nivel.
const GRADES = ['Transición', '1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°', '10°', '11°'];

function isGradeValid(grade) {
  if (!grade) return true; // opcional
  return GRADES.includes(grade);
}

module.exports = { PHONE_PATTERN, isPhoneValid, GRADES, isGradeValid };
