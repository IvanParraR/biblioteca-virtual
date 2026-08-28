const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminManagementController = require('../controllers/adminManagementController');
const categoryController = require('../controllers/categoryController');
const { requireAdmin, requireAdminManager } = require('../middleware/auth');
const { coverUpload, csvUpload } = require('../middleware/upload');

router.use(requireAdmin);

router.get('/dashboard', adminController.dashboard);

router.get('/books', adminController.listBooks);
router.get('/books/new', adminController.showAddForm);
router.post('/books', coverUpload.single('cover'), adminController.createBook);

router.get('/books/import', adminController.showImportForm);
router.post('/books/import', csvUpload.single('csvFile'), adminController.importCsv);

router.get('/books/:id/edit', adminController.showEditForm);
router.post('/books/:id', coverUpload.single('cover'), adminController.updateBook);
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
router.post('/admins/:id/delete', requireAdminManager, adminManagementController.deleteAdmin);

module.exports = router;
