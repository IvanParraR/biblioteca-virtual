# 📚 Biblioteca Virtual Escolar

Aplicación completa (Node.js + Express + MySQL) para la consulta y gestión del catálogo bibliográfico de un colegio o universidad. Incluye interfaz de estudiante (sin cuenta) e interfaz de administrador (con login), diseño responsive mobile-first y carga masiva de libros vía CSV.

## Índice
1. Requisitos
2. Instalación
3. Configuración de la base de datos
4. Conectar la base de datos real del colegio
5. Estructura del proyecto
6. Cuenta de administrador de prueba
7. Importación masiva por CSV
8. Próximos pasos sugeridos

---

## 1. Requisitos

- Node.js 18 o superior
- MySQL 8 (o MariaDB compatible)
- npm

## 2. Instalación

```bash
cd biblioteca-virtual
npm install
cp .env.example .env
```

Edita `.env` con los datos de tu base de datos y el nombre de tu institución:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_contraseña
DB_NAME=biblioteca_virtual
SESSION_SECRET=una-clave-larga-y-aleatoria
PORT=3000
SCHOOL_NAME=Colegio San Martín
```

## 3. Configuración de la base de datos

Este prototipo incluye un esquema completo y datos de ejemplo (14 libros) en `database/schema.sql`.

```bash
mysql -u root -p < database/schema.sql
```

Esto crea la base de datos `biblioteca_virtual`, las tablas `books` y `admins`, un usuario administrador de prueba y 14 libros de muestra en 8 categorías distintas.

Luego, inicia la aplicación:

```bash
npm start
# o, para desarrollo con recarga automática:
npm run dev
```

Abre `http://localhost:3000` para la vista de estudiante y `http://localhost:3000/admin/login` para el panel de administración.

## 4. Conectar la base de datos real del colegio

Este prototipo fue diseñado para conectarse fácilmente a la base de datos MySQL existente del colegio:

1. **Si la tabla de libros del colegio ya tiene una estructura similar** (título, autor, ISBN, categoría, copias, etc.), simplemente:
   - Ajusta las variables `DB_*` en `.env` para apuntar a esa base de datos.
   - Si los nombres de columna son distintos, edita las consultas SQL en `models/Book.js` (es el único archivo que contiene SQL directo — toda la aplicación pasa por este modelo).

2. **Si la estructura es distinta**, se recomienda crear una vista SQL (`CREATE VIEW`) que traduzca las columnas reales del colegio al formato esperado por `models/Book.js`, evitando así modificar la base de datos original.

3. **El campo de estado (`status`) nunca se almacena como texto**: se calcula automáticamente a partir de `available_copies`, `total_copies` y `library_only`. Esto asegura que el catálogo nunca muestre un estado desincronizado, sin importar qué sistema externo actualice las copias.

4. Este prototipo **no implementa préstamos** (crear/devolver préstamos) — solo consulta y gestión de catálogo, según el alcance definido. Cuando se conecte al sistema real de préstamos del colegio, el campo `available_copies` debería actualizarse desde ese sistema (por ejemplo, mediante un trigger, un job programado, o una API intermedia).

## 5. Estructura del proyecto

```
biblioteca-virtual/
├── app.js                     # Punto de entrada de Express
├── config/db.js               # Pool de conexión MySQL
├── database/schema.sql        # Esquema + datos de ejemplo
├── middleware/
│   ├── auth.js                # Protección de rutas de administrador
│   └── upload.js               # Subida de portadas y CSV (Multer)
├── models/Book.js             # Todas las consultas SQL sobre libros
├── controllers/                # Lógica de cada ruta
├── routes/                     # Definición de endpoints
├── views/                      # Plantillas EJS (estudiante + admin)
└── public/
    ├── css/style.css           # Sistema de diseño
    ├── js/                     # JS progresivo (modal, filtros)
    └── uploads/covers/         # Portadas subidas por el administrador
```

## 6. Cuenta de administrador de prueba

```
Usuario:     admin
Contraseña:  biblioteca123
```

⚠️ Cambia esta contraseña antes de usar la aplicación en producción (puedes generar un nuevo hash con `bcryptjs` y actualizarlo directamente en la tabla `admins`).

## 7. Importación masiva por CSV

Desde **Panel de administración → Importar CSV**, se puede subir un archivo `.csv` con esta estructura:

```csv
title,author,isbn,category,description,publisher,publication_year,total_copies,location
El Quijote,Miguel de Cervantes,9788420412146,Literatura,Novela clásica española,Editorial X,1605,3,Estante L-01
```

Campos obligatorios: `title`, `author`, `isbn`, `category`. Los demás son opcionales.

## 8. Próximos pasos sugeridos

- Implementar el flujo completo de préstamos (solicitud, devolución, historial).
- Agregar recuperación de contraseña para administradores.
- Exportar el catálogo o reportes en PDF/Excel.
- Roles adicionales (bibliotecario vs. administrador general).
- Notificaciones de vencimiento cuando se active el módulo de préstamos.
