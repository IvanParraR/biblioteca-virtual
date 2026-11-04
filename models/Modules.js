// ============================================================
// Modelo Modules — qué partes opcionales del sitio están encendidas.
// Admin y Catálogo son la base y no aparecen aquí: siempre existen.
//
// Para agregar un módulo nuevo: declararlo en MODULES, proteger sus
// rutas con requireModule('clave') (middleware/modules.js) y ocultar
// sus enlaces en las vistas con modules.clave.
//
// Igual que Settings, se lee desde una caché en memoria para que
// cualquier vista lo consulte de forma SÍNCRONA. Apagar un módulo
// nunca borra sus datos: al encenderlo de nuevo todo sigue ahí.
//
// Hay dos estados distintos:
//   - guardado: lo que el gestor marcó en el panel.
//   - efectivo: guardado + todas sus dependencias encendidas. Es el
//     que usa el resto de la app (ver get() e isEnabled()).
// Se guardan por separado para que encender de nuevo una dependencia
// (ej. Usuarios) devuelva Préstamos a como estaba, sin volver a marcarlo.
// ============================================================
const { pool } = require('../config/db');

const MODULES = {
  usuarios: {
    name: 'Usuarios',
    description: 'Cuentas de estudiantes: registro, inicio de sesión, "Mi cuenta" y la sección Estudiantes del panel.',
    requires: [],
  },
  prestamos: {
    name: 'Préstamos',
    description: 'Registro de préstamos y devoluciones, lista de espera y recordatorios por correo.',
    requires: ['usuarios'],
  },
  fuentes_abiertas: {
    name: 'Fuentes abiertas',
    description: 'Búsqueda de libros y artículos de acceso abierto, con citas APA y "Mis referencias".',
    requires: [],
  },
  categorias: {
    name: 'Categorías',
    description: 'Clasificación de libros: filtros, página de categorías y su gestión en el panel.',
    requires: [],
  },
};

// Si una fila no existe, el módulo está encendido: una instalación que
// recién actualiza el código sigue funcionando igual que antes.
let saved = Object.fromEntries(Object.keys(MODULES).map((key) => [key, true]));

function computeEffective(states) {
  const isOn = (key) => states[key] && MODULES[key].requires.every(isOn);
  return Object.fromEntries(Object.keys(MODULES).map((key) => [key, isOn(key)]));
}

let effective = computeEffective(saved);

const Modules = {
  MODULES,

  // Mapa { clave: true/false } con el estado efectivo.
  get() {
    return effective;
  },

  isEnabled(key) {
    return !!effective[key];
  },

  // Lista para la pantalla de Módulos, con lo necesario para explicar
  // por qué un módulo marcado puede estar apagado de todos modos.
  list() {
    return Object.entries(MODULES).map(([key, def]) => ({
      key,
      ...def,
      saved: saved[key],
      active: effective[key],
      requiresNames: def.requires.map((dep) => MODULES[dep].name),
      missingNames: def.requires.filter((dep) => !saved[dep]).map((dep) => MODULES[dep].name),
    }));
  },

  // Si la tabla no existe todavía (falta correr la migración) todos
  // quedan encendidos, sin tumbar la app.
  async load() {
    try {
      const [rows] = await pool.query('SELECT module_key, enabled FROM site_modules');
      const next = { ...saved };
      rows.forEach((row) => {
        if (MODULES[row.module_key]) next[row.module_key] = !!row.enabled;
      });
      saved = next;
      effective = computeEffective(saved);
    } catch (err) {
      console.warn('⚠️  No se pudo cargar site_modules (¿falta correr database/migrate_modules.sql?). Todos los módulos quedan encendidos.');
    }
    return effective;
  },

  // `states` es { clave: true/false }. Las claves que no estén en
  // MODULES se ignoran.
  async update(states, updatedByUsername) {
    const rows = Object.keys(MODULES).map((key) => [key, states[key] ? 1 : 0, updatedByUsername || null]);
    await pool.query(
      `INSERT INTO site_modules (module_key, enabled, updated_by)
       VALUES ?
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_by = VALUES(updated_by)`,
      [rows]
    );
    await Modules.load();
  },
};

module.exports = Modules;
