const express = require('express');
const router = express.Router();
const studentAccountController = require('../controllers/studentAccountController');
const { requireStudent, checkStudentForcedPasswordChange } = require('../middleware/studentAuth');
const { requireModule } = require('../middleware/modules');

router.use(requireStudent);
router.use(checkStudentForcedPasswordChange);

router.get('/', studentAccountController.dashboard);
router.get('/prestamos', requireModule('prestamos'), studentAccountController.loans);
router.get('/editar', studentAccountController.showEdit);
router.post('/editar', studentAccountController.updateProfile);
router.get('/contrasena', studentAccountController.showChangePassword);
router.post('/contrasena', studentAccountController.changePassword);
router.get('/espera', requireModule('prestamos'), studentAccountController.myWaitlist);
router.post('/espera/:id/cancelar', requireModule('prestamos'), studentAccountController.cancelWaitlist);
router.get('/referencias', requireModule('fuentes_abiertas'), studentAccountController.references);
router.post('/referencias/:id/eliminar', requireModule('fuentes_abiertas'), studentAccountController.deleteReference);

module.exports = router;
