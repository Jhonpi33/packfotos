# 📸 PackFotos — Entrega de paquetes de fotos y videos

Sistema completo para vender paquetes de fotos hechos con el celular:

- **Página profesional** con tus paquetes, formulario de reserva y pago Nequi.
- **Panel de administración** (`/admin`) desde el celular: creas la galería de cada cliente (nombre, evento, fecha, hora, paquete, precio) y subes fotos/videos **directo desde la galería del iPhone**.
- **Galería privada por cliente**: link único que se genera solo. El cliente ve las fotos, reproduce los videos y descarga todo con un botón (ZIP).
- **Pago con Nequi**: el cliente paga y te avisa por WhatsApp; tú cambias el estado a "Pagado" con un toque y se desbloquean videos + descarga completa.
- **Almacenamiento en Google Drive** (gratis 15 GB) y respaldo automático de la base de datos en el mismo Drive.

---

## 1. Probar en tu computador

Necesitas [Node.js](https://nodejs.org) (versión 18 o más nueva, botón LTS).

1. Abre una terminal en esta carpeta y escribe:
   ```bash
   npm install
   ```
2. Crea la credencial de Google Drive (sección 2).
3. Edita `config.json` con tus datos (marca, número Nequi, WhatsApp, paquetes y precios).
4. En el archivo `.env` cambia la contraseña del panel (`ADMIN_PASSWORD`).
5. Arranca:
   ```bash
   npm start
   ```
6. Abre en el navegador:
   - Tu página: http://localhost:3000
   - Tu panel: http://localhost:3000/admin

---

## 2. Conectar Google Drive (una sola vez, gratis)

Las fotos y videos se guardan en **tu Google Drive personal** (tus 15 GB gratis, y los ves en tu app de Drive). Para que la página pueda guardarlos necesitas dos cosas: un *Client ID* y un *Client Secret* de Google.

> ✅ **Ya está configurado** en el proyecto de Google Cloud `packfotos-514100` (independiente del gym), con el permiso `drive.file` (no sensible) y la app **En producción**. Las credenciales están en `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`). Estos pasos solo hacen falta si algún día hay que rehacerlo.

Pasos (si hay que rehacerlo):

1. Entra a https://console.cloud.google.com y elige tu proyecto (puedes usar el mismo del gym, no se afectan entre sí).
2. Menú lateral (☰): **APIs & Services → OAuth consent screen**.
   - Si ya existe una (la del gym), solo agrega el alcance del paso 4.
   - Si no existe: elige **External** → **Create** → nombre de app: `PackFotos`, tu correo → **Save and Continue**.
3. En la misma pantalla asegúrate de que el estado sea **In production** (botón **Publish app**). Google mostrará un aviso de "app sin verificar": es normal, es para uso tuyo.
4. En **Scopes → Add or remove scopes**, agrega: `.../auth/drive.file` (Google Drive API) → **Save and Continue**.
5. Menú lateral: **APIs & Services → Credentials → + Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - Nombre: `packfotos`
   - **Authorized redirect URIs** (agrega las dos):
     - `http://localhost:3000/api/drive/callback`
     - `https://TU-APP.onrender.com/api/drive/callback` (la pondrás después, cuando subas a Render)
   - **Create**
6. Copia el **Client ID** y el **Client Secret** en el archivo `.env`:
   ```
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
   ```
7. Arranca el servidor (`npm start`) y entra a http://localhost:3000/admin.
8. Toca **"Conectar Google Drive"** → Google te pide permiso (con el mismo correo con el que usas Drive). Si aparece el aviso "Google no verificó esta app": **Avanzados → Ir a PackFotos (poco seguro)** → Continuar. Es tu propia app, es seguro.
9. ¡Listo! Se crea sola una carpeta **"Bre-B Fotografía – Galerías"** en tu Drive, con una subcarpeta por cliente.

> 🔁 El permiso dura para siempre (no hay que repetirlo). Si algún día Google lo desconecta, el panel te muestra el botón "Conectar Google Drive" otra vez y listo.

---

## 3. Subir a internet gratis (Render)

> ✅ **Ya está publicado en** **https://packfotos.onrender.com** (plan gratis, conectado a Google Drive y a tu repositorio de GitHub `Jhonpi33/packfotos`). Cada vez que subas cambios a GitHub, Render actualiza la página solo.

Para que los clientes entren desde cualquier celular:

1. Crea una cuenta gratis en https://render.com (puedes entrar con tu cuenta de Google).
2. Sube este proyecto a GitHub (crea un repositorio y sube la carpeta). Render lo lee desde ahí.
   - **Importante:** NO subas `.env` a GitHub (está en `.gitignore`, verifícalo).
3. En Render: **New → Web Service →** selecciona tu repositorio.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. En **Environment Variables** agrega:
   - `ADMIN_PASSWORD` = tu contraseña del panel
   - `GOOGLE_CLIENT_ID` = el Client ID del paso 2
   - `GOOGLE_CLIENT_SECRET` = el Client Secret del paso 2
   - `GOOGLE_REFRESH_TOKEN` = el valor que aparece en `data/local.json` (campo `driveTokens.refresh_token`) después de conectar Drive en tu computador. **Es clave**: en Render el disco es temporal y sin esta variable la conexión con Drive se perdería en cada reinicio.
5. Plan **Free** y clic en **Create Web Service**. Espera unos minutos.
6. Tu página queda en algo como `https://packfotos.onrender.com`. En Render puedes ponerle un nombre al inicio.
7. **Importante:** vuelve a Google Cloud → tu OAuth client → agrega la URI de redirección de Render: `https://TU-APP.onrender.com/api/drive/callback` (la URL real de tu app).
8. Entra a `https://TU-APP.onrender.com/admin` → **Conectar Google Drive** → autoriza. (El permiso es por app: toca conectarlo también en Render, además del de tu computador.)
9. Si quieres tu propio dominio (ej: `brebfotografia.com`), Render te deja conectarlo. Un dominio cuesta como $12 USD al año en [Namecheap](https://namecheap.com) o [Cloudflare](https://cloudflare.com).

> ⚠️ En el plan gratis, la página se "duerme" cuando nadie la visita y tarda ~50 segundos en despertar la primera vez. Es normal y gratis.

---

## 4. Uso día a día (desde tu iPhone)

1. Abre `TU-DOMINIO/admin` en Safari (guárdalo en tus favoritos o "Agregar a inicio").
2. Toca **➕ Nueva galería**: llena el nombre del cliente, celular, tipo de evento, fecha, hora, paquete y precio.
3. Se genera **solo** un link y un código.
4. Toca **📤 Subir fotos/videos** → se abre la galería de tu iPhone → selecciona todo → listo. Se muestra el % de subida.
5. Toca **💬 Enviar a cliente**: abre WhatsApp con el mensaje y el link listos. Solo envías. 😉
6. El cliente ve sus fotos, mira los videos y paga por Nequi (**318 659 6536**).
7. Cuando te confirme el pago, cambia el estado de la galería a **✅ Pagado** → se desbloquean videos y la descarga ZIP.

### Cómo lo ve el cliente
- Entra al link → ve las fotos en grande (se pueden pasar con el dedo).
- Ve el banner "Pendiente de pago" con tu número Nequi.
- Toca **"Ya pagué, avisar"** → te llega un WhatsApp automático con su código.
- Cuando la marcas como pagada, aparece **⬇ Descargar todo (ZIP)** y los videos se reproducen.

### Reservas
- En la página principal los clientes llenan el formulario de reserva.
- Las reservas aparecen en tu panel en la pestaña **📅 Reservas**, con botón para responder por WhatsApp y marcarlas como atendidas.

---

## 5. Personalizar

| Qué | Dónde |
|---|---|
| Marca, eslogan, número Nequi, WhatsApp | `config.json` |
| Paquetes y precios | `config.json` (sección `paquetes`) |
| Contraseña del panel | `.env` → `ADMIN_PASSWORD` |
| Bloquear descargas hasta pagar | `config.json` → `bloquearDescargasPendiente` (`true`/`false`) |
| Colores y estilo | `public/css/estilos.css` (variables al inicio) |

---

## 6. Consejos y solución de problemas

**📱 Fotos del iPhone:**
- Las fotos HEIC se convierten solas a JPG al subir, así se ven en cualquier navegador.
- Para máxima compatibilidad puedes poner tu cámara en JPG: *Ajustes → Cámara → Formatos → "Más compatible"*.

**🎬 Videos que "no cargan" en algunos celulares:**
- Los videos del iPhone (HEVC) se reproducen bien en iPhone/Safari. En algunos Android o PC con Chrome puede que no se vean: el cliente siempre tiene el botón **⬇ Descargar** para verlo en su galería.

**⚠ "Google Drive aún no está conectado":**
- Toca **"Conectar Google Drive"** en el panel y autoriza con tu correo.
- Revisa que `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` estén bien en `.env` (o en las variables de Render).
- Verifica que la URI de redirección exacta de tu app esté agregada en el OAuth client de Google Cloud.

**⚠ La subida de un video muy grande falla:**
- El límite por archivo es 2 GB. Para videos gigantes, súbelos de a uno.

**⚠ El ZIP tarda:**
- El sistema empaqueta todos los archivos al momento. Con muchos videos grandes puede tardar un par de minutos; es normal.

**🗑 Borrar una galería** borra también sus archivos de Drive (pregunta confirmación).

---

## 7. Límites del plan gratuito

- 15 GB de almacenamiento en Drive (cuando se llene, puedes pagar Google One o borrar galerías viejas).
- Render gratis duerme la página si nadie la visita (~50 s al despertar).
- Subida de archivos de máximo 2 GB por archivo.

Con más de ~15 GB o mucho tráfico, conviene pasar a un plan pago de Render (~$7 USD/mes) — todo el código funciona igual.
