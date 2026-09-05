// ============================================================
// Modelo Settings — toda la "Información general" del sitio,
// editable desde el panel (solo gestores):
//   1. Presentación: logo, nombre del colegio, nombre de la biblioteca
//   2. Mensaje de bienvenida del inicio (título + bajada)
//   3. Contacto y horario (se muestra en el pie de página)
//   4. Paleta de colores del tema
//   5. Modo mantenimiento (aviso no bloqueante para estudiantes)
//
// Se guardan en una fila única de site_settings, pero se leen desde
// una caché en memoria para que cualquier vista los muestre de
// forma SÍNCRONA sin una consulta por cada request. La caché se
// actualiza automáticamente al guardar cambios (ver update()).
// ============================================================
const { pool } = require('../config/db');
const { DEFAULT_PALETTE } = require('./Palettes');

const DEFAULTS = {
  school_name: process.env.SCHOOL_NAME || 'Biblioteca Escolar',
  library_name: 'Biblioteca Virtual',
  logo_url: null,
  color_palette: DEFAULT_PALETTE,
  welcome_title: '',
  welcome_message: '',
  address: '',
  city: '',
  phone: '',
  email: '',
  hours: '',
  social_facebook: '',
  social_instagram: '',
  social_twitter: '',
  social_whatsapp: '',
  maintenance_mode: false,
  loan_days_default: 7,
};

let cache = { ...DEFAULTS };

// Todas las columnas de texto/booleanas editables desde el panel,
// en el orden en que update() las escribe. Centralizarlo aquí evita
// tener que repetir la lista en tres lugares distintos.
const FIELDS = [
  'school_name', 'library_name', 'logo_url', 'color_palette',
  'welcome_title', 'welcome_message',
  'address', 'city', 'phone', 'email', 'hours',
  'social_facebook', 'social_instagram', 'social_twitter', 'social_whatsapp',
  'maintenance_mode', 'loan_days_default',
];

const Settings = {
  FIELDS,

  // Lectura síncrona — usar en cualquier parte del código que ya
  // asumía que estos datos estaban disponibles al instante.
  get() {
    return cache;
  },

  // Carga la fila real desde la base de datos hacia la caché. Se
  // llama al iniciar el servidor y de nuevo cada vez que se guardan
  // cambios. Si la tabla no existe todavía (falta correr la
  // migración) se queda con los valores por defecto sin tumbar la app.
  async load() {
    try {
      const [rows] = await pool.query('SELECT * FROM site_settings WHERE id = 1');
      if (rows[0]) {
        const row = rows[0];
        cache = {
          ...DEFAULTS,
          ...Object.fromEntries(FIELDS.map((f) => [f, row[f] ?? DEFAULTS[f]])),
          maintenance_mode: !!row.maintenance_mode,
        };
      }
    } catch (err) {
      console.warn('⚠️  No se pudo cargar site_settings (¿falta correr database/migrate_general_info.sql?). Usando valores por defecto.');
    }
    return cache;
  },

  async update(fields, updatedByUsername) {
    const values = FIELDS.map((f) => {
      const v = fields[f];
      if (f === 'maintenance_mode') return v ? 1 : 0;
      return v === undefined || v === null ? null : v;
    });

    const columns = FIELDS.join(', ');
    const placeholders = FIELDS.map(() => '?').join(', ');
    const updateClause = FIELDS.map((f) => `${f} = VALUES(${f})`).join(', ');

    await pool.query(
      `INSERT INTO site_settings (id, ${columns}, updated_by)
       VALUES (1, ${placeholders}, ?)
       ON DUPLICATE KEY UPDATE ${updateClause}, updated_by = VALUES(updated_by)`,
      [...values, updatedByUsername || null]
    );
    await Settings.load();
  },

  // Lee la fila completa directamente de la base de datos (incluye
  // quién hizo el último cambio y cuándo). Se usa solo en la propia
  // pantalla de Información general, no en la caché de lectura rápida.
  async getFull() {
    const [rows] = await pool.query('SELECT * FROM site_settings WHERE id = 1');
    if (!rows[0]) return { ...cache, updated_by: null, updated_at: null };
    return { ...rows[0], maintenance_mode: !!rows[0].maintenance_mode };
  },
};

module.exports = Settings;
