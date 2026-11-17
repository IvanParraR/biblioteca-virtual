require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const helmet = require('helmet');
const path = require('path');

const { pool, waitForConnection } = require('./config/db');
const Settings = require('./models/Settings');
const Modules = require('./models/Modules');
const Palettes = require('./models/Palettes');
const Admin = require('./models/Admin');
const Student = require('./models/Student');
const Waitlist = require('./models/Waitlist');
const { sendDueReminders, sendWaitlistTurnNotification } = require('./utils/loanNotifications');
const studentRoutes = require('./routes/student');
const studentAuthRoutes = require('./routes/studentAuth');
const studentAccountRoutes = require('./routes/studentAccount');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const { requireModule } = require('./middleware/modules');
const {
  helmetOptions,
  resolveSessionSecret,
  sessionCookieOptions,
  uploadsStaticHeaders,
  sameOriginOnly,
} = require('./middleware/security');
const { errorHandler } = require('./middleware/errorHandler');
const requestContext = require('./utils/requestContext');
const { createSessionStore } = require('./config/sessionStore');
const { runMigrations } = require('./utils/migrationRunner');
const { ensureInitialAdmin } = require('./utils/bootstrapAdmin');
const ActivityLog = require('./models/ActivityLog');

// Si la app corre en producción sin un SESSION_SECRET válido, esta
// línea lanza un error con instrucciones y el servidor no arranca.
const sessionSecret = resolveSessionSecret();

const app = express();

// Railway (y la mayoría de PaaS) ponen la app detrás de un proxy que
// termina el HTTPS por ella. Sin esto, Express no confía en el
// encabezado X-Forwarded-* que manda ese proxy, y cosas como
// req.secure o cookies "secure" quedarían mal detectadas en
// producción. En local (sin proxy) no cambia nada.
app.set('trust proxy', 1);

// ---------- Cabeceras de seguridad ----------
// helmet con sus valores por defecto. La CSP va en modo "solo reporte"
// hasta que se active con CSP_ENFORCE=true (ver middleware/security.js).
app.use(helmet(helmetOptions()));

// ---------- Healthcheck de Railway ----------
// Solo confirma que el proceso responde: a propósito NO consulta la
// base de datos, para que un fallo momentáneo de MySQL no haga que
// Railway reinicie la app.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ---------- Configuración de vistas ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- Middleware de gestión de datos ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: uploadsStaticHeaders }));

// Protección CSRF: toda petición que modifica datos debe venir del
// propio sitio (ver middleware/security.js). APP_URL, si existe, se
// acepta además del host de la petición.
const allowedHosts = [];
try {
  if (process.env.APP_URL) allowedHosts.push(new URL(process.env.APP_URL).host);
} catch (err) {
  console.warn('APP_URL no es una URL válida; se ignora para la verificación de origen.');
}
app.use(sameOriginOnly({ allowedHosts }));

// IP y navegador de la petición disponibles para el historial de actividad.
app.use(requestContext.middleware);

// Sesiones en MySQL (tabla `sessions`, migración 002): un reinicio o un
// deploy ya no cierra la sesión de todos.
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: createSessionStore(session),
    cookie: sessionCookieOptions(),
  })
);
app.use(flash());

// Variables disponibles en todas las vistas. El nombre del colegio y
// de la biblioteca virtual salen de la caché en memoria de Settings
// (cargada al iniciar el servidor y actualizada cuando un gestor
// guarda cambios desde Panel de administración → Configuración) —
// así cualquier vista los muestra al instante y siempre al día,
// sin necesitar una consulta a la base de datos por cada request.
app.use((req, res, next) => {
  res.locals.successMsg = req.flash('success');
  res.locals.errorMsg = req.flash('error');
  res.locals.currentPath = req.path;
  const settings = Settings.get();
  res.locals.schoolNameGlobal = settings.school_name;
  res.locals.libraryNameGlobal = settings.library_name;
  // Objeto completo (logo, bienvenida, contacto, mantenimiento) para
  // que cualquier vista lo use sin que cada controlador tenga que
  // pasarlo a mano — y el CSS de la paleta elegida, listo para
  // insertarse tal cual en <head>.
  res.locals.siteSettings = settings;
  res.locals.paletteCSSOverride = Palettes.cssFor(settings.color_palette);
  // Para que cualquier vista pública (nav, header) sepa si hay un
  // estudiante logueado sin que cada controlador lo tenga que pasar
  // a mano — igual que con schoolNameGlobal arriba.
  // Qué módulos están encendidos, para que cada vista oculte lo que
  // no aplica. Con Usuarios apagado, una sesión de estudiante abierta
  // se trata como si no hubiera nadie logueado.
  res.locals.modules = Modules.get();
  res.locals.student = (Modules.isEnabled('usuarios') && req.session && req.session.student) || null;
  next();
});

// ---------- Rutas ----------
app.use('/admin', authRoutes);
app.use('/admin', adminRoutes);
app.use('/', studentAuthRoutes);
app.use('/mi-cuenta', requireModule('usuarios'), studentAccountRoutes);
app.use('/', studentRoutes);

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).render('errors/404', {
    pageTitle: 'Página no encontrada',
    schoolName: Settings.get().school_name,
  });
});

// ---------- Manejo de errores ----------
// Nunca muestra al usuario el mensaje interno de un error (ver
// middleware/errorHandler.js).
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Antes de aceptar tráfico: espera a MySQL, aplica las migraciones
// pendientes (database/migrations) y crea el primer administrador si
// la tabla está vacía. Si una migración falla, el proceso termina: el
// deploy no pasa el healthcheck y Railway deja la versión anterior
// en línea. Sin conexión a MySQL (p. ej. desarrollo sin base) la app
// arranca igual y lo avisa, como antes.
async function prepareDatabase() {
  const connected = await waitForConnection();
  if (!connected) {
    console.warn('⚠️  Sin conexión a MySQL: no se aplicaron migraciones. Revisa tu .env (ver .env.example).');
    return;
  }
  console.log('✅ Conectado a MySQL:', process.env.DB_NAME || process.env.MYSQLDATABASE || 'biblioteca_virtual');

  if (process.env.RUN_MIGRATIONS !== 'false') {
    await runMigrations(pool, { dir: path.join(__dirname, 'database', 'migrations') });
  }
  await ensureInitialAdmin(pool);
}

async function start() {
  await prepareDatabase();
  await Settings.load();
  await Modules.load();

  app.listen(PORT, () => {
    console.log(`📚 Biblioteca Virtual corriendo en http://localhost:${PORT}`);

    // Limpieza de cuentas de admin creadas con correo que nunca se
    // confirmaron dentro de las 24 horas. Corre una vez al arrancar y
    // luego cada 30 minutos — no hace falta un servicio de cron aparte
    // para algo de este tamaño; el proceso de Node ya queda corriendo
    // de forma continua en Railway.
    const cleanupExpiredAdmins = async () => {
      try {
        const deleted = await Admin.deleteExpiredPending();
        if (deleted > 0) {
          console.log(`🧹 Se eliminaron ${deleted} cuenta(s) de administrador nunca confirmadas (vencidas hace más de 24h).`);
        }
      } catch (err) {
        console.warn('No se pudo correr la limpieza de cuentas pendientes vencidas:', err.message);
      }
    };

    // Lo mismo, para cuentas de estudiante nunca confirmadas.
    const cleanupExpiredStudents = async () => {
      if (!Modules.isEnabled('usuarios')) return;
      try {
        const deleted = await Student.deleteExpiredPending();
        if (deleted > 0) {
          console.log(`🧹 Se eliminaron ${deleted} cuenta(s) de estudiante nunca confirmadas (vencidas hace más de 24h).`);
        }
      } catch (err) {
        console.warn('No se pudo correr la limpieza de cuentas de estudiante vencidas:', err.message);
      }
    };

    // Recordatorio de vencimiento (2 días antes), a quienes lo tengan
    // activado en preferencias — ver models/Loan.js -> findDueForReminder.
    const appUrlForJobs = process.env.APP_URL || `http://localhost:${PORT}`;
    const runDueReminders = async () => {
      if (!Modules.isEnabled('prestamos')) return;
      try {
        const count = await sendDueReminders(appUrlForJobs);
        if (count > 0) console.log(`✉️  Se enviaron ${count} recordatorio(s) de vencimiento.`);
      } catch (err) {
        console.warn('No se pudo correr el envío de recordatorios de vencimiento:', err.message);
      }
    };

    // Cupos de lista de espera avisados cuyo plazo de 48h ya venció —
    // se le pasa el turno a la siguiente persona en la fila (y se le
    // avisa por correo).
    const expireWaitlistHolds = async () => {
      if (!Modules.isEnabled('prestamos')) return;
      try {
        const newlyNotified = await Waitlist.expireStaleHolds();
        for (const entry of newlyNotified) {
          await sendWaitlistTurnNotification(entry, appUrlForJobs).catch((err) => console.warn('No se pudo avisar a la lista de espera:', err.message));
        }
      } catch (err) {
        console.warn('No se pudo correr la revisión de cupos de lista de espera:', err.message);
      }
    };

    cleanupExpiredAdmins();
    cleanupExpiredStudents();
    runDueReminders();
    expireWaitlistHolds();
    setInterval(cleanupExpiredAdmins, 30 * 60 * 1000);
    setInterval(cleanupExpiredStudents, 30 * 60 * 1000);
    setInterval(runDueReminders, 30 * 60 * 1000);
    setInterval(expireWaitlistHolds, 30 * 60 * 1000);

    // Retención de datos personales del historial: borra eventos de sesión
    // viejos y anonimiza la IP/navegador de todo lo anterior (ver
    // ActivityLog.purgeOldEvents). Una vez al arrancar y luego cada 24 horas.
    const purgeOldActivity = async () => {
      try {
        const { deleted, anonymized, keepDays } = await ActivityLog.purgeOldEvents(process.env.LOG_RETENTION_DAYS);
        if (deleted > 0 || anonymized > 0) {
          console.log(`🧹 Historial (más de ${keepDays} días): ${deleted} evento(s) de sesión borrados, ${anonymized} registro(s) con IP anonimizada.`);
        }
      } catch (err) {
        console.warn('No se pudo aplicar la retención del historial de actividad:', err.message);
      }
    };
    purgeOldActivity();
    setInterval(purgeOldActivity, 24 * 60 * 60 * 1000);
  });
}

start().catch((err) => {
  console.error('❌ No se pudo iniciar la aplicación:', err.message);
  process.exit(1);
});
