// Guarda contra un error fácil de cometer: registrar en el historial una
// acción cuyo tipo no está definido en ActivityLog.ACTION_TYPES (quedaría
// con la etiqueta cruda y la entidad "other"). Lee los archivos como texto,
// así no necesita base de datos ni dependencias.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const modelSource = read('models/ActivityLog.js');
const defined = new Set([...modelSource.matchAll(/^\s{2}([a-z_]+): \{ label:/gm)].map((m) => m[1]));

function usedActionTypes() {
  const used = new Set();
  const dirs = ['controllers', 'utils', 'middleware'];
  for (const dir of dirs) {
    for (const file of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js'))) {
      const src = read(path.join(dir, file));
      for (const m of src.matchAll(/actionType:\s*'([a-z_]+)'/g)) used.add(m[1]);
      for (const m of src.matchAll(/logStudent\(req,\s*'([a-z_]+)'/g)) used.add(m[1]);
    }
  }
  return used;
}

test('hay tipos de acción definidos (el análisis funciona)', () => {
  assert.ok(defined.size > 30, `solo encontró ${defined.size}`);
  assert.ok(defined.has('admin_login') && defined.has('student_login_failed'));
});

test('todo tipo de acción usado en el código existe en ACTION_TYPES', () => {
  const missing = [...usedActionTypes()].filter((t) => !defined.has(t));
  assert.deepEqual(missing, [], `Faltan en ActivityLog.ACTION_TYPES: ${missing.join(', ')}`);
});

test('los eventos de acceso y de estudiantes quedan registrados en el código', () => {
  const used = usedActionTypes();
  for (const t of [
    'admin_login', 'admin_logout', 'admin_login_failed', 'admin_login_blocked',
    'student_registered', 'student_login', 'student_logout', 'student_login_failed', 'student_login_blocked',
    'student_password_changed', 'student_waitlist_joined', 'student_waitlist_left', 'student_reference_deleted',
  ]) {
    assert.ok(used.has(t), `ningún controlador registra ${t}`);
  }
});

test('ninguna acción nueva de sesión/estudiante es "deshacible"', () => {
  const undoable = modelSource.match(/UNDOABLE_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)[1];
  assert.doesNotMatch(undoable, /login|logout|student_|session/);
});
