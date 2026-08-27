const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');
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

module.exports = router;
