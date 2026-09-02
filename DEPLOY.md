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
   ```

   (`PORT` no hace falta definirlo — Railway lo inyecta solo, y `app.js`
   ya lee `process.env.PORT`.)

## 3. Cargar el esquema de la base de datos

El servicio de MySQL de Railway trae un botón **Connect** con los datos
de conexión (o un botón **Query** para correr SQL desde el navegador).
Opción más simple: usar ese editor de queries y pegar el contenido de
`database/schema.sql` (y luego las migraciones en `database/migrate_*.sql`
si las necesitan). También pueden conectarse con cualquier cliente MySQL
usando los datos de **Connect**.

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
