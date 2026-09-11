const express = require('express');
const router = express.Router();
const studentAccountController = require('../controllers/studentAccountController');
const { requireStudent, checkStudentForcedPasswordChange } = require('../middleware/studentAuth');

router.use(requireStudent);
router.use(checkStudentForcedPasswordChange);

router.get('/', studentAccountController.dashboard);
router.get('/prestamos', studentAccountController.loans);
router.get('/editar', studentAccountController.showEdit);
router.post('/editar', studentAccountController.updateProfile);
router.get('/contrasena', studentAccountController.showChangePassword);
router.post('/contrasena', studentAccountController.changePassword);
router.get('/espera', studentAccountController.myWaitlist);
router.post('/espera/:id/cancelar', studentAccountController.cancelWaitlist);

module.exports = router;
