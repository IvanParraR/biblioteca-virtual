require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');

const { testConnection } = require('./config/db');
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

// Variables disponibles en todas las vistas
app.use((req, res, next) => {
  res.locals.successMsg = req.flash('success');
  res.locals.errorMsg = req.flash('error');
  res.locals.currentPath = req.path;
  res.locals.schoolNameGlobal = process.env.SCHOOL_NAME || 'Biblioteca Escolar';
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
    schoolName: process.env.SCHOOL_NAME || 'Biblioteca Escolar',
  });
});

// ---------- Manejo de errores ----------
app.use((err, req, res, next) => {
  console.error(err);
  if (req.flash) req.flash('error', err.message || 'Ocurrió un error inesperado.');
  res.redirect('back' in req.headers ? req.headers.referer : '/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📚 Biblioteca Virtual corriendo en http://localhost:${PORT}`);
  testConnection();
});
