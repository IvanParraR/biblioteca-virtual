const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passwordRecoveryController = require('../controllers/passwordRecoveryController');
const { redirectIfLoggedIn } = require('../middleware/auth');

router.get('/login', redirectIfLoggedIn, authController.showLogin);
router.post('/login', redirectIfLoggedIn, authController.login);
router.post('/logout', authController.logout);

// Recuperación de contraseña por pregunta de seguridad (no requiere sesión)
router.get('/forgot-password', redirectIfLoggedIn, passwordRecoveryController.showUsernameForm);
router.post('/forgot-password', redirectIfLoggedIn, passwordRecoveryController.submitUsername);
router.post('/forgot-password/verify', redirectIfLoggedIn, passwordRecoveryController.submitAnswer);
router.post('/forgot-password/reset', redirectIfLoggedIn, passwordRecoveryController.submitReset);

module.exports = router;
