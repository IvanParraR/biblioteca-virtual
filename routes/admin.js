const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminManagementController = require('../controllers/adminManagementController');
const categoryController = require('../controllers/categoryController');
const accountController = require('../controllers/accountController');
const activityLogController = require('../controllers/activityLogController');
const exportController = require('../controllers/exportController');
const settingsController = require('../controllers/settingsController');
const { requireAdmin, requireAdminManager, checkForcedPasswordChange } = require('../middleware/auth');
const { coverUpload, processCoverImage, csvUpload, logoUpload, processLogoImage } = require('../middleware/upload');

router.use(requireAdmin);

// "Mi cuenta" queda ANTES del bloqueo por contraseña forzada, para que
// el admin siempre pueda llegar ahí a cambiar su contraseña temporal.
router.get('/account', accountController.show);
router.post('/account/password', accountController.changePassword);
router.post('/account/security-question', accountController.updateSecurityQuestion);

router.use(checkForcedPasswordChange);

router.get('/dashboard', adminController.dashboard);

router.get('/books', adminController.listBooks);
router.get('/books/export/excel', exportController.exportExcel);
router.get('/books/export/pdf', exportController.exportPdf);
router.get('/books/new', adminController.showAddForm);
router.post('/books', coverUpload.single('cover'), processCoverImage, adminController.createBook);

router.get('/books/import', adminController.showImportForm);
router.post('/books/import', csvUpload.single('csvFile'), adminController.importCsv);

router.post('/books/bulk-delete', adminController.bulkDelete);
router.post('/books/bulk-category', adminController.bulkChangeCategory);

router.get('/books/:id/edit', adminController.showEditForm);
router.post('/books/:id', coverUpload.single('cover'), processCoverImage, adminController.updateBook);
router.post('/books/:id/delete', adminController.deleteBook);
router.post('/books/:id/add-copies', adminController.addCopies);
router.post('/books/:id/remove-copies', adminController.removeCopies);

// Categorías — cualquier cuenta de administrador puede gestionarlas
// (a diferencia de las cuentas de administrador, que requieren permiso especial)
router.get('/categories', categoryController.list);
router.post('/categories', categoryController.create);
router.post('/categories/:id/rename', categoryController.rename);
router.post('/categories/:id/merge', categoryController.merge);
router.post('/categories/:id/delete', categoryController.delete);

// Gestión de administradores — solo cuentas con permiso (can_manage_admins)
router.get('/admins', requireAdminManager, adminManagementController.list);
router.post('/admins', requireAdminManager, adminManagementController.create);
router.post('/admins/:id/toggle-permission', requireAdminManager, adminManagementController.togglePermission);
router.post('/admins/:id/reset-temp-password', requireAdminManager, adminManagementController.assignTemporaryPassword);
router.post('/admins/:id/delete', requireAdminManager, adminManagementController.deleteAdmin);

// Configuración del sitio — solo cuentas con permiso de gestión
router.get('/settings', requireAdminManager, settingsController.show);
router.post('/settings', requireAdminManager, logoUpload.single('logo'), processLogoImage, settingsController.update);

// Historial de actividad — visible para cualquier administrador
router.get('/activity-log', activityLogController.list);
router.post('/activity-log/:id/undo', activityLogController.undo);

module.exports = router;
