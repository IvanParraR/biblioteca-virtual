// ============================================================
// Paletas de color del sitio — la actual ("bosque") + 4 nuevas
// alternativas, todas diseñadas con el mismo sistema de 8
// variables (5 tonos primarios + 3 de acento) que ya usa
// public/css/style.css, así que elegir una paleta no requiere
// tocar ningún CSS: solo se sobreescriben los valores de esas
// variables con un <style> inline generado en cada página.
// ============================================================

const PALETTES = {
  bosque: {
    name: 'Bosque (verde + dorado)',
    swatchPrimary: '#1F3A2E',
    swatchAccent: '#C9A227',
    primary900: '#14261C', primary800: '#1F3A2E', primary700: '#2D5940', primary600: '#3D6E4F', primary100: '#E4ECE4',
    accent600: '#C9A227', accent500: '#D9B84A', accent100: '#F3E9C6',
  },
  oceano: {
    name: 'Océano (azul + coral)',
    swatchPrimary: '#175178',
    swatchAccent: '#E07A45',
    primary900: '#0B2436', primary800: '#0F3550', primary700: '#175178', primary600: '#226D9C', primary100: '#DCEBF3',
    accent600: '#E07A45', accent500: '#EC9868', accent100: '#FBE4D5',
  },
  atardecer: {
    name: 'Atardecer (terracota + crema)',
    swatchPrimary: '#8A4526',
    swatchAccent: '#D9A441',
    primary900: '#3A1E12', primary800: '#5A2E1C', primary700: '#8A4526', primary600: '#B15C34', primary100: '#F5E3D3',
    accent600: '#D9A441', accent500: '#E6BE6C', accent100: '#F8EDD1',
  },
  lavanda: {
    name: 'Lavanda (púrpura + dorado suave)',
    swatchPrimary: '#573E78',
    swatchAccent: '#C89A4A',
    primary900: '#241A34', primary800: '#372850', primary700: '#573E78', primary600: '#71559C', primary100: '#EBE3F5',
    accent600: '#C89A4A', accent500: '#DAB871', accent100: '#F6ECD3',
  },
  menta: {
    name: 'Marino (azul marino + menta)',
    swatchPrimary: '#1E3F5D',
    swatchAccent: '#2FA98D',
    primary900: '#0C1B2A', primary800: '#132A40', primary700: '#1E3F5D', primary600: '#2C5A7C', primary100: '#DCE7EE',
    accent600: '#2FA98D', accent500: '#4FC3A8', accent100: '#DDF3EC',
  },
};

const DEFAULT_PALETTE = 'bosque';

// Genera el bloque CSS que sobreescribe las variables del tema
// para la paleta elegida. Los valores vienen siempre de este
// archivo (nunca de lo que escribe el usuario), así que es seguro
// insertarlo sin escapar en las vistas.
function cssFor(key) {
  const p = PALETTES[key] || PALETTES[DEFAULT_PALETTE];
  return `:root{--forest-900:${p.primary900};--forest-800:${p.primary800};--forest-700:${p.primary700};--forest-600:${p.primary600};--forest-100:${p.primary100};--gold-600:${p.accent600};--gold-500:${p.accent500};--gold-100:${p.accent100};}`;
}

module.exports = { PALETTES, DEFAULT_PALETTE, cssFor };
