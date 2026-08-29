-- ============================================================
-- MIGRACIÓN: recuperación de contraseña para administradores
--
-- Agrega:
--   - security_question / security_answer_hash → pregunta de
--     seguridad que cada admin configura desde "Mi cuenta"
--   - must_change_password → obliga a definir una contraseña
--     nueva la próxima vez que inicie sesión (se activa cuando
--     un gestor le asigna una contraseña temporal)
--
-- Uso (PowerShell / Windows):
--   Get-Content database/migrate_password_recovery.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
--
-- Uso (macOS/Linux):
--   mysql -u root -p biblioteca_virtual < database/migrate_password_recovery.sql
-- ============================================================

USE biblioteca_virtual;

SET NAMES utf8mb4;

SET @q_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'security_question'
);
SET @sql := IF(@q_exists = 0,
  'ALTER TABLE admins ADD COLUMN security_question VARCHAR(255) DEFAULT NULL',
  'SELECT "security_question ya existía" AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @a_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'security_answer_hash'
);
SET @sql := IF(@a_exists = 0,
  'ALTER TABLE admins ADD COLUMN security_answer_hash VARCHAR(255) DEFAULT NULL',
  'SELECT "security_answer_hash ya existía" AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @m_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'must_change_password'
);
SET @sql := IF(@m_exists = 0,
  'ALTER TABLE admins ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "must_change_password ya existía" AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT id, username, security_question IS NOT NULL AS tiene_pregunta_seguridad, must_change_password FROM admins;
