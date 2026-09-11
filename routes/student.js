const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const studentAccountController = require('../controllers/studentAccountController');
const { requireStudent } = require('../middleware/studentAuth');

router.get('/', studentController.home);
router.get('/catalogo', studentController.catalog);
router.get('/categorias', studentController.categories);
router.get('/libro/:id', studentController.bookDetail);
router.post('/libro/:id/lista-espera', requireStudent, studentAccountController.joinWaitlist);

module.exports = router;
