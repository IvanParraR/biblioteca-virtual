-- ============================================================
-- BIBLIOTECA VIRTUAL — Esquema de base de datos MySQL
-- Este esquema representa la estructura mínima esperada. En
-- producción, se debe adaptar a las columnas reales de la base
-- de datos del colegio (ver models/Book.js para el mapeo).
-- ============================================================

CREATE DATABASE IF NOT EXISTS biblioteca_virtual
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE biblioteca_virtual;

-- ---------------------------------------------------------
-- Tabla: books
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS books (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  title             VARCHAR(255) NOT NULL,
  author            VARCHAR(255) NOT NULL,
  isbn              VARCHAR(32)  NOT NULL UNIQUE,
  category          VARCHAR(100) NOT NULL,
  description       TEXT,
  publisher         VARCHAR(150),
  publication_year  SMALLINT,
  cover_url         VARCHAR(500),
  total_copies      INT NOT NULL DEFAULT 1,
  available_copies  INT NOT NULL DEFAULT 1,
  location          VARCHAR(150),
  library_only      TINYINT(1) NOT NULL DEFAULT 0,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_title (title),
  INDEX idx_author (author),
  INDEX idx_category (category),
  INDEX idx_isbn (isbn)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Tabla: admins (única cuenta con login; los estudiantes no
-- requieren cuenta según los requisitos del prototipo)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(150),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Nota: el estado de un libro (Disponible / Prestado / Solo en
-- biblioteca / No disponible) se DERIVA de available_copies,
-- total_copies y library_only en tiempo de consulta — ver
-- models/Book.js — para que nunca quede desincronizado.

-- ---------------------------------------------------------
-- Admin por defecto → usuario: admin / contraseña: biblioteca123
-- ---------------------------------------------------------
INSERT INTO admins (username, password_hash, full_name) VALUES
('admin', '$2a$10$pSl5YAcRdw2NzKnTfzemTeQ4.7u/mjs1Uan17UdGQhv1HZzbsKFIq', 'Administrador de Biblioteca')
ON DUPLICATE KEY UPDATE username = username;

-- ---------------------------------------------------------
-- Datos de ejemplo — 14 libros de distintas categorías
-- ---------------------------------------------------------
INSERT INTO books (title, author, isbn, category, description, publisher, publication_year, cover_url, total_copies, available_copies, location, library_only) VALUES
('El Principito', 'Antoine de Saint-Exupéry', '9780156012195', 'Literatura', 'Un aviador perdido en el desierto del Sahara conoce a un pequeño príncipe de otro planeta. Una fábula poética sobre la amistad, el amor y el sentido de la vida.', 'Reynal & Hitchcock', 1943, '/img/covers/principito.svg', 4, 2, 'Estante L-12, Sección Literatura', 0),
('Cien Años de Soledad', 'Gabriel García Márquez', '9780307474728', 'Literatura', 'La historia de la familia Buendía a lo largo de siete generaciones en el pueblo ficticio de Macondo. Obra cumbre del realismo mágico.', 'Editorial Sudamericana', 1967, '/img/covers/cienanios.svg', 3, 0, 'Estante L-14, Sección Literatura', 0),
('Álgebra de Baldor', 'Aurelio Baldor', '9789681845916', 'Matemáticas', 'Texto clásico de álgebra elemental utilizado ampliamente en la enseñanza secundaria, con miles de ejercicios resueltos y propuestos.', 'Publicaciones Cultural', 1941, '/img/covers/baldor.svg', 5, 5, 'Estante M-02, Sección Matemáticas', 0),
('Cálculo de una Variable', 'James Stewart', '9786075228154', 'Matemáticas', 'Introducción rigurosa y accesible al cálculo diferencial e integral, con aplicaciones prácticas y numerosos ejemplos.', 'Cengage Learning', 2018, '/img/covers/calculo.svg', 2, 1, 'Estante M-05, Sección Matemáticas', 0),
('Cosmos', 'Carl Sagan', '9780345539434', 'Ciencia', 'Un recorrido por el universo, la historia de la ciencia y nuestro lugar en el cosmos, escrito con una prosa accesible y apasionada.', 'Random House', 1980, '/img/covers/cosmos.svg', 3, 1, 'Estante C-08, Sección Ciencia', 0),
('Una Breve Historia del Tiempo', 'Stephen Hawking', '9780553380163', 'Ciencia', 'Explicación divulgativa de los conceptos fundamentales de la cosmología moderna: el Big Bang, los agujeros negros y la naturaleza del tiempo.', 'Bantam Books', 1988, '/img/covers/hawking.svg', 2, 0, 'Estante C-09, Sección Ciencia', 0),
('Sapiens: De Animales a Dioses', 'Yuval Noah Harari', '9780062316097', 'Historia', 'Una historia de la humanidad desde la aparición del Homo sapiens hasta la actualidad, explorando las revoluciones cognitiva, agrícola y científica.', 'Debate', 2011, '/img/covers/sapiens.svg', 4, 3, 'Estante H-03, Sección Historia', 0),
('Breve Historia de Casi Todo', 'Bill Bryson', '9780767908184', 'Historia', 'Un recorrido ameno por la historia de la ciencia, desde el Big Bang hasta la evolución de la vida en la Tierra.', 'Broadway Books', 2003, '/img/covers/bryson.svg', 1, 1, 'Sala de consulta — no circula', 1),
('Atlas Geográfico Universal', 'Equipo Editorial', '9788466225897', 'Geografía', 'Atlas completo con mapas físicos y políticos de todos los continentes, además de datos demográficos y económicos actualizados.', 'Editorial Océano', 2020, '/img/covers/atlas.svg', 3, 3, 'Estante G-01, Sección Geografía', 0),
('Geografía Física del Mundo', 'Arthur Strahler', '9788429127259', 'Geografía', 'Estudio de los procesos geológicos, climáticos e hidrológicos que dan forma a la superficie terrestre.', 'Editorial Omega', 2005, '/img/covers/strahler.svg', 2, 1, 'Estante G-04, Sección Geografía', 0),
('Introducción a los Algoritmos', 'Thomas H. Cormen', '9780262033848', 'Tecnología', 'Referencia fundamental sobre el diseño y análisis de algoritmos, cubriendo estructuras de datos, ordenamiento y teoría de grafos.', 'MIT Press', 2009, '/img/covers/cormen.svg', 2, 1, 'Estante T-01, Sección Tecnología', 0),
('Clean Code', 'Robert C. Martin', '9780132350884', 'Tecnología', 'Principios y prácticas para escribir código legible, mantenible y de alta calidad, con numerosos ejemplos en Java.', 'Prentice Hall', 2008, '/img/covers/cleancode.svg', 3, 2, 'Estante T-03, Sección Tecnología', 0),
('English Grammar in Use', 'Raymond Murphy', '9781108457651', 'Inglés', 'Gramática inglesa de autoaprendizaje con explicaciones claras y ejercicios prácticos para estudiantes de nivel intermedio.', 'Cambridge University Press', 2019, '/img/covers/grammar.svg', 5, 4, 'Estante I-02, Sección Inglés', 0),
('Historia del Arte', 'Ernst Gombrich', '9780714832470', 'Arte', 'Panorama accesible de la historia del arte occidental, desde las pinturas rupestres hasta el arte contemporáneo.', 'Phaidon Press', 1950, '/img/covers/gombrich.svg', 2, 0, 'Estante A-01, Sección Arte', 0)
ON DUPLICATE KEY UPDATE isbn = isbn;
