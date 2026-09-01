const Settings = require('../models/Settings');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const LoginLockout = require('../models/LoginLockout');

const SCHOOL_NAME = () => Settings.get().school_name;

exports.showLogin = (req, res) => {
  res.render('admin/login', {
    pageTitle: 'Acceso administrador',
    schoolName: SCHOOL_NAME(),
  });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  // Un identificador por nombre de usuario intentado (incluso si no
  // existe) — evita que alguien distinga "usuario inválido" de
  // "contraseña inválida" a partir del comportamiento del bloqueo.
  const lockoutId = `login:${(username || '').trim().toLowerCase()}`;

  try {
    const lockStatus = await LoginLockout.check(lockoutId);
    if (lockStatus.locked) {
      req.flash('error', `Demasiados intentos fallidos. Intenta de nuevo en ${lockStatus.minutesLeft} minuto${lockStatus.minutesLeft === 1 ? '' : 's'}.`);
      return res.redirect('/admin/login');
    }

    const [rows] = await pool.query('SELECT * FROM admins WHERE username = ?', [username]);
    const admin = rows[0];

    const valid = admin ? await bcrypt.compare(password, admin.password_hash) : false;

    if (!valid) {
      const result = await LoginLockout.recordFailure(lockoutId);
      if (result.lockedNow) {
        req.flash('error', `Demasiados intentos fallidos. Tu acceso quedó bloqueado por ${LoginLockout.LOCK_DURATION_MINUTES} minutos.`);
      } else {
        req.flash('error', `Usuario o contraseña incorrectos. Te quedan ${result.attemptsLeft} intento${result.attemptsLeft === 1 ? '' : 's'} antes de un bloqueo temporal.`);
      }
      return res.redirect('/admin/login');
    }

    await LoginLockout.recordSuccess(lockoutId);

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
