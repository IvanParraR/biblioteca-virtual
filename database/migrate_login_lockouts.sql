-- ============================================================
-- MIGRACIÓN: protección contra fuerza bruta
-- Bloquea temporalmente (5 intentos fallidos → 15 minutos) tanto
-- el login de administrador como la verificación de la pregunta
-- de seguridad en la recuperación de contraseña.
--
-- Uso (PowerShell / Windows):
--   Get-Content database/migrate_login_lockouts.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
--
-- Uso (macOS/Linux):
--   mysql -u root -p biblioteca_virtual < database/migrate_login_lockouts.sql
-- ============================================================

USE biblioteca_virtual;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS login_lockouts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  identifier      VARCHAR(150) NOT NULL UNIQUE,
  failed_count    INT NOT NULL DEFAULT 0,
  locked_until    DATETIME NULL,
  last_attempt_at DATETIME NULL,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

SELECT 'Tabla login_lockouts lista. A partir de ahora el login y la recuperación por pregunta de seguridad se bloquean temporalmente tras 5 intentos fallidos.' AS resultado;
