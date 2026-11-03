const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const studentAccountController = require('../controllers/studentAccountController');
const openSourcesController = require('../controllers/openSourcesController');
const { requireStudent } = require('../middleware/studentAuth');
const { requireModule } = require('../middleware/modules');

router.get('/', studentController.home);
router.get('/catalogo', studentController.catalog);
router.get('/categorias', requireModule('categorias'), studentController.categories);
router.get('/libro/:id', studentController.bookDetail);
router.post('/libro/:id/lista-espera', requireModule('prestamos'), requireStudent, studentAccountController.joinWaitlist);

router.get('/fuentes-abiertas', requireModule('fuentes_abiertas'), openSourcesController.show);
router.post('/fuentes-abiertas/guardar', requireModule('fuentes_abiertas', 'usuarios'), requireStudent, openSourcesController.save);

module.exports = router;
