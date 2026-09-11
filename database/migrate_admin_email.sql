-- ============================================================
-- Migración: correo electrónico en cuentas de administrador
-- (confirmación por correo, reseteo de contraseña por correo,
-- inicio de sesión con usuario o correo) + tabla de dominios de
-- correo permitidos.
--
-- Las cuentas creadas ANTES de esta migración (email = NULL)
-- siguen pudiendo iniciar sesión sin problema — el bloqueo por
-- "cuenta no confirmada" solo aplica a cuentas que SÍ tienen un
-- correo asociado y aún no lo confirmaron (ver models/Admin.js).
-- ============================================================

SET NAMES utf8mb4;

ALTER TABLE admins
  ADD COLUMN email VARCHAR(150) NULL UNIQUE AFTER username,
  ADD COLUMN email_confirmed_at DATETIME NULL AFTER email,
  ADD COLUMN confirmation_token VARCHAR(64) NULL AFTER email_confirmed_at,
  ADD COLUMN confirmation_expires_at DATETIME NULL AFTER confirmation_token;

-- ---------------------------------------------------------
-- Tabla: allowed_email_domains
-- El gestor decide qué dominios de correo se aceptan al crear una
-- cuenta nueva (por ejemplo, solo el dominio institucional del
-- colegio). Debe quedar SIEMPRE al menos un dominio en la tabla —
-- esa regla se aplica en código (models/EmailDomain.js), no aquí.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS allowed_email_domains (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  domain      VARCHAR(255) NOT NULL UNIQUE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO allowed_email_domains (domain) VALUES
  ('gmail.com'), ('outlook.com'), ('hotmail.com')
ON DUPLICATE KEY UPDATE domain = domain;
