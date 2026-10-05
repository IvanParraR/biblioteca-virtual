-- ============================================================
-- Migración: agrega 'doaj_paper' como source_type válido en
-- saved_references, para poder guardar artículos que vinieron de
-- DOAJ (además de OpenAlex y Open Library).
-- ============================================================

SET NAMES utf8mb4;

ALTER TABLE saved_references
  MODIFY COLUMN source_type ENUM('openalex_paper', 'openlibrary_book', 'doaj_paper') NOT NULL;
