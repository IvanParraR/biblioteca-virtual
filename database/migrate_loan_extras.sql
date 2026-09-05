-- ============================================================
-- Migración: renovación de préstamos + duración configurable
-- Corre esto DESPUÉS de migrate_loans.sql.
-- ============================================================

SET NAMES utf8mb4;

-- Cuántas veces se ha renovado un préstamo. Con esto se aplica el
-- límite de 1 renovación por préstamo (ver models/Loan.js) sin
-- necesidad de otra tabla.
ALTER TABLE loans
  ADD COLUMN renewal_count INT NOT NULL DEFAULT 0 AFTER due_date;

-- Duración por defecto (en días) de un préstamo nuevo, editable
-- desde Panel de administración → Configuración → Préstamos. Los
-- 7 son el valor que ya venía funcionando como fijo en el código.
ALTER TABLE site_settings
  ADD COLUMN loan_days_default INT NOT NULL DEFAULT 7 AFTER maintenance_mode;
