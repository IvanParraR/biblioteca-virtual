require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');

const { testConnection } = require('./config/db');
const Settings = require('./models/Settings');
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

const app = express();

// Railway (y la mayoría de PaaS) ponen la app detrás de un proxy que
// termina el HTTPS por ella. Sin esto, Express no confía en el
// encabezado X-Forwarded-* que manda ese proxy, y cosas como
// req.secure o cookies "secure" quedarían mal detectadas en
// producción. En local (sin proxy) no cambia nada.
app.set('trust proxy', 1);

// ---------- Configuración de vistas ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- Middleware de gestión de datos ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'clave-de-desarrollo-cambia-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 horas
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
  res.locals.student = (req.session && req.session.student) || null;
  next();
});

// ---------- Rutas ----------
app.use('/admin', authRoutes);
app.use('/admin', adminRoutes);
app.use('/', studentAuthRoutes);
app.use('/mi-cuenta', studentAccountRoutes);
app.use('/', studentRoutes);

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).render('errors/404', {
    pageTitle: 'Página no encontrada',
    schoolName: Settings.get().school_name,
  });
});

// ---------- Manejo de errores ----------
app.use((err, req, res, next) => {
  console.error(err);
  if (req.flash) req.flash('error', err.message || 'Ocurrió un error inesperado.');
  res.redirect('back' in req.headers ? req.headers.referer : '/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`📚 Biblioteca Virtual corriendo en http://localhost:${PORT}`);
  await testConnection();
  await Settings.load();

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
});
