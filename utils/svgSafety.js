// ============================================================
// Revisión básica de SVG subidos. Un SVG es XML y puede llevar
// <script>, handlers onload=... o enlaces javascript: — si alguien
// abre el archivo directamente, esos scripts correrían con el
// origen del sitio. Es una segunda barrera: además los SVG de
// /uploads se sirven con una CSP "sandbox" (ver middleware/security.js).
// No pretende ser un sanitizador completo: ante la duda, rechaza.
// ============================================================

function isSvgSafe(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');

  if (!/<svg[\s>]/i.test(text)) return false;                       // ni siquiera es un SVG
  if (/<\s*script/i.test(text)) return false;                       // scripts
  if (/<\s*(foreignObject|iframe|embed|object)\b/i.test(text)) return false; // HTML incrustado
  if (/[\s"'/]on[a-z]+\s*=/i.test(text)) return false;              // onload=, onclick=, ...
  if (/javascript\s*:/i.test(text)) return false;                   // enlaces javascript:
  if (/<!ENTITY/i.test(text)) return false;                         // entidades XML (XXE / "billion laughs")
  // href / xlink:href solo hacia anclas internas (#id) o imágenes data:
  const hrefs = text.match(/(?:xlink:)?href\s*=\s*["'][^"']*["']/gi) || [];
  for (const h of hrefs) {
    const value = h.replace(/^[^=]*=\s*["']/, '').replace(/["']$/, '').trim();
    if (!(value.startsWith('#') || /^data:image\/(png|jpe?g|gif|webp);/i.test(value))) return false;
  }
  return true;
}

module.exports = { isSvgSafe };
