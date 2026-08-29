const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

exports.showLogin = (req, res) => {
  res.render('admin/login', {
    pageTitle: 'Acceso administrador',
    schoolName: process.env.SCHOOL_NAME || 'Biblioteca Escolar',
  });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM admins WHERE username = ?', [username]);
    const admin = rows[0];

    if (!admin) {
      req.flash('error', 'Usuario o contraseña incorrectos.');
      return res.redirect('/admin/login');
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      req.flash('error', 'Usuario o contraseña incorrectos.');
      return res.redirect('/admin/login');
    }

    req.session.admin = {
      id: admin.id,
      username: admin.username,
      full_name: admin.full_name,
      can_manage_admins: !!admin.can_manage_admins,
      must_change_password: !!admin.must_change_password,
    };
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo conectar con la base de datos. Revisa la configuración de MySQL.');
    res.redirect('/admin/login');
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
};
