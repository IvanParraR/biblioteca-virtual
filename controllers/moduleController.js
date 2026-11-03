const Modules = require('../models/Modules');
const Settings = require('../models/Settings');
const ActivityLog = require('../models/ActivityLog');

const SCHOOL_NAME = () => Settings.get().school_name;

exports.show = (req, res) => {
  res.render('admin/modules', {
    pageTitle: 'Módulos',
    schoolName: SCHOOL_NAME(),
    admin: req.session.admin,
    moduleList: Modules.list(),
  });
};

exports.update = async (req, res) => {
  try {
    const previous = Modules.list();
    const states = Object.fromEntries(previous.map((m) => [m.key, req.body[m.key] === 'on']));

    const turnedOn = previous.filter((m) => !m.saved && states[m.key]).map((m) => m.name);
    const turnedOff = previous.filter((m) => m.saved && !states[m.key]).map((m) => m.name);

    if (turnedOn.length === 0 && turnedOff.length === 0) {
      req.flash('success', 'No hubo cambios en los módulos.');
      return res.redirect('/admin/modules');
    }

    await Modules.update(states, req.session.admin.username);

    const details = [
      turnedOn.length ? `Encendió: ${turnedOn.join(', ')}` : null,
      turnedOff.length ? `Apagó: ${turnedOff.join(', ')}` : null,
    ].filter(Boolean).join(' · ');

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'modules_updated',
      entityLabel: 'Módulos del sitio',
      details,
    });

    req.flash('success', 'Los módulos se actualizaron correctamente.');
  } catch (err) {
    console.error(err);
    const msg = err.code === 'ER_NO_SUCH_TABLE'
      ? 'Falta correr la migración database/migrate_modules.sql.'
      : 'No se pudieron guardar los módulos.';
    req.flash('error', msg);
  }
  res.redirect('/admin/modules');
};
