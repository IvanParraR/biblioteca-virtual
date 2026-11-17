// ============================================================
// Primer administrador a partir de variables de entorno.
//
// Antes, schema.sql creaba el usuario admin / biblioteca123 (público
// en el repositorio). Ahora, si la tabla admins está VACÍA al arrancar,
// se crea el primer gestor con:
//   INITIAL_ADMIN_USERNAME   (obligatoria)
//   INITIAL_ADMIN_PASSWORD   (obligatoria; cumple la política de contraseñas)
//   INITIAL_ADMIN_NAME       (opcional, nombre completo)
// y queda con cambio de contraseña OBLIGATORIO en su primer ingreso.
// Si ya existe cualquier administrador, no hace nada (así que puedes
// borrar las variables después del primer arranque).
// ============================================================
const { isPasswordValid, passwordHint } = require('./passwordPolicy');

function readBootstrapConfig(env = process.env) {
  const username = (env.INITIAL_ADMIN_USERNAME || '').trim();
  const password = env.INITIAL_ADMIN_PASSWORD || '';
  const fullName = (env.INITIAL_ADMIN_NAME || '').trim() || 'Administrador de Biblioteca';

  if (!username && !password) return { ok: false, missing: true, reason: 'No hay variables INITIAL_ADMIN_*.' };
  if (!username || !password) return { ok: false, reason: 'Define INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD (las dos).' };
  if (!/^[A-Za-z0-9._-]{3,100}$/.test(username)) {
    return { ok: false, reason: 'INITIAL_ADMIN_USERNAME debe tener 3 a 100 caracteres: letras, números, punto, guion o guion bajo.' };
  }
  if (!isPasswordValid(password)) {
    return { ok: false, reason: `INITIAL_ADMIN_PASSWORD no cumple la política. ${passwordHint()}` };
  }
  return { ok: true, username, password, fullName };
}

// bcryptjs se carga solo al usarse (así las pruebas de la configuración
// no lo necesitan); `hash` se puede reemplazar en pruebas.
const defaultHash = (password) => require('bcryptjs').hash(password, 10);

async function ensureInitialAdmin(pool, env = process.env, logger = console, { hash = defaultHash } = {}) {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM admins');
  if (total > 0) return { created: false };

  const config = readBootstrapConfig(env);
  if (!config.ok) {
    logger.warn('⚠️  No hay ningún administrador en la base de datos, así que nadie puede entrar al panel.');
    logger.warn(`   ${config.reason}`);
    logger.warn('   Define INITIAL_ADMIN_USERNAME e INITIAL_ADMIN_PASSWORD y reinicia el servicio.');
    return { created: false };
  }

  const passwordHash = await hash(config.password);
  await pool.query(
    `INSERT INTO admins (username, password_hash, full_name, can_manage_admins, must_change_password)
     VALUES (?, ?, ?, 1, 1)`,
    [config.username, passwordHash, config.fullName]
  );
  logger.log(`🔑 Se creó el primer administrador "${config.username}" (deberá cambiar la contraseña al entrar).`);
  return { created: true, username: config.username };
}

module.exports = { readBootstrapConfig, ensureInitialAdmin };
