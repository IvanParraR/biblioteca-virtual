const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

router.get('/', studentController.home);
router.get('/catalogo', studentController.catalog);
router.get('/categorias', studentController.categories);
router.get('/libro/:id', studentController.bookDetail);

module.exports = router;
