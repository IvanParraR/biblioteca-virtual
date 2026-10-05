// ============================================================
// Formato de autores en APA (7ma edición) — compartido por
// models/OpenAlex.js y models/OpenLibrary.js para no duplicar la
// lógica entre los dos modos de Fuentes Abiertas.
//
// Limitación conocida de esta primera versión: asume que la última
// palabra del nombre es el apellido (funciona bien para nombres
// occidentales simples, no siempre acierta con apellidos compuestos
// o el orden "apellido nombre" que usan algunas fuentes). Suficiente
// para una primera versión — se puede refinar después si se nota
// que falla seguido.
// ============================================================

function nameToApaInitial(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map((p) => (p[0] ? `${p[0].toUpperCase()}.` : '')).join(' ');
  return `${last}, ${initials}`.trim();
}

// Sigue la regla de APA 7: hasta 20 autores se listan todos (con "&"
// antes del último); más de 20 se trunca con "..." antes del último.
function formatAuthorsApa(authors) {
  const list = (authors || []).filter(Boolean);
  if (list.length === 0) return 'Autor desconocido';
  const formatted = list.map(nameToApaInitial);
  if (formatted.length === 1) return formatted[0];
  if (formatted.length <= 20) {
    return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
  }
  return `${formatted.slice(0, 19).join(', ')}, ... ${formatted[formatted.length - 1]}`;
}

module.exports = { nameToApaInitial, formatAuthorsApa };
