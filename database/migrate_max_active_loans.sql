-- ============================================================
-- Migración: máximo de préstamos simultáneos configurable desde
-- Configuración general (antes era un número fijo en el código).
-- ============================================================

SET NAMES utf8mb4;

ALTER TABLE site_settings
  ADD COLUMN max_active_loans INT NOT NULL DEFAULT 3 AFTER loan_days_default;
