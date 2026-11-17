const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminManagementController = require('../controllers/adminManagementController');
const categoryController = require('../controllers/categoryController');
const accountController = require('../controllers/accountController');
const activityLogController = require('../controllers/activityLogController');
const exportController = require('../controllers/exportController');
const settingsController = require('../controllers/settingsController');
const moduleController = require('../controllers/moduleController');
const emailDomainController = require('../controllers/emailDomainController');
const studentManagementController = require('../controllers/studentManagementController');
const loanController = require('../controllers/loanController');
const { requireAdmin, requireAdminManager, checkForcedPasswordChange } = require('../middleware/auth');
const { requireModule } = require('../middleware/modules');
const { coverUpload, processCoverImage, csvUpload, logoUpload, processLogoImage } = require('../middleware/upload');

const loansModule = requireModule('prestamos');
const studentsModule = requireModule('usuarios');
const categoriesModule = requireModule('categorias');

router.use(requireAdmin);

// "Mi cuenta" queda ANTES del bloqueo por contraseña forzada, para que
// el admin siempre pueda llegar ahí a cambiar su contraseña temporal.
router.get('/account', accountController.show);
router.post('/account/password', accountController.changePassword);
router.post('/account/security-question', accountController.updateSecurityQuestion);

router.use(checkForcedPasswordChange);

router.get('/dashboard', adminController.dashboard);

// Préstamos — cualquier cuenta de administrador puede registrarlos
router.get('/loans', loansModule, loanController.list);
router.get('/loans/new', loansModule, loanController.showNewForm);
router.get('/students/search', loansModule, loanController.searchStudents);
router.post('/loans', loansModule, loanController.create);
router.post('/loans/:id/return', loansModule, loanController.markReturned);
router.post('/loans/:id/renew', loansModule, loanController.renew);

router.get('/books', adminController.listBooks);
router.get('/books/export/excel', exportController.exportExcel);
router.get('/books/export/pdf', exportController.exportPdf);
router.get('/loans/export/excel', loansModule, exportController.exportLoansExcel);
router.get('/loans/export/pdf', loansModule, exportController.exportLoansPdf);
router.get('/books/new', adminController.showAddForm);
router.post('/books', coverUpload.single('cover'), processCoverImage, adminController.createBook);

router.get('/books/import', adminController.showImportForm);
router.post('/books/import', csvUpload.single('csvFile'), adminController.importCsv);

router.post('/books/bulk-delete', adminController.bulkDelete);
router.post('/books/bulk-category', categoriesModule, adminController.bulkChangeCategory);

router.get('/books/:id/edit', adminController.showEditForm);
router.post('/books/:id', coverUpload.single('cover'), processCoverImage, adminController.updateBook);
router.post('/books/:id/delete', adminController.deleteBook);
router.post('/books/:id/add-copies', adminController.addCopies);
router.post('/books/:id/remove-copies', adminController.removeCopies);

// Categorías — cualquier cuenta de administrador puede gestionarlas
// (a diferencia de las cuentas de administrador, que requieren permiso especial)
router.get('/categories', categoriesModule, categoryController.list);
router.post('/categories', categoriesModule, categoryController.create);
router.post('/categories/:id/rename', categoriesModule, categoryController.rename);
router.post('/categories/:id/merge', categoriesModule, categoryController.merge);
router.post('/categories/:id/delete', categoriesModule, categoryController.delete);

// Gestión de administradores — solo cuentas con permiso (can_manage_admins)
router.get('/admins', requireAdminManager, adminManagementController.list);
router.post('/admins', requireAdminManager, adminManagementController.create);
router.post('/admins/:id/toggle-permission', requireAdminManager, adminManagementController.togglePermission);
router.post('/admins/:id/reset-temp-password', requireAdminManager, adminManagementController.assignTemporaryPassword);
router.post('/admins/:id/delete', requireAdminManager, adminManagementController.deleteAdmin);

// Configuración del sitio — solo cuentas con permiso de gestión
router.get('/settings', requireAdminManager, settingsController.show);
router.post('/settings', requireAdminManager, logoUpload.single('logo'), processLogoImage, settingsController.update);
router.post('/settings/email-domains', requireAdminManager, emailDomainController.add);
router.post('/settings/email-domains/:id/delete', requireAdminManager, emailDomainController.delete);
router.post('/settings/student-email-domains', requireAdminManager, studentsModule, emailDomainController.addStudentDomain);
router.post('/settings/student-email-domains/:id/delete', requireAdminManager, studentsModule, emailDomainController.deleteStudentDomain);

// Módulos del sitio — solo cuentas con permiso de gestión
router.get('/modules', requireAdminManager, moduleController.show);
router.post('/modules', requireAdminManager, moduleController.update);

router.get('/students', studentsModule, studentManagementController.list);
router.get('/students/:id', studentsModule, studentManagementController.show);
router.post('/students/:id/status', requireAdminManager, studentsModule, studentManagementController.setStatus);

// Historial de actividad — visible para cualquier administrador
router.get('/activity-log', activityLogController.list);
router.post('/activity-log/:id/undo', activityLogController.undo);

module.exports = router;
