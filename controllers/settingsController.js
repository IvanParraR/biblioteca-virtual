const Settings = require('../models/Settings');
const ActivityLog = require('../models/ActivityLog');
const { PALETTES } = require('../models/Palettes');

const SCHOOL_NAME = () => Settings.get().school_name;

exports.show = async (req, res) => {
  try {
    const settings = await Settings.getFull();
    res.render('admin/settings', {
      pageTitle: 'Información general',
      schoolName: SCHOOL_NAME(),
      admin: req.session.admin,
      settings,
      palettes: PALETTES,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo cargar la información general.');
    res.redirect('/admin/dashboard');
  }
};

exports.update = async (req, res) => {
  try {
    const {
      school_name, library_name, color_palette,
      welcome_title, welcome_message,
      address, city, phone, email, hours,
      social_facebook, social_instagram, social_twitter, social_whatsapp,
      maintenance_mode, loan_days_default,
    } = req.body;

    if (!school_name || !school_name.trim() || !library_name || !library_name.trim()) {
      req.flash('error', 'El nombre del colegio y de la biblioteca son obligatorios.');
      return res.redirect('/admin/settings');
    }

    const parsedLoanDays = parseInt(loan_days_default, 10);
    const loanDaysDefault = Number.isInteger(parsedLoanDays) && parsedLoanDays > 0 ? parsedLoanDays : 7;

    const paletteKey = PALETTES[color_palette] ? color_palette : 'bosque';

    // Snapshot de TODO lo anterior (incluye logo_url actual, que no
    // cambia salvo que se suba uno nuevo) — se usa para el historial
    // de actividad y para poder "deshacer" este cambio después.
    const before = { ...Settings.get() };

    const newFields = {
      school_name: school_name.trim(),
      library_name: library_name.trim(),
      logo_url: req.file ? `/uploads/branding/${req.file.filename}` : before.logo_url,
      color_palette: paletteKey,
      welcome_title: (welcome_title || '').trim(),
      welcome_message: (welcome_message || '').trim(),
      address: (address || '').trim(),
      city: (city || '').trim(),
      phone: (phone || '').trim(),
      email: (email || '').trim(),
      hours: (hours || '').trim(),
      social_facebook: (social_facebook || '').trim(),
      social_instagram: (social_instagram || '').trim(),
      social_twitter: (social_twitter || '').trim(),
      social_whatsapp: (social_whatsapp || '').trim(),
      maintenance_mode: maintenance_mode === 'on',
      loan_days_default: loanDaysDefault,
    };

    await Settings.update(newFields, req.session.admin.username);

    await ActivityLog.log({
      adminId: req.session.admin.id,
      adminUsername: req.session.admin.username,
      actionType: 'site_settings_updated',
      entityId: 1,
      entityLabel: `${newFields.school_name} / ${newFields.library_name}`,
      beforeState: before,
    });

    req.flash('success', 'La información general se actualizó correctamente.');
    res.redirect('/admin/settings');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo guardar la información general.');
    res.redirect('/admin/settings');
  }
};
