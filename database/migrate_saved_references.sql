-- ============================================================
-- Migración: Fuentes Abiertas — referencias guardadas
--
-- Una sola tabla para los dos modos (libros virtuales y artículos
-- científicos) — comparten casi todos los campos, distinguidos por
-- source_type. La cita en APA se guarda ya generada al momento de
-- guardar, no se recalcula cada vez que el estudiante la revisa.
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS saved_references (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  student_id        INT NOT NULL,
  source_type       ENUM('openalex_paper', 'openlibrary_book') NOT NULL,
  source_id         VARCHAR(255) NOT NULL,
  title             VARCHAR(500) NOT NULL,
  authors           VARCHAR(500) NULL,
  year              SMALLINT NULL,
  citation_apa      TEXT NOT NULL,
  source_url        VARCHAR(500) NULL,
  open_access_url   VARCHAR(500) NULL,
  saved_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_saved_ref_student FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE KEY uq_student_source (student_id, source_type, source_id)
) ENGINE=InnoDB;
