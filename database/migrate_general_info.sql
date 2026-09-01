-- ============================================================
-- MIGRACIÓN: amplía site_settings con toda la información
-- general del sitio: logo, mensaje de bienvenida del inicio,
-- contacto/horario (pie de página), paleta de colores y modo
-- mantenimiento.
--
-- Requiere haber corrido antes database/migrate_site_settings.sql
-- (o tener el proyecto instalado desde un schema.sql reciente que
-- ya incluya la tabla site_settings). Este script es seguro de
-- correr aunque algunas columnas ya existan.
--
-- Uso (PowerShell / Windows):
--   Get-Content database/migrate_general_info.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
--
-- Uso (macOS/Linux):
--   mysql -u root -p biblioteca_virtual < database/migrate_general_info.sql
-- ============================================================

USE biblioteca_virtual;

SET NAMES utf8mb4;

-- Por si ni siquiera existe la tabla todavía (instalación muy vieja
-- que se saltó la migración anterior).
CREATE TABLE IF NOT EXISTS site_settings (
  id            INT PRIMARY KEY DEFAULT 1,
  school_name   VARCHAR(150) NOT NULL DEFAULT 'Mi Colegio',
  library_name  VARCHAR(150) NOT NULL DEFAULT 'Biblioteca Virtual',
  updated_by    VARCHAR(100) NULL,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO site_settings (id, school_name, library_name)
SELECT 1, 'Mi Colegio', 'Biblioteca Virtual'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE id = 1);

-- Agrega cada columna nueva solo si todavía no existe.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='logo_url');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN logo_url VARCHAR(500) NULL', 'SELECT "logo_url ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='color_palette');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN color_palette VARCHAR(30) NOT NULL DEFAULT ''bosque''', 'SELECT "color_palette ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='welcome_title');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN welcome_title VARCHAR(255) NULL', 'SELECT "welcome_title ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='welcome_message');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN welcome_message VARCHAR(500) NULL', 'SELECT "welcome_message ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='address');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN address VARCHAR(255) NULL', 'SELECT "address ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='city');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN city VARCHAR(150) NULL', 'SELECT "city ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='phone');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN phone VARCHAR(50) NULL', 'SELECT "phone ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='email');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN email VARCHAR(150) NULL', 'SELECT "email ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='hours');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN hours VARCHAR(255) NULL', 'SELECT "hours ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='social_facebook');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN social_facebook VARCHAR(255) NULL', 'SELECT "social_facebook ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='social_instagram');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN social_instagram VARCHAR(255) NULL', 'SELECT "social_instagram ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='social_twitter');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN social_twitter VARCHAR(255) NULL', 'SELECT "social_twitter ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='social_whatsapp');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN social_whatsapp VARCHAR(255) NULL', 'SELECT "social_whatsapp ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='site_settings' AND COLUMN_NAME='maintenance_mode');
SET @sql := IF(@c=0, 'ALTER TABLE site_settings ADD COLUMN maintenance_mode TINYINT(1) NOT NULL DEFAULT 0', 'SELECT "maintenance_mode ya existía" AS r');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT * FROM site_settings;
