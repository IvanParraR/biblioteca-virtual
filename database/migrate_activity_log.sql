-- ============================================================
-- MIGRACIÓN: agrega el registro de actividad (audit log) con
-- soporte para "deshacer" acciones seguras.
--
-- Uso (PowerShell / Windows):
--   Get-Content database/migrate_activity_log.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
--
-- Uso (macOS/Linux):
--   mysql -u root -p biblioteca_virtual < database/migrate_activity_log.sql
-- ============================================================

USE biblioteca_virtual;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS activity_log (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  admin_id        INT NULL,
  admin_username  VARCHAR(100) NOT NULL,
  action_type     VARCHAR(50) NOT NULL,
  entity_type     VARCHAR(20) NOT NULL,
  entity_id       INT NULL,
  entity_label    VARCHAR(255),
  details         VARCHAR(500),
  before_state    TEXT NULL,
  is_undoable     TINYINT(1) NOT NULL DEFAULT 0,
  is_revert       TINYINT(1) NOT NULL DEFAULT 0,
  undone_at       DATETIME NULL,
  undone_by       VARCHAR(100) NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_activity_created_at (created_at),
  INDEX idx_activity_admin_username (admin_username),
  INDEX idx_activity_action_type (action_type),
  INDEX idx_activity_entity_type (entity_type),
  INDEX idx_activity_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- Por si la tabla ya existía de una versión anterior sin las
-- columnas de "deshacer" (verifica cada una antes de agregarla).
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='activity_log' AND COLUMN_NAME='entity_id');
SET @sql := IF(@c=0, 'ALTER TABLE activity_log ADD COLUMN entity_id INT NULL AFTER entity_type', 'SELECT "entity_id ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='activity_log' AND COLUMN_NAME='before_state');
SET @sql := IF(@c=0, 'ALTER TABLE activity_log ADD COLUMN before_state TEXT NULL', 'SELECT "before_state ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='activity_log' AND COLUMN_NAME='is_undoable');
SET @sql := IF(@c=0, 'ALTER TABLE activity_log ADD COLUMN is_undoable TINYINT(1) NOT NULL DEFAULT 0', 'SELECT "is_undoable ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='activity_log' AND COLUMN_NAME='is_revert');
SET @sql := IF(@c=0, 'ALTER TABLE activity_log ADD COLUMN is_revert TINYINT(1) NOT NULL DEFAULT 0', 'SELECT "is_revert ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='activity_log' AND COLUMN_NAME='undone_at');
SET @sql := IF(@c=0, 'ALTER TABLE activity_log ADD COLUMN undone_at DATETIME NULL', 'SELECT "undone_at ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='activity_log' AND COLUMN_NAME='undone_by');
SET @sql := IF(@c=0, 'ALTER TABLE activity_log ADD COLUMN undone_by VARCHAR(100) NULL', 'SELECT "undone_by ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='activity_log' AND INDEX_NAME='idx_activity_entity');
SET @sql := IF(@idx=0, 'ALTER TABLE activity_log ADD INDEX idx_activity_entity (entity_type, entity_id)', 'SELECT "índice ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Tabla activity_log lista (con soporte de deshacer). A partir de ahora se registrará cada acción de los administradores.' AS resultado;
