require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');

const { testConnection } = require('./config/db');
const Settings = require('./models/Settings');
const Palettes = require('./models/Palettes');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');

const app = express();

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
  next();
});

// ---------- Rutas ----------
app.use('/admin', authRoutes);
app.use('/admin', adminRoutes);
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
});
