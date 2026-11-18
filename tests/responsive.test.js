const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'responsive.css'), 'utf8');
const head = fs.readFileSync(path.join(root, 'views', 'partials', 'head.ejs'), 'utf8');

test('responsive.css se carga después de style.css', () => {
  const base = head.indexOf('/css/style.css');
  const extra = head.indexOf('/css/responsive.css');
  assert.ok(base !== -1 && extra !== -1, 'falta alguno de los dos enlaces');
  assert.ok(extra > base, 'responsive.css debe ir después para poder ajustar a style.css');
});

test('el viewport sigue declarado', () => {
  assert.match(head, /name="viewport" content="width=device-width, initial-scale=1/);
});

test('las llaves del CSS están balanceadas', () => {
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  assert.equal(open, close);
});

test('los campos de formulario usan 16 px en celular (evita el zoom de iOS)', () => {
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*input, select, textarea \{ font-size: 16px; \}/);
});

test('ninguna vista enlaza style.css por su cuenta saltándose el head compartido', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ejs') && !full.endsWith(path.join('partials', 'head.ejs'))
        && fs.readFileSync(full, 'utf8').includes('css/style.css')) offenders.push(path.relative(root, full));
    }
  };
  walk(path.join(root, 'views'));
  assert.deepEqual(offenders, []);
});

test('los campos pueden encogerse (min-width: 0) y no se salen de su contenedor', () => {
  assert.match(css, /\.field \{ min-width: 0; \}/);
  assert.match(css, /\.field input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/);
});

test('las barras de filtros pasan a una columna en celulares angostos', () => {
  assert.match(css, /@media \(max-width: 420px\) \{[\s\S]*?\.filter-bar \{ grid-template-columns: minmax\(0, 1fr\);/);
});

test('el "span 2" escrito en las vistas se anula (solo se puede con !important)', () => {
  const views = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ejs') && /style="[^"]*grid-column:\s*span/.test(fs.readFileSync(full, 'utf8'))) {
        views.push(path.relative(root, full));
      }
    }
  };
  walk(path.join(root, 'views'));
  assert.ok(views.length >= 4, `esperaba al menos 4 vistas con span inline, hay ${views.length}`);
  assert.match(css, /\.filter-bar > \.field \{ grid-column: auto !important; \}/);
});

test('todo "span" escrito en una vista está dentro de una barra de filtros (la que lo anula)', () => {
  // Si alguien añade un span inline en otro tipo de cuadrícula, esta prueba
  // avisa para que decida si necesita su propia regla responsive.
  const dir = path.join(root, 'views');
  const offenders = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.ejs')) continue;
      const src = fs.readFileSync(full, 'utf8');
      if (/grid-column:\s*span/.test(src) && !/class="filter-bar"/.test(src)) offenders.push(path.relative(root, full));
    }
  };
  walk(dir);
  assert.deepEqual(offenders, []);
});

// ---------- Fuentes abiertas ----------
const openSources = fs.readFileSync(path.join(root, 'views', 'student', 'open-sources.ejs'), 'utf8');

test('Fuentes abiertas: las tres partes de la página tienen clase para poder reordenarse', () => {
  assert.match(openSources, /class="os-layout"[^>]*grid-template-columns:\s*240px 1fr/);
  assert.match(openSources, /class="form-card os-filters"/);
  assert.match(openSources, /<div class="os-results">/);
  assert.match(openSources, /class="os-tabs"/);
});

test('Fuentes abiertas: en celular las columnas se apilan con los resultados arriba', () => {
  const block = css.match(/@media \(max-width: 760px\) \{\s*\.os-layout[\s\S]*?\n\}/);
  assert.ok(block, 'falta el bloque de Fuentes abiertas en responsive.css');
  assert.match(block[0], /\.os-layout \{ grid-template-columns: minmax\(0, 1fr\) !important; \}/);
  assert.match(block[0], /\.os-results \{ order: 1; \}/);
  assert.match(block[0], /\.os-filters \{ order: 2; position: static !important; \}/);
});

test('Fuentes abiertas: el texto ya no dice "a la izquierda" (en celular no es cierto)', () => {
  assert.doesNotMatch(openSources.replace(/<!--[\s\S]*?-->/g, ''), /a la izquierda/);
});
