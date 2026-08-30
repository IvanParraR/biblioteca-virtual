// ============================================================
// Middleware de subida de archivos con Multer:
//  - coverUpload: portada individual al crear/editar un libro
//    (se guarda en memoria; processCoverImage la redimensiona y
//    comprime antes de escribirla a disco — ver más abajo)
//  - csvUpload: carga masiva de libros vía CSV
// ============================================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const coversDir = path.join(__dirname, '..', 'public', 'uploads', 'covers');
const csvDir = path.join(__dirname, '..', 'public', 'uploads', 'csv');
fs.mkdirSync(coversDir, { recursive: true });
fs.mkdirSync(csvDir, { recursive: true });

// Tamaño máximo de una portada ya procesada. Una portada de libro no
// necesita ser más grande que esto en ningún lugar de la interfaz —
// mantenerlas así de chicas ahorra espacio en disco y hace que el
// catálogo cargue más rápido, sobre todo en móvil.
const COVER_MAX_WIDTH = 500;
const COVER_MAX_HEIGHT = 720;
const COVER_JPEG_QUALITY = 82;

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (límite del archivo ORIGINAL subido)
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|svg/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Formato de imagen no permitido. Usa JPG, PNG, WEBP o SVG.'), ok);
  },
});

// Middleware que corre DESPUÉS de coverUpload.single('cover'). Toma el
// archivo que Multer dejó en memoria (req.file.buffer) y:
//   - si es SVG, lo guarda tal cual (es un vector, no tiene sentido
//     "redimensionarlo" — ya se adapta a cualquier tamaño).
//   - si es JPG/PNG/WEBP, lo redimensiona a un máximo de 500×720px
//     (sin agrandar imágenes más chicas) y lo comprime como JPEG de
//     calidad 82, que es donde ya no se nota diferencia visual en una
//     portada pero el archivo pesa una fracción de lo original.
// Deja `req.file.filename` listo para que el resto del código siga
// funcionando exactamente igual que antes (no cambia nada más).
async function processCoverImage(req, res, next) {
  if (!req.file) return next();

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    if (ext === '.svg') {
      const filename = `${unique}.svg`;
      await fs.promises.writeFile(path.join(coversDir, filename), req.file.buffer);
      req.file.filename = filename;
      return next();
    }

    const filename = `${unique}.jpg`;
    await sharp(req.file.buffer)
      .rotate() // respeta la orientación EXIF de fotos tomadas con el celular
      .resize({
        width: COVER_MAX_WIDTH,
        height: COVER_MAX_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#FFFFFF' }) // PNG con transparencia -> fondo blanco al convertir a JPEG
      .jpeg({ quality: COVER_JPEG_QUALITY, mozjpeg: true })
      .toFile(path.join(coversDir, filename));

    req.file.filename = filename;
    next();
  } catch (err) {
    next(err);
  }
}

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

module.exports = { coverUpload, processCoverImage, csvUpload };
