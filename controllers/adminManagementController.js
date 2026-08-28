const Admin = require('../models/Admin');

const SCHOOL_NAME = () => process.env.SCHOOL_NAME || 'Biblioteca Escolar';

exports.list = async (req, res) => {
  try {
    const admins = await Admin.all();
    res.render('admin/admins', {
      pageTitle: 'Administradores',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      admins,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar la lista de administradores.');
    res.redirect('/admin/dashboard');
  }
};

exports.create = async (req, res) => {
  try {
    const { username, password, full_name, can_manage_admins } = req.body;

    if (!username || !password) {
      req.flash('error', 'El usuario y la contraseña son obligatorios.');
      return res.redirect('/admin/admins');
    }
    if (password.length < 8) {
      req.flash('error', 'La contraseña debe tener al menos 8 caracteres.');
      return res.redirect('/admin/admins');
    }

    await Admin.create({
      username,
      password,
      full_name,
      can_manage_admins: can_manage_admins === 'on',
    });

    req.flash('success', `Se creó la cuenta "${username}" correctamente.`);
    res.redirect('/admin/admins');
  } catch (err) {
    console.error(err);
    const msg = err.code === 'ER_DUP_ENTRY' ? 'Ya existe una cuenta con ese nombre de usuario.' : 'No se pudo crear la cuenta.';
    req.flash('error', msg);
    res.redirect('/admin/admins');
  }
};

// Activa/desactiva el permiso de gestionar administradores en otra cuenta.
exports.togglePermission = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const target = await Admin.findById(targetId);

    if (!target) {
      req.flash('error', 'Cuenta no encontrada.');
      return res.redirect('/admin/admins');
    }

    // Evita que la última cuenta con permiso se quite el permiso a sí misma
    // (o a la única otra cuenta con permiso), lo que dejaría el sistema sin
    // nadie que pueda gestionar administradores.
    if (target.can_manage_admins) {
      const managers = await Admin.countManagers();
      if (managers <= 1) {
        req.flash('error', 'No puedes quitar este permiso: debe existir al menos una cuenta que pueda gestionar administradores.');
        return res.redirect('/admin/admins');
      }
    }

    await Admin.setCanManage(targetId, !target.can_manage_admins);
    req.flash('success', `Permisos actualizados para "${target.username}".`);
    res.redirect('/admin/admins');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo actualizar el permiso.');
    res.redirect('/admin/admins');
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);

    if (targetId === req.session.admin.id) {
      req.flash('error', 'No puedes eliminar tu propia cuenta mientras tienes sesión iniciada.');
      return res.redirect('/admin/admins');
    }

    const target = await Admin.findById(targetId);
    if (!target) {
      req.flash('error', 'Cuenta no encontrada.');
      return res.redirect('/admin/admins');
    }

    const totalAdmins = await Admin.count();
    if (totalAdmins <= 1) {
      req.flash('error', 'No puedes eliminar la única cuenta de administrador existente.');
      return res.redirect('/admin/admins');
    }

    if (target.can_manage_admins) {
      const managers = await Admin.countManagers();
      if (managers <= 1) {
        req.flash('error', 'No puedes eliminar la única cuenta que puede gestionar administradores.');
        return res.redirect('/admin/admins');
      }
    }

    await Admin.delete(targetId);
    req.flash('success', `Se eliminó la cuenta "${target.username}".`);
    res.redirect('/admin/admins');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo eliminar la cuenta.');
    res.redirect('/admin/admins');
  }
};
