-- ============================================================
-- MIGRACIÓN: agrega la configuración del sitio (nombre del
-- colegio y nombre de la biblioteca virtual), editable desde el
-- panel por un administrador con permiso de gestión.
--
-- Uso (PowerShell / Windows):
--   Get-Content database/migrate_site_settings.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
--
-- Uso (macOS/Linux):
--   mysql -u root -p biblioteca_virtual < database/migrate_site_settings.sql
-- ============================================================

USE biblioteca_virtual;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS site_settings (
  id            INT PRIMARY KEY DEFAULT 1,
  school_name   VARCHAR(150) NOT NULL,
  library_name  VARCHAR(150) NOT NULL,
  updated_by    VARCHAR(100) NULL,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Si la tabla ya existía pero sin fila (instalaciones recién
-- migradas), la crea con el nombre que tenías en .env como punto
-- de partida — después lo puedes cambiar desde el panel.
INSERT INTO site_settings (id, school_name, library_name)
SELECT 1, 'Mi Colegio', 'Biblioteca Virtual'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE id = 1);

SELECT * FROM site_settings;
