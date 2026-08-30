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

## 5. Categorías normalizadas (evita duplicados)

Las categorías viven en su propia tabla (`categories`), no como texto libre en cada libro. Esto evita que existan "Matemáticas" y "matematicas" como cosas distintas.

- Al crear o editar un libro, el administrador elige de un **desplegable** con las categorías existentes, o hace clic en "+ Agregar nueva categoría" para escribir una. Si ya existe una categoría con ese nombre (sin importar mayúsculas, tildes o espacios), **se reutiliza automáticamente** en vez de crear una duplicada.
- Desde **Panel de administración → Categorías** se pueden crear, renombrar y eliminar categorías (solo si no tienen libros asignados), y **fusionar** dos categorías en una con un clic (útil para limpiar duplicados que ya existían antes de esta función).
- La importación por CSV usa la misma lógica: si la columna `category` de una fila coincide con una categoría existente, la reutiliza.

**Si ya tenías el proyecto instalado con la columna `category` como texto libre**, ejecuta la migración correspondiente (ver sección 8).

## 6. Copias totales vs. copias disponibles

Cada libro tiene dos números independientes:

- **Copias totales** — cuántos ejemplares físicos existen en la biblioteca. Este número es **fijo** y solo se cambia desde **Editar libro**.
- **Copias disponibles** — cuántos de esos ejemplares están en el estante ahora mismo (no prestados). Los botones **+1 / -1** de la tabla de libros solo mueven este número, simulando un préstamo (-1) o una devolución (+1) — nunca alteran el total.

Reglas de los botones +1 / -1:
- **-1** nunca deja las copias disponibles por debajo de 0 (se deshabilita automáticamente al llegar a 0).
- **+1** nunca supera el total de copias (se deshabilita automáticamente al llegar al total).

Si cambias el total de copias desde "Editar libro" (por ejemplo, porque compraste más ejemplares o se perdió uno), las disponibles se ajustan proporcionalmente de forma automática, sin afectar los ejemplares que ya estaban prestados.

## 7. Estructura del proyecto

```
biblioteca-virtual/
├── app.js                          # Punto de entrada de Express
├── config/db.js                    # Pool de conexión MySQL
├── database/
│   ├── schema.sql                  # Esquema + datos de ejemplo
│   ├── migrate_admin_permissions.sql  # Migración: permisos de administradores
│   └── migrate_categories.sql      # Migración: normaliza categorías
├── middleware/
│   ├── auth.js                     # Protección de rutas de administrador
│   └── upload.js                   # Subida de portadas y CSV (Multer)
├── models/
│   ├── Book.js                     # Consultas SQL sobre libros
│   ├── Category.js                 # Consultas SQL sobre categorías
│   └── Admin.js                    # Consultas SQL sobre cuentas de administrador
├── controllers/                     # Lógica de cada ruta
├── routes/                          # Definición de endpoints
├── views/                           # Plantillas EJS (estudiante + admin)
└── public/
    ├── css/style.css                # Sistema de diseño
    ├── js/                          # JS progresivo (modal, filtros)
    └── uploads/covers/              # Portadas subidas por el administrador
```

## 8. Cuenta de administrador de prueba

```
Usuario:     admin
Contraseña:  biblioteca123
```

⚠️ Cambia esta contraseña antes de usar la aplicación en producción (puedes generar un nuevo hash con `bcryptjs` y actualizarlo directamente en la tabla `admins`).

### Gestión de otras cuentas de administrador

Solo la cuenta semilla (`admin`) tiene permiso de gestionar otras cuentas desde el inicio (columna `can_manage_admins = 1`). Desde **Panel de administración → Administradores** (visible solo para cuentas con ese permiso) se puede:

- Crear nuevas cuentas de administrador (por defecto, **sin** permiso de gestión — solo pueden administrar el catálogo de libros).
- Otorgar o quitar el permiso de gestión a otras cuentas.
- Eliminar cuentas (no se permite eliminar la propia cuenta ni la única cuenta restante con permiso de gestión, para evitar quedarse sin acceso).

**Si ya tenías el proyecto instalado antes de esta función**, ejecuta la migración para agregar la columna sin perder tus datos:

```bash
mysql -u root -p biblioteca_virtual < database/migrate_admin_permissions.sql
```

En PowerShell (Windows):

```powershell
Get-Content database/migrate_admin_permissions.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
```

Esto agrega la columna `can_manage_admins` y se la otorga automáticamente a la cuenta de administrador más antigua.

### Recuperación de contraseña (dos niveles)

**Nivel 1 — Autoservicio con pregunta de seguridad.** Cada admin configura su propia pregunta desde **Mi cuenta** (requiere confirmar su contraseña actual). Si la olvida, desde el login hace clic en "¿Olvidaste tu contraseña?", responde la pregunta y define una nueva — sin ayuda de nadie más. La cuenta semilla ya trae una de ejemplo: *"¿De qué color es el tema de esta biblioteca virtual?"* → `verde`.

**Nivel 2 — Reseteo asistido por un gestor.** Si el admin no recuerda su respuesta, una cuenta con permiso de gestión puede asignarle una **contraseña temporal** desde Panel de administración → Administradores (con un mensaje de confirmación antes de ejecutarlo, ya que es una acción sensible). Esa cuenta queda bloqueada de todo el panel — solo puede entrar a "Mi cuenta" — hasta que defina una contraseña nueva usando la temporal como contraseña actual.

**Cambio de contraseña propia.** Cualquier admin puede cambiar su propia contraseña en cualquier momento desde **Mi cuenta**, con el formato contraseña actual + nueva + confirmación.

**Si ya tenías el proyecto instalado antes de esta función**, ejecuta la migración:

```bash
mysql -u root -p biblioteca_virtual < database/migrate_password_recovery.sql
```

En PowerShell (Windows):

```powershell
Get-Content database/migrate_password_recovery.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
```

Esto agrega las columnas `security_question`, `security_answer_hash` y `must_change_password` sin afectar tus cuentas ni contraseñas existentes. Cada admin deberá entrar a "Mi cuenta" para configurar su pregunta de seguridad (no viene configurada automáticamente para cuentas ya existentes).

### Migración de categorías (si ya tenías el proyecto instalado)

Si tu base de datos todavía tiene la columna `books.category` como texto libre, ejecuta:

```bash
mysql -u root -p biblioteca_virtual < database/migrate_categories.sql
```

En PowerShell (Windows):

```powershell
Get-Content database/migrate_categories.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
```

Esto crea la tabla `categories`, agrupa tus categorías de texto existentes (recortando espacios), conecta cada libro con su categoría correspondiente, y elimina la columna vieja. Si tenías variaciones de mayúsculas como "Matemáticas" y "matematicas" como textos distintos, quedarán como dos categorías separadas — entra a **Panel de administración → Categorías** y usa el botón **"Fusionar"** para unirlas en una sola con un clic.

### Nota sobre acentos y caracteres especiales

Todos los scripts SQL de este proyecto incluyen `SET NAMES utf8mb4;`, lo que evita que tildes y eñes se corrompan (ej. "MatemÃ¡ticas" en vez de "Matemáticas") sin importar la configuración regional de tu instalación de MySQL. Si aun así ves caracteres corruptos, verifica que tu terminal esté usando UTF-8.

## 9. Historial de actividad (auditoría)

Panel de administración → Actividad (visible para cualquier cuenta de admin, no solo las que tienen permiso de gestión). Registra automáticamente cada acción que modifica datos: crear/editar/eliminar libros, mover copias disponibles, importar CSV, crear/renombrar/fusionar/eliminar categorías, y todo lo relacionado con cuentas de administrador (crear, dar/quitar permisos, asignar contraseña temporal, eliminar, cambios de la propia contraseña y pregunta de seguridad).

Se puede filtrar y ordenar por:
- **Rango de tiempo**: Hoy, Última semana, Último mes, una fecha específica, o un rango personalizado (desde/hasta).
- **Actividad**: un tipo de acción específico (ej. solo "Eliminó el libro").
- **Administrador**: todas las acciones de una misma cuenta.
- **Entidad afectada**: Libros, Categorías o Administradores.
- **Orden**: por fecha o por nombre de administrador, ascendente o descendente.

Los registros se conservan aunque se elimine la cuenta que hizo la acción (queda el nombre de usuario, pero se desvincula el ID).

### Deshacer acciones

Solo el subconjunto de acciones consideradas **seguras** se puede deshacer desde el botón "Deshacer" junto a cada fila:

- Crear / editar / eliminar libro
- Mover copias disponibles (+1 / -1)
- Crear / renombrar / eliminar categoría
- Dar / quitar permiso de gestión a un administrador

**Quedan fuera a propósito** (por motivos de seguridad, ver la conversación de diseño): fusionar categorías, asignar contraseña temporal, y los cambios de la propia contraseña o pregunta de seguridad. Deshacer esas dejaría a alguien con credenciales viejas sin que lo sepa.

Reglas de "deshacer":

1. **Solo se puede deshacer la acción MÁS RECIENTE sobre una entidad.** Si alguien más editó ese libro/categoría/admin después, el botón queda deshabilitado con el motivo "Hubo cambios posteriores sobre esto" — así nunca se pisa un cambio posterior sin darte cuenta.
2. **Autodeshacer** (15 minutos): la misma cuenta que hizo la acción puede deshacerla ella misma, sin necesitar nada más, durante los primeros 15 minutos.
3. **Deshacer asistido** (48 horas): pasada la ventana de autodeshacer, cualquier administrador puede deshacer acciones sobre libros/categorías (ya que cualquier admin puede editarlos de por sí); para acciones sobre **cuentas de administrador**, solo alguien con permiso de gestión puede hacerlo — igual que para realizar la acción original.
4. **Deshacer también queda registrado** como una nueva entrada en el historial (con el ícono ↩), nunca se borra la entrada original — así nunca se pierde la trazabilidad de quién hizo qué.

**Si ya tenías el proyecto instalado antes de esta función**, ejecuta la migración:

```bash
mysql -u root -p biblioteca_virtual < database/migrate_activity_log.sql
```

En PowerShell (Windows):

```powershell
Get-Content database/migrate_activity_log.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
```

El historial empieza vacío desde el momento en que se aplica la migración — no reconstruye actividad pasada, ya que esa información no existía antes.

## 10. Protección contra fuerza bruta

El login de administrador y la verificación de la pregunta de seguridad (paso 2 de "olvidé mi contraseña") se bloquean temporalmente tras **5 intentos fallidos seguidos**, por **15 minutos**. Mientras dura el bloqueo, ni siquiera la contraseña o respuesta correcta funciona — hay que esperar a que pase el tiempo.

Detalles de la implementación:
- El login y la pregunta de seguridad tienen contadores **independientes**: agotar los intentos en uno no bloquea el otro.
- El identificador de bloqueo es el nombre de usuario escrito (exista o no la cuenta), para que no se pueda distinguir "usuario inválido" de "contraseña inválida" observando el comportamiento del bloqueo.
- Un intento **exitoso** borra por completo el historial de fallos de ese identificador.
- Pasados los 15 minutos, el siguiente intento reinicia el contador desde cero automáticamente.
- El mensaje de error muestra cuántos intentos quedan antes del bloqueo, y cuántos minutos faltan mientras está bloqueado.

**Si ya tenías el proyecto instalado antes de esta función**, ejecuta la migración:

```bash
mysql -u root -p biblioteca_virtual < database/migrate_login_lockouts.sql
```

En PowerShell (Windows):

```powershell
Get-Content database/migrate_login_lockouts.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
```

## 11. Exportar el catálogo (Excel / PDF)

Desde **Panel de administración → Libros**, los botones "Exportar Excel" y "Exportar PDF" descargan el catálogo completo, respetando los filtros que tengas activos en ese momento (búsqueda, categoría, disponibilidad) — si no aplicaste ningún filtro, se exporta todo.

- **Excel** (`.xlsx`): una hoja "Catálogo" con todas las columnas (título, autor, ISBN, categoría, editorial, año, copias, estado, ubicación), con formato profesional, filtro automático y filas alternadas para facilitar la lectura; y una hoja "Resumen" con estadísticas rápidas (total de libros, copias totales/disponibles/prestadas) — útil para inventario anual o respaldo fuera de la base de datos.
- **PDF**: un reporte de inventario en formato horizontal, paginado automáticamente para catálogos grandes, con encabezado repetido en cada página.

Cada exportación queda registrada en el **Historial de actividad**, indicando quién la generó, en qué formato, y con qué filtros.

## 12. Importación masiva por CSV

Desde **Panel de administración → Importar CSV**, se puede subir un archivo `.csv` con esta estructura:

```csv
title,author,isbn,category,description,publisher,publication_year,total_copies,location
El Quijote,Miguel de Cervantes,9788420412146,Literatura,Novela clásica española,Editorial X,1605,3,Estante L-01
```

Campos obligatorios: `title`, `author`, `isbn`, `category`. Los demás son opcionales.

## 13. Próximos pasos sugeridos

- Implementar el flujo completo de préstamos (solicitud, devolución, historial).
- Agregar recuperación de contraseña para administradores.
- Exportar el catálogo o reportes en PDF/Excel.
- Roles adicionales (bibliotecario vs. administrador general).
- Notificaciones de vencimiento cuando se active el módulo de préstamos.
