# 📚 Biblioteca Virtual Escolar

Aplicación completa (Node.js + Express + MySQL) para la consulta y gestión del catálogo bibliográfico de un colegio o universidad. Incluye interfaz de estudiante (sin cuenta) e interfaz de administrador (con login), diseño responsive mobile-first y carga masiva de libros vía CSV.

## Índice
1. Requisitos
2. Instalación
3. Configuración de la base de datos
4. Conectar la base de datos real del colegio
5. Categorías normalizadas (evita duplicados)
6. Copias totales vs. copias disponibles
7. Estructura del proyecto
8. Primer administrador
9. Historial de actividad (auditoría)
10. Protección contra fuerza bruta
11. Información general (solo gestores)
12. Acciones masivas en la tabla de libros
13. Portadas optimizadas automáticamente
14. Exportar el catálogo (Excel / PDF)
15. Importación masiva por CSV
16. Módulos
17. Seguridad en producción
18. Pruebas automáticas
19. Próximos pasos sugeridos

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

### Migraciones automáticas

Los cambios de esquema **nuevos** viven en `database/migrations/` (`001_...sql`, `002_...sql`, …) y **se aplican solos al arrancar la app**, en orden, una sola vez cada uno. La app anota cuáles ya corrieron en la tabla `schema_migrations`, así que no hay que ejecutar nada a mano ni en local ni en Railway.

- Si una migración falla, la app **no arranca** (y en Railway el deploy no pasa el healthcheck, así que la versión anterior sigue en línea). El motivo queda en el log.
- Una migración ya aplicada no se edita: los cambios nuevos van en un archivo nuevo (si cambia su contenido, el log avisa).
- Para agregar una: crea `database/migrations/NNN_descripcion.sql` con el número siguiente. Si una sentencia falla porque la columna, índice o tabla ya existe, se da por hecha y se continúa.
- Para desactivarlas (por ejemplo, para correr el SQL a mano): variable `RUN_MIGRATIONS=false`.
- **Los `migrate_*.sql` antiguos no los toca el ejecutor**: asume que la base ya los tiene. Una base **nueva** necesita `schema.sql` y los `migrate_*.sql` una sola vez (como en las secciones 4 a 16), y desde ahí el ejecutor se encarga de lo demás.

---

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
│   ├── migrate_*.sql               # Migraciones antiguas (se corren a mano, una vez)
│   └── migrations/                 # Migraciones nuevas: se aplican solas al arrancar
├── middleware/
│   ├── auth.js                     # Protección de rutas de administrador
│   ├── upload.js                   # Subida de portadas y CSV (Multer)
│   ├── security.js                 # helmet/CSP, anti-CSRF (Origin), SESSION_SECRET
│   ├── rateLimit.js                # Límite de intentos por IP (login, registro, recuperación)
│   └── errorHandler.js             # Errores sin filtrar mensajes internos
├── models/
│   ├── Book.js                     # Consultas SQL sobre libros
│   ├── Category.js                 # Consultas SQL sobre categorías
│   └── Admin.js                    # Consultas SQL sobre cuentas de administrador
├── controllers/                     # Lógica de cada ruta
├── routes/                          # Definición de endpoints
├── views/                           # Plantillas EJS (estudiante + admin)
├── utils/                           # Utilidades: migraciones, contraseñas, bloqueo, auditoría...
├── tests/                           # Pruebas automáticas (node:test, sin base de datos)
└── public/
    ├── css/style.css                # Sistema de diseño
    ├── js/                          # JS progresivo (modal, filtros)
    └── uploads/covers/              # Portadas subidas por el administrador
```

## 8. Primer administrador

Ya **no existe ninguna cuenta con contraseña conocida**. Al arrancar, si la tabla `admins` está vacía, la app crea el primer gestor con estas variables (en `.env` en local; en Railway, en las variables del servicio):

```
INITIAL_ADMIN_USERNAME=un-usuario        # 3 a 100 caracteres: letras, números, . _ -
INITIAL_ADMIN_PASSWORD=Una-Clave#2026    # 8+ caracteres, con mayúscula, número y carácter especial
INITIAL_ADMIN_NAME=Nombre Apellido       # opcional
```

Esa persona **debe cambiar la contraseña en su primer ingreso**. Una vez creada la cuenta puedes borrar las variables: si ya existe cualquier administrador, no se vuelven a usar. Si no hay administradores y faltan las variables, el log del servidor lo avisa.

**Si tu base ya tenía el admin `admin / biblioteca123`** (instalaciones anteriores): la migración 003 obliga a cambiar esa contraseña en el próximo ingreso y borra su pregunta de seguridad pública (la respuesta estaba escrita en el repositorio). Entra, cambia la contraseña y define tu propia pregunta en *Mi cuenta*. O crea otro gestor y elimina `admin`.

### Gestión de otras cuentas de administrador

Solo la cuenta del primer administrador tiene permiso de gestionar otras cuentas desde el inicio (columna `can_manage_admins = 1`). Desde **Panel de administración → Administradores** (visible solo para cuentas con ese permiso) se puede:

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

### Accesos y acciones de estudiantes (con IP y navegador)

Además de las acciones sobre libros, categorías, cuentas, préstamos y configuración, el historial registra:

- **Accesos de administradores:** inicio de sesión, cierre de sesión, intentos fallidos, intentos bloqueados por demasiados fallos y restablecimiento de contraseña con la pregunta de seguridad.
- **Estudiantes:** registro, inicio y cierre de sesión, intentos fallidos o bloqueados, cambio de contraseña, anotarse o salir de la lista de espera y eliminar una referencia guardada.
- **IP y navegador (user-agent)** de **cada** acción, no solo de los accesos. En la tabla, la IP aparece en su columna (el navegador, al pasar el cursor) y se puede filtrar por **tipo de usuario** (administrador / estudiante / sin sesión) y por **dirección IP**.
- En un intento fallido, el nombre escrito solo se guarda si parece un usuario o correo (sin espacios, hasta 64 caracteres); si no, queda como "(no válido)" para no guardar sin querer una contraseña pegada en ese campo.

**Retención de datos personales.** La IP y el navegador son datos personales (y los estudiantes pueden ser menores). Cada 24 horas la app borra los eventos de sesión con más de **180 días** y deja en blanco la IP y el navegador de todo el historial anterior a esa fecha; el registro de *qué* se hizo y *quién* lo hizo se conserva. Se ajusta con `LOG_RETENTION_DAYS` (mínimo 30).

---

## 10. Protección contra fuerza bruta

El login de administrador y la verificación de la pregunta de seguridad (paso 2 de "olvidé mi contraseña") se bloquean temporalmente tras **5 intentos fallidos seguidos**, por **15 minutos**. Mientras dura el bloqueo, ni siquiera la contraseña o respuesta correcta funciona — hay que esperar a que pase el tiempo.

Detalles de la implementación:
- El login y la pregunta de seguridad tienen contadores **independientes**: agotar los intentos en uno no bloquea el otro.
- El bloqueo se cuenta por **usuario + IP** (5 fallos) y, además, hay un tope general por usuario desde cualquier IP (20 fallos). Así nadie puede bloquear a propósito la cuenta de un administrador escribiéndola mal 5 veces: solo se bloquea su propia conexión. Aplica al login de administrador, a la pregunta de seguridad y al login de estudiante.
- Se usa el nombre escrito exista o no la cuenta, para que no se pueda distinguir "usuario inválido" de "contraseña inválida" observando el comportamiento del bloqueo.
- Complementa al límite por IP de la sección 17, que corta por origen sin importar el usuario.
- Un intento **exitoso** borra por completo el historial de fallos de ese usuario.
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

## 11. Información general (solo gestores)

Desde **Panel de administración → Información general** (visible únicamente para cuentas con permiso de gestión), se edita toda la identidad y presentación del sitio, sin tocar código ni el archivo `.env`. Está dividido en 5 secciones:

**1. Presentación del sitio** — logo (se sube igual que las portadas, con redimensionado automático, pero conservando transparencia como PNG), nombre de la institución y nombre de la biblioteca.

**2. Color de acento del tema** — 5 paletas para elegir: Bosque (verde + dorado, la predeterminada), Océano (azul + coral), Atardecer (terracota + crema), Lavanda (púrpura + dorado suave), y Marino (azul marino + menta). El cambio se aplica a todo el sitio (estudiante y panel) al instante.

**3. Mensaje de bienvenida** — título y bajada de texto libre para la página de inicio, reemplazando el mensaje genérico por defecto. Si se dejan vacíos, se usa el mensaje predeterminado.

**4. Información de contacto y horario** — dirección, ciudad, teléfono, correo, horario de atención y redes sociales (Facebook, Instagram, X, WhatsApp). Se muestra en el **pie de página** del sitio de estudiantes — cada dato solo aparece si se configuró (no se ven campos vacíos).

**5. Modo mantenimiento** — un interruptor que muestra un aviso ("catálogo en actualización") a los estudiantes en la parte superior del sitio, útil mientras se hace una carga masiva grande o una reorganización de categorías. **No bloquea nada**: los estudiantes siguen pudiendo navegar y buscar con normalidad, y el panel de administración no se ve afectado en absoluto.

Todos los cambios se reflejan **al instante** en todo el sitio, sin reiniciar el servidor — se guardan en la base de datos y se mantienen en una caché en memoria para que cada página los muestre sin una consulta adicional. Guardar cambios aquí también queda registrado en el **Historial de actividad** y se puede **deshacer** como cualquier otra acción segura.

**Si ya tenías el proyecto instalado antes de esta función**, ejecuta ambas migraciones en orden (la segunda depende de la primera):

```bash
mysql -u root -p biblioteca_virtual < database/migrate_site_settings.sql
mysql -u root -p biblioteca_virtual < database/migrate_general_info.sql
```

En PowerShell (Windows):

```powershell
Get-Content database/migrate_site_settings.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
Get-Content database/migrate_general_info.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
```

Si ya habías corrido `migrate_site_settings.sql` antes, `migrate_general_info.sql` detecta lo que falta y solo agrega las columnas nuevas, sin tocar el nombre del colegio/biblioteca que ya tenías configurado.

## 12. Acciones masivas en la tabla de libros

En **Panel de administración → Libros**, cada fila tiene un checkbox de selección (y uno en el encabezado para "seleccionar todos"). Al marcar uno o más, aparece una barra con dos acciones:

- **Cambiar categoría**: reasigna todos los libros seleccionados a la categoría que elijas, de una sola vez.
- **Eliminar seleccionados**: elimina del catálogo todos los libros marcados, con una confirmación antes de ejecutarse.

Ambas acciones quedan registradas en el **Historial de actividad**, con el detalle de qué libros se vieron afectados. A diferencia de las acciones sobre un solo libro, las acciones masivas **no se pueden deshacer** desde el historial — por su mayor alcance, se optó por dejarlas fuera del sistema de "deshacer" (ver la sección de historial de actividad para el detalle de qué sí se puede deshacer).

## 13. Portadas optimizadas automáticamente

Al subir la portada de un libro (crear o editar), la imagen se procesa automáticamente antes de guardarse:

- Se redimensiona a un máximo de 500×720px, sin agrandar imágenes que ya sean más chicas.
- Se comprime como JPEG de calidad 82 — visualmente casi idéntica al original, pero mucho más liviana.
- Los archivos **SVG** (como las portadas de ejemplo incluidas) se guardan tal cual, ya que son vectores y no necesitan redimensionarse.

Esto evita que el servidor acumule imágenes pesadas sin optimizar a medida que crece el catálogo. Requiere la librería `sharp`, que se instala automáticamente con `npm install`.

## 14. Exportar el catálogo (Excel / PDF)

Desde **Panel de administración → Libros**, los botones "Exportar Excel" y "Exportar PDF" descargan el catálogo completo, respetando los filtros que tengas activos en ese momento (búsqueda, categoría, disponibilidad) — si no aplicaste ningún filtro, se exporta todo.

- **Excel** (`.xlsx`): una hoja "Catálogo" con todas las columnas (título, autor, ISBN, categoría, editorial, año, copias, estado, ubicación), con formato profesional, filtro automático y filas alternadas para facilitar la lectura; y una hoja "Resumen" con estadísticas rápidas (total de libros, copias totales/disponibles/prestadas) — útil para inventario anual o respaldo fuera de la base de datos.
- **PDF**: un reporte de inventario en formato horizontal, paginado automáticamente para catálogos grandes, con encabezado repetido en cada página.

Cada exportación queda registrada en el **Historial de actividad**, indicando quién la generó, en qué formato, y con qué filtros.

## 15. Importación masiva por CSV

Desde **Panel de administración → Importar CSV**, se puede subir un archivo `.csv` con esta estructura:

```csv
title,author,isbn,category,description,publisher,publication_year,total_copies,location
El Quijote,Miguel de Cervantes,9788420412146,Literatura,Novela clásica española,Editorial X,1605,3,Estante L-01
```

Campos obligatorios: `title`, `author`, `isbn`, `category`. Los demás son opcionales.

## 16. Módulos

Desde **Panel de administración → Módulos** (solo cuentas con permiso de gestión) se enciende o apaga cada parte opcional del sitio, sin reiniciar el servidor. **Admin** y **Catálogo** son la base y no se pueden apagar.

| Módulo | Qué se apaga |
| --- | --- |
| **Usuarios** | Registro, inicio de sesión, "Mi cuenta" y la sección Estudiantes del panel. También apaga Préstamos, que lo necesita. |
| **Préstamos** | Préstamos y devoluciones, lista de espera, recordatorios por correo y sus estadísticas. |
| **Fuentes abiertas** | La búsqueda en fuentes abiertas y "Mis referencias". |
| **Categorías** | La página de categorías, los filtros, la columna en exportaciones y su gestión en el panel. |

Apagar un módulo **no borra sus datos**: oculta sus enlaces y bloquea sus rutas (404 en el sitio público, aviso en el panel). Al encenderlo de nuevo todo sigue ahí.

Con **Categorías** apagado, los libros nuevos quedan en una categoría llamada "General", porque cada libro necesita una en la base de datos. Los libros existentes conservan la suya, y esa categoría "General" se verá si el módulo se vuelve a encender.

Con **Préstamos** apagado, los préstamos activos dejan de recibir recordatorios y sus copias siguen contando como no disponibles hasta que se encienda el módulo y se registre la devolución (o se ajusten con +1).

Para agregar un módulo nuevo: se declara en `models/Modules.js`, se protegen sus rutas con `requireModule('clave')` y se ocultan sus enlaces en las vistas con `modules.clave`.

**Si ya tenías el proyecto instalado antes de esta función**, ejecuta la migración (mientras no se corra, todos los módulos siguen encendidos y no se pueden apagar):

```bash
mysql -u root -p biblioteca_virtual < database/migrate_modules.sql
```

En PowerShell (Windows):

```powershell
Get-Content database/migrate_modules.sql | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p biblioteca_virtual
```

## 17. Seguridad en producción

Todo lo de esta sección funciona sin cambios en la base de datos.

**Variables que importan en Railway** (ver `.env.example`):

| Variable | Qué hace |
|---|---|
| `SESSION_SECRET` | **Obligatoria en producción.** Si falta, es el valor de ejemplo o tiene menos de 16 caracteres, la app no arranca y lo dice en el log. |
| `APP_URL` | URL pública. Además de armar los enlaces de los correos, se acepta como origen válido en la protección anti-CSRF. |
| `CSP_ENFORCE` | `false` (por defecto) = la CSP solo reporta; `true` = la CSP bloquea. Ver abajo. |

**Qué hay activo:**

- **Cabeceras con `helmet`** (nosniff, anti-clickjacking, HSTS por HTTPS, etc.). El `Referrer-Policy` se fija en `strict-origin-when-cross-origin`: con el `no-referrer` por defecto de helmet el navegador omitiría `Origin` en los formularios y la protección anti-CSRF los rechazaría.
- **CSP en modo solo reporte.** Las vistas usan scripts y estilos en línea, así que no se activa a ciegas. Para activarla: abre en el navegador las pantallas públicas y las de administración con la consola (F12) abierta; si no aparecen mensajes `[Report Only] Refused to...`, pon `CSP_ENFORCE=true` en Railway. Si aparece alguno, ajusta `helmetOptions()` en `middleware/security.js` antes de activarla.
- **Cookie de sesión** `httpOnly`, `sameSite=lax` y `secure` automática bajo HTTPS.
- **Sesiones en MySQL** (tabla `sessions`, migración 002, librería `express-mysql-session`): un reinicio o un deploy ya no cierra la sesión de todos. Las vencidas se limpian solas cada 15 minutos. Si MySQL está caído, el sitio no puede validar sesiones (antes seguía funcionando solo con memoria).
- **Anti-CSRF por `Origin`/`Referer`.** Toda petición que modifica datos (POST/PUT/PATCH/DELETE) debe traer `Origin` o `Referer` del propio sitio; si no, responde 403 y deja en el log del servidor una línea que empieza por `[CSRF]` con la ruta, el origen y la IP. Los GET pasan siempre. Consecuencia: un `curl -X POST` a mano debe incluir `-H "Origin: https://tu-dominio"`.
- **Límite de intentos por IP** (además del bloqueo por cuenta de la sección 10). Si se supera, se muestra un aviso y se pide esperar:

  | Ruta | Máximo | Ventana |
  |---|---|---|
  | Login de administrador | 20 | 15 min |
  | Recuperación de contraseña (admin) | 15 | 15 min |
  | Login de estudiante | 60 | 15 min |
  | Registro de estudiantes | 30 | 60 min |
  | Recuperación de contraseña (estudiante) | 15 | 15 min |

  Los de estudiante son más altos a propósito: un colegio suele salir a internet con una sola IP pública. Se ajustan en `middleware/rateLimit.js`. Los contadores viven en memoria y se reinician con cada deploy (el bloqueo por cuenta de la sección 10 sí está en la base de datos).
- **Archivos subidos.** Los SVG se revisan al subirlos (se rechazan los que traen `<script>`, eventos `onload=...`, enlaces `javascript:` o referencias externas) y todo lo de `/uploads` se sirve con una CSP `sandbox` que impide ejecutar scripts aunque alguien abra el archivo directamente.
- **Errores.** El usuario nunca ve el mensaje interno de una excepción (puede traer SQL o rutas); solo mensajes pensados para mostrarse (`utils/userError.js`) y los errores conocidos de subida de archivos. El detalle completo queda en el log del servidor.
- **`/health`** responde `200` si el proceso está vivo. A propósito no consulta la base de datos, para que un fallo momentáneo de MySQL no haga que Railway reinicie la app. Railway lo usa como healthcheck (`railway.json`).

---

## 18. Pruebas automáticas

```bash
npm test
```

Usa el ejecutor integrado de Node (`node:test`, sin dependencias nuevas) y **no necesita base de datos ni variables de entorno**: prueba funciones puras (política de contraseñas, validadores, citas APA, revisión de SVG, claves de bloqueo, contexto de petición, configuración del primer administrador) y, con objetos simulados, los middleware de seguridad y el **ejecutor de migraciones** (orden, omisión de lo ya aplicado, errores). También vigila que `schema.sql` no vuelva a traer un admin con contraseña conocida, que las migraciones estén numeradas sin saltos y sin `USE`/`DROP`, y que todo tipo de acción registrado en el historial esté definido. Los archivos están en `tests/*.test.js`.

En GitHub, el workflow `.github/workflows/ci.yml` corre la revisión de sintaxis y las pruebas en cada `push` y pull request, sin servicios extra.

---

## 19. Próximos pasos sugeridos

- Activar la CSP (`CSP_ENFORCE=true`) cuando la consola salga limpia (sección 17).
- Pasar los `migrate_*.sql` antiguos a `database/migrations/` para que una base **nueva** se arme completa sin pasos manuales (hoy necesita `schema.sql` y los `migrate_*.sql` una vez, y esos archivos traen `USE biblioteca_virtual;` fijo).
- Regenerar el identificador de sesión al iniciar sesión (`req.session.regenerate`) para cerrar la fijación de sesión.
- Verificación en dos pasos (2FA) para cuentas con permiso de gestión.
- Cuando se use una segunda instancia en Railway, pasar el límite por IP (hoy en memoria) a la base de datos.
