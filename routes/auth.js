const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passwordRecoveryController = require('../controllers/passwordRecoveryController');
const { redirectIfLoggedIn } = require('../middleware/auth');
const { limiters } = require('../middleware/rateLimit');

router.get('/login', redirectIfLoggedIn, authController.showLogin);
router.post('/login', limiters.adminLogin, redirectIfLoggedIn, authController.login);
router.post('/logout', authController.logout);

// Recuperación de contraseña por pregunta de seguridad (no requiere sesión)
router.get('/forgot-password', redirectIfLoggedIn, passwordRecoveryController.showUsernameForm);
router.post('/forgot-password', limiters.adminRecovery, redirectIfLoggedIn, passwordRecoveryController.submitUsername);
router.post('/forgot-password/verify', limiters.adminRecovery, redirectIfLoggedIn, passwordRecoveryController.submitAnswer);
router.post('/forgot-password/reset', limiters.adminRecovery, redirectIfLoggedIn, passwordRecoveryController.submitReset);

// Recuperación de contraseña por correo (contraseña temporal) — no requiere sesión
router.get('/forgot-password-email', redirectIfLoggedIn, passwordRecoveryController.showEmailForm);
router.post('/forgot-password-email', limiters.adminRecovery, redirectIfLoggedIn, passwordRecoveryController.submitEmailRequest);

// Confirmación de cuenta nueva (enlace enviado por correo) — no requiere sesión
router.get('/confirm-email/:token', authController.confirmEmail);

module.exports = router;
