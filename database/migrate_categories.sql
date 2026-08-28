-- ============================================================
-- MIGRACIÓN: normaliza las categorías en su propia tabla
--
-- Antes: books.category era texto libre (VARCHAR), lo que
-- permitía duplicados como "Matemáticas" y "matematicas".
--
-- Después: existe una tabla `categories` y books.category_id
-- referencia esa tabla. Este script:
--   1. Crea la tabla categories (si no existe).
--   2. Detecta las categorías existentes en tus libros, las
--      normaliza (agrupa variaciones de mayúsculas/espacios) y
--      las inserta como registros únicos.
--   3. Agrega la columna books.category_id y la conecta con la
--      categoría correspondiente de cada libro.
--   4. Elimina la columna de texto libre books.category.
--
-- Uso (PowerShell / Windows):
--   Get-Content database/migrate_categories.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
--
-- Uso (macOS/Linux):
--   mysql -u root -p biblioteca_virtual < database/migrate_categories.sql
-- ============================================================

USE biblioteca_virtual;

SET NAMES utf8mb4;

-- 1. Crear tabla categories si no existe
CREATE TABLE IF NOT EXISTS categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Si esta migración ya se ejecutó antes (books.category ya no existe), no hacer nada más.
SET @old_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'books' AND COLUMN_NAME = 'category'
);

-- 2. Insertar categorías únicas normalizadas (recorta espacios; agrupa por
--    coincidencia exacta de texto recortado — si tenías "Matemáticas" y
--    "matematicas" como textos DISTINTOS, quedarán como dos categorías
--    separadas. Después de correr esta migración, entra a
--    Panel de administración → Categorías y usa el botón "Fusionar"
--    para unirlas en una sola con un clic.
SET @sql := IF(@old_col_exists = 1,
  'INSERT INTO categories (name) SELECT DISTINCT TRIM(category) FROM books WHERE TRIM(category) <> "" ON DUPLICATE KEY UPDATE name = name',
  'SELECT "Sin cambios: la columna category ya fue migrada anteriormente" AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Agregar columna category_id si no existe todavía
SET @new_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'books' AND COLUMN_NAME = 'category_id'
);
SET @sql := IF(@new_col_exists = 0,
  'ALTER TABLE books ADD COLUMN category_id INT NULL AFTER isbn',
  'SELECT "La columna category_id ya existía" AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Conectar cada libro con el id de su categoría correspondiente
SET @sql := IF(@old_col_exists = 1,
  'UPDATE books b JOIN categories c ON TRIM(b.category) = c.name SET b.category_id = c.id',
  'SELECT "Sin cambios" AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. Hacer category_id obligatoria y agregar la llave foránea
--    (solo si todavía no se aplicó)
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'books' AND CONSTRAINT_NAME = 'fk_books_category'
);
SET @sql := IF(@fk_exists = 0 AND @old_col_exists = 1,
  'ALTER TABLE books MODIFY category_id INT NOT NULL, ADD CONSTRAINT fk_books_category FOREIGN KEY (category_id) REFERENCES categories(id), ADD INDEX idx_books_category_id (category_id)',
  'SELECT "Sin cambios en la llave foránea" AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. Eliminar la columna vieja de texto libre
SET @sql := IF(@old_col_exists = 1,
  'ALTER TABLE books DROP COLUMN category',
  'SELECT "La columna category ya no existía" AS resultado'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT c.name AS categoria, COUNT(b.id) AS libros
FROM categories c LEFT JOIN books b ON b.category_id = c.id
GROUP BY c.name ORDER BY c.name;
