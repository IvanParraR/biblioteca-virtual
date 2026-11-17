-- ============================================================
-- Historial de actividad: quién (tipo de actor), desde dónde (IP)
-- y con qué navegador (user-agent). Permite registrar inicios y
-- cierres de sesión, intentos fallidos y acciones de estudiantes.
-- ============================================================

ALTER TABLE activity_log
  ADD COLUMN actor_type ENUM('admin','student','anonymous') NOT NULL DEFAULT 'admin' AFTER admin_id;

ALTER TABLE activity_log
  ADD COLUMN student_id INT NULL AFTER actor_type;

ALTER TABLE activity_log
  ADD COLUMN ip_address VARCHAR(45) NULL AFTER details;

ALTER TABLE activity_log
  ADD COLUMN user_agent VARCHAR(255) NULL AFTER ip_address;

ALTER TABLE activity_log ADD INDEX idx_activity_actor_type (actor_type);

ALTER TABLE activity_log ADD INDEX idx_activity_ip (ip_address);
