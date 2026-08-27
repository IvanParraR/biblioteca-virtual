// ============================================================
// Middleware de subida de archivos con Multer:
//  - coverUpload: portada individual al crear/editar un libro
//  - csvUpload: carga masiva de libros vía CSV
// ============================================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const coversDir = path.join(__dirname, '..', 'public', 'uploads', 'covers');
const csvDir = path.join(__dirname, '..', 'public', 'uploads', 'csv');
fs.mkdirSync(coversDir, { recursive: true });
fs.mkdirSync(csvDir, { recursive: true });

const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, coversDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const coverUpload = multer({
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|svg/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Formato de imagen no permitido. Usa JPG, PNG, WEBP o SVG.'), ok);
  },
});

const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, csvDir),
  filename: (req, file, cb) => cb(null, `import-${Date.now()}.csv`),
});

const csvUpload = multer({
  storage: csvStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ok = path.extname(file.originalname).toLowerCase() === '.csv';
    cb(ok ? null : new Error('Solo se permiten archivos .csv'), ok);
  },
});

module.exports = { coverUpload, csvUpload };
