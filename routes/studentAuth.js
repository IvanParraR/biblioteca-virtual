const express = require('express');
const router = express.Router();
const studentAuthController = require('../controllers/studentAuthController');
const { redirectIfStudentLoggedIn } = require('../middleware/studentAuth');

router.get('/registro', redirectIfStudentLoggedIn, studentAuthController.showRegister);
router.post('/registro', redirectIfStudentLoggedIn, studentAuthController.register);

router.get('/iniciar-sesion', redirectIfStudentLoggedIn, studentAuthController.showLogin);
router.post('/iniciar-sesion', redirectIfStudentLoggedIn, studentAuthController.login);
router.post('/cerrar-sesion', studentAuthController.logout);

router.get('/recuperar-contrasena', redirectIfStudentLoggedIn, studentAuthController.showForgotPasswordEmail);
router.post('/recuperar-contrasena', redirectIfStudentLoggedIn, studentAuthController.submitForgotPasswordEmail);

// Enlace de confirmación enviado por correo — no requiere sesión.
router.get('/confirmar-correo/:token', studentAuthController.confirmEmail);

module.exports = router;
