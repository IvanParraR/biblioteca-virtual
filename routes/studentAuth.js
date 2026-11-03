const express = require('express');
const router = express.Router();
const studentAuthController = require('../controllers/studentAuthController');
const { redirectIfStudentLoggedIn } = require('../middleware/studentAuth');
const { requireModule } = require('../middleware/modules');

const usersModule = requireModule('usuarios');

router.get('/registro', usersModule, redirectIfStudentLoggedIn, studentAuthController.showRegister);
router.post('/registro', usersModule, redirectIfStudentLoggedIn, studentAuthController.register);

router.get('/iniciar-sesion', usersModule, redirectIfStudentLoggedIn, studentAuthController.showLogin);
router.post('/iniciar-sesion', usersModule, redirectIfStudentLoggedIn, studentAuthController.login);
// Cerrar sesión queda fuera del módulo a propósito: una sesión abierta
// siempre debe poder cerrarse.
router.post('/cerrar-sesion', studentAuthController.logout);

router.get('/recuperar-contrasena', usersModule, redirectIfStudentLoggedIn, studentAuthController.showForgotPasswordEmail);
router.post('/recuperar-contrasena', usersModule, redirectIfStudentLoggedIn, studentAuthController.submitForgotPasswordEmail);

// Enlace de confirmación enviado por correo — no requiere sesión.
router.get('/confirmar-correo/:token', usersModule, studentAuthController.confirmEmail);

module.exports = router;
