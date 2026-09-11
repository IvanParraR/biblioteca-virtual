-- ============================================================
-- Migración: cuentas de estudiante
--
-- Extiende la tabla `students` (que ya existía como directorio
-- usado por el bibliotecario) para que un estudiante pueda
-- registrarse y entrar por su cuenta. Un registro nuevo con un
-- código que YA existe en `students` "reclama" esa fila (le agrega
-- correo+contraseña) en vez de crear una persona duplicada — esa
-- lógica vive en código (models/Student.js), no aquí.
--
-- Usa las mismas 4 columnas que espera models/EmailConfirmation.js
-- (email, email_confirmed_at, confirmation_token,
-- confirmation_expires_at) para reutilizar ese helper tal cual.
-- ============================================================

SET NAMES utf8mb4;

ALTER TABLE students
  ADD COLUMN email VARCHAR(150) NULL UNIQUE AFTER student_code,
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER email,
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash,
  ADD COLUMN phone VARCHAR(30) NULL AFTER grade,
  ADD COLUMN photo_url VARCHAR(500) NULL AFTER phone,
  ADD COLUMN status ENUM('active','inactive') NOT NULL DEFAULT 'active' AFTER photo_url,
  ADD COLUMN notify_due_reminder TINYINT(1) NOT NULL DEFAULT 1 AFTER status,
  ADD COLUMN email_confirmed_at DATETIME NULL AFTER notify_due_reminder,
  ADD COLUMN confirmation_token VARCHAR(64) NULL AFTER email_confirmed_at,
  ADD COLUMN confirmation_expires_at DATETIME NULL AFTER confirmation_token;

-- ---------------------------------------------------------
-- Dominios de correo permitidos para AUTO-REGISTRO de estudiantes —
-- lista SEPARADA de allowed_email_domains (esa es solo para cuando
-- un gestor crea una cuenta de administrador). Con auto-registro
-- abierto, esta lista es la barrera principal contra que cualquiera
-- externo se registre como estudiante — por eso conviene poder
-- restringirla al dominio institucional del colegio sin afectar la
-- de administradores. Debe quedar siempre al menos un dominio.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS allowed_student_email_domains (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  domain      VARCHAR(255) NOT NULL UNIQUE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO allowed_student_email_domains (domain) VALUES
  ('gmail.com'), ('outlook.com'), ('hotmail.com')
ON DUPLICATE KEY UPDATE domain = domain;

-- ---------------------------------------------------------
-- Recordatorio de vencimiento: para no reenviarlo cada vez que
-- corre el chequeo periódico, se marca la primera vez que se envía.
-- ---------------------------------------------------------
ALTER TABLE loans
  ADD COLUMN reminder_sent_at DATETIME NULL AFTER renewal_count;

-- ---------------------------------------------------------
-- Tabla: loan_waitlist
-- Cola de espera por libro, en orden de llegada (requested_at).
-- Cuando se libera una copia, se avisa a la persona más antigua
-- todavía en espera (notified_at) y se le "reserva" un cupo por
-- WAITLIST_HOLD_HOURS (48h, ver models/Waitlist.js) — durante ese
-- plazo, un préstamo nuevo de ESE libro que no sea de ella queda
-- bloqueado (ver models/Loan.js -> create). Si no lo reclama a
-- tiempo, el cupo pasa al siguiente en la fila automáticamente.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan_waitlist (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  book_id           INT NOT NULL,
  student_id        INT NOT NULL,
  requested_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  notified_at       DATETIME NULL,
  hold_expires_at   DATETIME NULL,
  fulfilled_at      DATETIME NULL,
  cancelled_at      DATETIME NULL,
  CONSTRAINT fk_waitlist_book FOREIGN KEY (book_id) REFERENCES books(id),
  CONSTRAINT fk_waitlist_student FOREIGN KEY (student_id) REFERENCES students(id),
  INDEX idx_waitlist_book (book_id),
  INDEX idx_waitlist_student (student_id),
  INDEX idx_waitlist_active (book_id, requested_at)
) ENGINE=InnoDB;
