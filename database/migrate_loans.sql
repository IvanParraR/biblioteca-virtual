-- ============================================================
-- Migración: sistema de préstamos
-- Corre esto DESPUÉS de schema.sql (o de haberlo corrido antes).
-- Reglas de negocio decididas junto con el usuario:
--   - Duración por defecto de un préstamo: 7 días (el admin puede
--     ajustar la fecha límite al registrar el préstamo).
--   - Máximo 3 préstamos activos a la vez por estudiante.
--   - Si un estudiante tiene un préstamo atrasado, no se le
--     permite registrar uno nuevo hasta que lo resuelva.
--   Estas reglas se validan en código (models/Loan.js), no acá.
-- ============================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------
-- Tabla: students
-- Directorio liviano de estudiantes — NO es un sistema de login.
-- Existe solo para no repetir "Juan Pérez" a mano en cada
-- préstamo y para poder ver el historial de una persona sin que
-- variaciones de escritura del nombre lo partan en dos.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(150) NOT NULL,
  student_code  VARCHAR(50) NULL UNIQUE,
  grade         VARCHAR(50) NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_students_name (full_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Tabla: loans
-- Un préstamo activo es aquel con returned_at = NULL. El estado
-- "atrasado" NO se guarda como columna — se deriva comparando
-- due_date con la fecha actual (mismo enfoque que el estado de
-- los libros en models/Book.js), para que nunca quede
-- desincronizado.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS loans (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  book_id       INT NOT NULL,
  student_id    INT NOT NULL,
  loaned_by     VARCHAR(100) NOT NULL,
  loaned_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  due_date      DATE NOT NULL,
  returned_at   DATETIME NULL,
  returned_by   VARCHAR(100) NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_loans_book FOREIGN KEY (book_id) REFERENCES books(id),
  CONSTRAINT fk_loans_student FOREIGN KEY (student_id) REFERENCES students(id),
  INDEX idx_loans_book (book_id),
  INDEX idx_loans_student (student_id),
  INDEX idx_loans_active (returned_at, due_date)
) ENGINE=InnoDB;
