-- ============================================================
-- MIGRACIÓN: agrega los módulos que se pueden encender y apagar
-- desde el panel (Usuarios, Préstamos, Fuentes abiertas y
-- Categorías). Admin y Catálogo son la base y no se pueden apagar.
--
-- La tabla empieza vacía a propósito: un módulo sin fila está
-- encendido, así que nada cambia hasta que un gestor apague alguno.
--
-- Uso (PowerShell / Windows):
--   Get-Content database/migrate_modules.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
--
-- Uso (macOS/Linux):
--   mysql -u root -p biblioteca_virtual < database/migrate_modules.sql
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS site_modules (
  module_key  VARCHAR(50) PRIMARY KEY,
  enabled     TINYINT(1) NOT NULL DEFAULT 1,
  updated_by  VARCHAR(100) NULL,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

SELECT 'Tabla site_modules lista. Todos los módulos siguen encendidos hasta que un gestor cambie alguno.' AS resultado;
