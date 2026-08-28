-- ============================================================
-- MIGRACIÓN: agrega el sistema de permisos de administradores
-- Ejecuta este script SOLO si ya habías creado la base de datos
-- antes (con database/schema.sql) y ahora quieres actualizarla
-- sin perder tus libros ni tu cuenta admin existente.
--
-- Uso (PowerShell / Windows):
--   Get-Content database/migrate_admin_permissions.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
--
-- Uso (macOS/Linux):
--   mysql -u root -p biblioteca_virtual < database/migrate_admin_permissions.sql
-- ============================================================

USE biblioteca_virtual;

SET NAMES utf8mb4;

-- Agrega la columna solo si no existe todavía (evita error si se ejecuta dos veces)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'can_manage_admins'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE admins ADD COLUMN can_manage_admins TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "La columna ya existía, no se hizo ningún cambio" AS resultado'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- El administrador más antiguo (el primero que se creó) recibe el
-- permiso de gestionar otras cuentas, para que nadie quede sin acceso.
UPDATE admins
SET can_manage_admins = 1
WHERE id = (SELECT id FROM (SELECT MIN(id) AS id FROM admins) AS t);

SELECT id, username, full_name, can_manage_admins FROM admins;
