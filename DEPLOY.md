# Desplegar en Railway

Guía paso a paso para los 3 integrantes del equipo. Se asume que ya tienen
el código en un repositorio de GitHub (si no, súbanlo primero — Railway
despliega directo desde ahí).

## 1. Crear el proyecto

1. Entren a [railway.app](https://railway.app) y creen cuenta (con GitHub es
   lo más rápido).
2. **New Project → Deploy from GitHub repo** → seleccionen el repo de
   `biblioteca-virtual`.
3. Railway detecta automáticamente que es Node.js (via Nixpacks) y usa
   `npm start` como comando de arranque — ya viene fijado también en
   `railway.json`, así que no hay que tocar nada acá.

## 2. Agregar la base de datos MySQL

1. Dentro del proyecto: **+ New → Database → Add MySQL**.
2. Railway crea el servicio y genera automáticamente las variables
   `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`.
3. Entren a la pestaña **Variables** del servicio de la **app** (no el de
   MySQL) y agreguen, referenciando al servicio de MySQL con `${{...}}`:

   ```
   DB_HOST=${{MySQL.MYSQLHOST}}
   DB_PORT=${{MySQL.MYSQLPORT}}
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   DB_NAME=${{MySQL.MYSQLDATABASE}}
   SESSION_SECRET=<generen una clave larga y aleatoria, distinta por ambiente>
   SCHOOL_NAME=<nombre del colegio>
   INITIAL_ADMIN_USERNAME=<usuario del primer administrador>
   INITIAL_ADMIN_PASSWORD=<contraseña temporal: 8+ caracteres, mayúscula, número y especial>
   ```

   > **Primer administrador.** El esquema ya no trae ninguna cuenta con
   > contraseña conocida. Con una base de datos vacía de administradores,
   > la app crea el primero con `INITIAL_ADMIN_USERNAME` e
   > `INITIAL_ADMIN_PASSWORD` y le **obliga a cambiar la contraseña** en
   > su primer ingreso. Después de entrar pueden borrar esas dos variables.

   (`PORT` no hace falta definirlo — Railway lo inyecta solo, y `app.js`
   ya lee `process.env.PORT`.)

   > **`SESSION_SECRET` es obligatoria.** Si falta, es el valor de
   > ejemplo de `.env.example` o tiene menos de 16 caracteres, la app se
   > niega a arrancar (el log de Railway dice por qué). Para generar una:
   > `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 3. Cargar el esquema de la base de datos

El servicio de MySQL de Railway trae un botón **Connect** con los datos
de conexión (o un botón **Query** para correr SQL desde el navegador).
Opción más simple: usar ese editor de queries y pegar el contenido de
`database/schema.sql` (y luego las migraciones en `database/migrate_*.sql`
si las necesitan). También pueden conectarse con cualquier cliente MySQL
usando los datos de **Connect**.

**Migraciones nuevas: automáticas.** Lo que esté en
`database/migrations/` (sesiones en MySQL, columnas de IP en el historial
de actividad, etc.) se aplica solo al arrancar la app, una vez cada
migración, y queda anotado en la tabla `schema_migrations`. Solo hay que
cargar a mano `schema.sql` y los `migrate_*.sql` antiguos en una base
**nueva** (una única vez). Si una migración falla, la app no arranca y
Railway mantiene la versión anterior en línea; el motivo sale en el log.

## 4. ⚠️ El punto crítico: persistir `public/uploads`

Railway usa contenedores efímeros — **cada vez que hacen un nuevo deploy,
el disco se reinicia desde cero**. Sin este paso, las portadas de libros,
el logo del colegio y los CSV importados que suban se van a borrar la
próxima vez que actualicen el código (que van a hacer seguido, según
contaron).

Solución — agregar un **Volume**:

1. En el servicio de la app: **Settings → Volumes → + New Volume**.
2. **Mount path**: `/app/public/uploads`
3. Guarden. Railway monta un disco persistente ahí, que sobrevive a
   redeploys y reinicios. El código no necesita ningún cambio — `multer`
   ya escribe justo en esas subcarpetas (`covers/`, `csv/`, `branding/`).

Sin este volumen, el proyecto funciona igual de bien para pruebas y
demos, pero pierden todo lo subido en cada actualización — así que
antes de mostrárselo al colegio, hagan este paso.

## 5. Dominio público

En **Settings → Networking → Generate Domain** obtienen una URL tipo
`biblioteca-virtual-production.up.railway.app`. Si más adelante quieren
un dominio propio, se agrega ahí mismo.

Una vez que tengan la URL, agréguenla como variable del servicio de la
app: `APP_URL=https://biblioteca-virtual-production.up.railway.app`
(sin barra final). Se usa para los enlaces de los correos y como origen
válido en la protección anti-CSRF.

## 6. Flujo de actualizaciones frecuentes

Con el repo conectado, cada `git push` a la rama configurada (normalmente
`main`) dispara un redeploy automático. Los tres pueden pushear sin
coordinarse con la plataforma — solo cuidado con cambios al esquema de
la base de datos: esos migran a mano (paso 3), no se aplican solos.

## 7. Costos esperados

Con el plan **Hobby** ($5/mes, que ya trae $5 de crédito de uso
incluido), una app chica como esta más una base MySQL pequeña
probablemente se mantengan dentro de ese crédito o lo superen por muy
poco. Se puede repartir entre los tres y poner una alerta de gasto desde
**Account Settings → Usage** para no llevarse sorpresas.

## 8. Después de cada deploy: qué revisar

0. **Migraciones.** En el log del deploy debe aparecer
   `Migraciones aplicadas: ...` (la primera vez) o `Base de datos al día`.
   Si aparece `Falló la migración`, el mensaje dice cuál sentencia.
1. **Healthcheck.** `railway.json` le indica a Railway que consulte
   `/health` (responde `200` si el proceso está vivo, sin tocar la base
   de datos). Si el deploy se queda en "Deploying" y falla el healthcheck,
   revisen el log: lo más probable es que falte `SESSION_SECRET`.
2. **Seguridad.** Los rechazos de la protección anti-CSRF aparecen en el
   log con el prefijo `[CSRF]`. Algunos eventuales rechazos de bots son
   normales; si un formulario legítimo falla con "Solicitud rechazada",
   revisen que `APP_URL` coincida con la URL con la que están entrando.
3. **CSP.** Arranca en modo solo reporte. Abran con la consola (F12) el
   catálogo público y el panel de administración; si no hay mensajes
   `[Report Only] Refused to...`, activen la política con
   `CSP_ENFORCE=true` en las variables del servicio (Railway redespliega
   solo). Detalle en el README, sección 17.
4. **Volume.** Verifiquen una vez que la portada de un libro subido
   sigue ahí después de un redeploy (paso 4).
5. **Primer administrador y accesos.** Entren con el usuario de
   `INITIAL_ADMIN_USERNAME`: debe pedirles cambiar la contraseña. Luego,
   en *Actividad*, deben verse el inicio de sesión con su IP. Si la base
   **ya tenía** el admin `admin / biblioteca123`, la migración 003 le
   exige cambiar la contraseña y borra su pregunta de seguridad pública:
   entren con él, cambien la contraseña y definan otra pregunta en *Mi
   cuenta* (o creen otro gestor y eliminen `admin`).
6. **Sesiones.** Hagan login, esperen a que termine un redeploy y
   recarguen: la sesión debe seguir abierta.
7. **Pruebas.** En GitHub, el workflow de CI corre `npm test` en cada
   push; no necesita base de datos. Para correrlas en local: `npm test`.
