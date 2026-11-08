// Guaití — servidor principal
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const store = require('./store');
const drive = require('./drive');
const media = require('./media');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const TMP = path.join(__dirname, 'tmp');

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let config = {
  marca: 'Guaití', eslogan: 'Aventura Sin Límite',
  whatsapp: '', servicios: []
};
try {
  config = { ...config, ...JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')) };
} catch (e) {
  console.error('⚠ No se pudo leer config.json, usando valores por defecto.');
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC));

store.load();

/* ---------------- utilidades ---------------- */

const parseCookies = req => {
  const out = {};
  for (const par of (req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return out;
};
const tokenCorrecto = () => crypto.createHash('sha256').update('guaiti::' + ADMIN_PASSWORD).digest('hex');
const autenticado = req => parseCookies(req).token === tokenCorrecto();
const requiereAuth = (req, res, next) => autenticado(req) ? next() : res.status(401).json({ error: 'No autorizado' });

const slugify = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'galeria';
const alAzar = (len, chars) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

const publicConfig = () => ({
  marca: config.marca, eslogan: config.eslogan,
  whatsapp: config.whatsapp, servicios: config.servicios
});

const publicarGalerias = gals => gals.map(g => ({
  id: g.id, code: g.code, cliente: g.cliente, servicio: g.servicio,
  fecha: g.fecha, hora: g.hora, personas: g.personas, notas: g.notas,
  creadoEn: g.creadoEn,
  totalArchivos: (g.archivos || []).length,
  totalFotos: (g.archivos || []).filter(a => a.tipo === 'foto').length,
  totalVideos: (g.archivos || []).filter(a => a.tipo === 'video').length,
  bytes: (g.archivos || []).reduce((s, a) => s + (Number(a.size) || 0), 0),
  archivos: (g.archivos || []).map(a => ({ id: a.id, nombre: a.nombre, tipo: a.tipo, size: a.size, thumb: a.thumb }))
}));

/* ---------------- respaldo de la BD en Drive ---------------- */

let syncTimer = null;
const programarSync = () => { clearTimeout(syncTimer); syncTimer = setTimeout(syncDb, 4000); };

async function syncDb() {
  try {
    const id = store.getLocal().dbFileId || null;
    const nuevoId = await drive.guardarDb(id, JSON.stringify(store.get()));
    if (nuevoId !== id) store.setLocal({ dbFileId: nuevoId });
  } catch (e) {
    console.error('⚠ No se pudo respaldar la base de datos en Drive:', e.message);
  }
}

// Cambia la BD y programa el respaldo automático en Drive.
const cambiarDb = async fn => { await store.mutate(fn); programarSync(); };

/* ---------------- arranque con Drive ---------------- */

(async () => {
  try {
    const tokens = store.getLocal().driveTokens ||
      (process.env.GOOGLE_REFRESH_TOKEN ? { refresh_token: process.env.GOOGLE_REFRESH_TOKEN } : null);
    await drive.init(tokens);
    await prepararDrive();
  } catch (e) {
    console.error('⚠ Google Drive:', e.message);
    console.error('  Ve al panel (/admin) y toca "Conectar Google Drive".');
  }
})();

async function prepararDrive() {
  let local = store.getLocal();
  if (!local.rootFolderId) {
    local.rootFolderId = await drive.buscarOCrearCarpetaRaiz(config.marca + ' – Galerías');
    store.setLocal(local);
  }
  drive.setRaiz(local.rootFolderId);

  try {
    const remota = await drive.buscarDb();
    if (remota) {
      const tLocal = fs.existsSync(store.DB_PATH) ? fs.statSync(store.DB_PATH).mtimeMs : 0;
      if (Date.parse(remota.modifiedTime) > tLocal) {
        const contenido = await drive.descargar(remota.id);
        fs.writeFileSync(store.DB_PATH, contenido);
        store.load();
        console.log('✔ Base de datos restaurada desde Drive');
      }
    }
  } catch (e) { console.error('Aviso al restaurar BD:', e.message); }

  console.log('✔ Conectado a Google Drive');
}

/* ---------------- subida de archivos ---------------- */

const upload = multer({
  storage: multer.diskStorage({
    destination: TMP,
    filename: (req, file, cb) => cb(null,
      Date.now() + '-' + alAzar(6, 'abcdefghjkmnpqrstuvwxyz23456789') +
      path.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '').slice(0, 10))
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2 GB por archivo
});

function nombreUnico(usados, nombre) {
  const base = path.basename(nombre);
  const key = base.toLowerCase();
  if (!usados.has(key)) { usados.add(key); return base; }
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  let i = 2;
  while (usados.has(`${stem} (${i})${ext}`.toLowerCase())) i++;
  const final = `${stem} (${i})${ext}`;
  usados.add(final.toLowerCase());
  return final;
}

async function procesarArchivo(gal, f, usados) {
  const ext = path.extname(f.originalname).toLowerCase();
  let ruta = f.path;
  let nombre = f.originalname;
  let mime = media.mimeDe(ext);

  // HEIC/HEIF (iPhone) → JPG para que se vea en cualquier navegador.
  if (['.heic', '.heif'].includes(ext)) {
    try {
      const out = f.path + '.conv.jpg';
      await media.convertirHeic(f.path, out);
      ruta = out;
      nombre = nombre.replace(/\.[^.]+$/, '') + '.jpg';
      mime = 'image/jpeg';
    } catch (e) { /* si no se puede convertir, se sube el original */ }
  }

  const nombreFinal = nombreUnico(usados, nombre);
  const subido = await drive.subir({
    carpeta: gal.carpetaDrive, nombre: nombreFinal, mimeType: mime,
    origen: fs.createReadStream(ruta)
  });

  let thumb = null;
  if (mime.startsWith('image/')) {
    try {
      const buf = await media.miniatura(ruta);
      const t = await drive.subirBuffer({
        carpeta: gal.carpetaThumbs,
        nombre: nombreFinal.replace(/\.[^.]+$/, '') + '.jpg',
        mimeType: 'image/jpeg', buffer: buf
      });
      thumb = t.id;
    } catch (e) { console.error('Sin miniatura para', nombreFinal, ':', e.message); }
  }

  if (ruta !== f.path) fs.unlink(ruta, () => {});
  return {
    id: subido.id, nombre: nombreFinal, nombreOriginal: f.originalname,
    mime, tipo: mime.startsWith('image/') ? 'foto' : 'video',
    size: Number(subido.size) || 0, thumb
  };
}

/* ---------------- rutas públicas ---------------- */

app.get('/api/estado', (req, res) => res.json({
  ok: true,
  drive: drive.listo() ? 'conectado' : 'pendiente',
  galerias: store.getGalerias().length
}));

app.get('/api/config', (req, res) => res.json(publicConfig()));

// El cliente deja sus datos (nombre, servicio, fecha y hora del tour).
app.post('/api/solicitud', async (req, res) => {
  const b = req.body || {};
  const nombre = (b.nombre || '').trim();
  const celular = (b.celular || '').trim();
  const servicio = (b.servicio || '').trim();
  if (!nombre || !celular) {
    return res.status(400).json({ error: 'Cuéntanos tu nombre y tu celular' });
  }
  if (!servicio) {
    return res.status(400).json({ error: 'Elige tu servicio: Cueva de la Vaca o Cuatrimotos' });
  }
  const solicitud = {
    id: 's' + Date.now().toString(36),
    nombre, celular, servicio,
    fecha: (b.fecha || '').trim(), hora: (b.hora || '').trim(),
    personas: (b.personas || '').trim(), notas: (b.notas || '').trim(),
    atendido: false, creadoEn: new Date().toISOString()
  };
  await cambiarDb(db => db.solicitudes.push(solicitud));
  res.json({ ok: true });
});

app.get('/api/galeria/:code', (req, res) => {
  const g = store.buscar(req.params.code);
  if (!g) return res.status(404).json({ error: 'Galería no encontrada' });
  res.json({
    id: g.id, code: g.code, cliente: g.cliente,
    servicio: g.servicio, fecha: g.fecha, hora: g.hora, personas: g.personas,
    totalArchivos: (g.archivos || []).length,
    archivos: (g.archivos || []).map(a => ({ id: a.id, nombre: a.nombre, tipo: a.tipo, size: a.size, thumb: a.thumb })),
    whatsapp: config.whatsapp
  });
});

app.get('/api/thumb/:code/:fileId', async (req, res) => {
  const r = store.archivo(req.params.code, req.params.fileId);
  if (!r || !r.archivo.thumb) return res.status(404).send('Sin miniatura');
  try {
    const d = await drive.stream(r.archivo.thumb);
    res.status(200);
    res.setHeader('content-type', 'image/jpeg');
    res.setHeader('cache-control', 'public, max-age=2592000, immutable');
    d.data.on('error', () => res.destroy());
    d.data.pipe(res);
  } catch (e) {
    res.status(404).send('No disponible');
  }
});

app.get('/api/archivo/:code/:fileId', async (req, res) => {
  const r = store.archivo(req.params.code, req.params.fileId);
  if (!r) return res.status(404).send('No encontrado');
  try {
    const d = await drive.stream(r.archivo.id, req.headers.range);
    res.status(d.status || 200);
    ['content-type', 'content-length', 'content-range', 'etag'].forEach(h => {
      if (d.headers[h]) res.setHeader(h, d.headers[h]);
    });
    if (!res.getHeader('content-type')) res.setHeader('content-type', r.archivo.mime);
    res.setHeader('accept-ranges', 'bytes');
    res.setHeader('cache-control', 'private, max-age=3600');
    res.setHeader('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(r.archivo.nombre)}`);
    d.data.on('error', () => res.destroy());
    d.data.pipe(res);
  } catch (e) {
    res.status(404).send('No disponible');
  }
});

app.get('/api/zip/:code', async (req, res) => {
  const g = store.buscar(req.params.code);
  if (!g) return res.status(404).send('No encontrada');
  if (!(g.archivos || []).length) return res.status(400).send('La galería está vacía');

  res.setHeader('content-type', 'application/zip');
  res.setHeader('content-disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(g.code + ' - ' + g.cliente.nombre + '.zip')}`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', () => { try { res.end(); } catch (e) {} });
  archive.pipe(res);

  for (const f of g.archivos) {
    try {
      const d = await drive.stream(f.id);
      archive.append(d.data, { name: f.nombre });
    } catch (e) {
      console.error('Error agregando al ZIP:', f.nombre, e.message);
    }
  }
  await archive.finalize();
});

/* ---------------- conexión con Google Drive (OAuth) ---------------- */

app.get('/api/drive/url', requiereAuth, (req, res) => {
  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/drive/callback`;
    res.json({ url: drive.urlAutorizar(redirectUri) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/drive/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || state !== 'guaiti' || !code) return res.redirect('/admin?drive=error');
  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/drive/callback`;
    const tokens = await drive.intercambiar(code, redirectUri);
    store.setLocal({ driveTokens: tokens });
    await drive.init(tokens);
    await prepararDrive();
    res.redirect('/admin?drive=ok');
  } catch (e) {
    console.error('Error conectando Google Drive:', e.message);
    res.redirect('/admin?drive=error');
  }
});

/* ---------------- rutas de administración ---------------- */

app.post('/api/admin/login', (req, res) => {
  if (req.body?.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  res.setHeader('Set-Cookie', `token=${tokenCorrecto()}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/estado', (req, res) => res.json({ autenticado: autenticado(req) }));

app.get('/api/admin/datos', requiereAuth, (req, res) => res.json({
  galerias: publicarGalerias(store.getGalerias()),
  solicitudes: store.get().solicitudes,
  config: publicConfig()
}));

app.post('/api/admin/galerias', requiereAuth, async (req, res) => {
  try {
    const gal = await crearGaleria(req.body || {});
    res.json({ ok: true, galeria: gal });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.patch('/api/admin/galerias/:id', requiereAuth, async (req, res) => {
  const b = req.body || {};
  await cambiarDb(db => {
    const g = db.galerias.find(x => x.id === req.params.id);
    if (!g) return;
    if (b.cliente) g.cliente = { ...g.cliente, ...b.cliente };
    if (b.servicio !== undefined) g.servicio = b.servicio;
    if (b.fecha !== undefined) g.fecha = b.fecha;
    if (b.hora !== undefined) g.hora = b.hora;
    if (b.personas !== undefined) g.personas = b.personas;
  });
  res.json({ ok: true });
});

app.delete('/api/admin/galerias/:id', requiereAuth, async (req, res) => {
  const g = store.buscar(req.params.id);
  if (!g) return res.status(404).json({ error: 'No encontrada' });
  try { if (g.carpetaDrive) await drive.eliminar(g.carpetaDrive); } catch (e) {}
  await cambiarDb(db => { db.galerias = db.galerias.filter(x => x.id !== g.id); });
  res.json({ ok: true });
});

app.post('/api/admin/galerias/:id/archivos', requiereAuth, upload.array('archivos', 300), async (req, res) => {
  const gal = store.buscar(req.params.id);
  if (!gal) return res.status(404).json({ error: 'Galería no encontrada' });

  const usados = new Set((gal.archivos || []).map(a => a.nombre.toLowerCase()));
  const subidos = [];
  const errores = [];

  for (const f of req.files || []) {
    try {
      subidos.push(await procesarArchivo(gal, f, usados));
    } catch (e) {
      console.error('Error subiendo', f.originalname, ':', e.message);
      errores.push({ nombre: f.originalname, error: e.message });
    } finally {
      fs.unlink(f.path, () => {});
    }
  }

  if (subidos.length) {
    await cambiarDb(db => {
      const g = db.galerias.find(x => x.id === gal.id);
      if (g) g.archivos = (g.archivos || []).concat(subidos);
    });
  }
  res.json({ ok: true, subidos: subidos.length, errores });
});

app.delete('/api/admin/galerias/:id/archivo/:fileId', requiereAuth, async (req, res) => {
  const r = store.archivo(req.params.id, req.params.fileId);
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  try {
    await drive.eliminar(r.archivo.id);
    if (r.archivo.thumb) await drive.eliminar(r.archivo.thumb);
  } catch (e) {}
  await cambiarDb(db => {
    const g = db.galerias.find(x => x.id === req.params.id);
    if (g) g.archivos = (g.archivos || []).filter(a => a.id !== req.params.fileId);
  });
  res.json({ ok: true });
});

app.patch('/api/admin/solicitudes/:id', requiereAuth, async (req, res) => {
  await cambiarDb(db => {
    const r = db.solicitudes.find(x => x.id === req.params.id);
    if (r) r.atendido = !!req.body?.atendido;
  });
  res.json({ ok: true });
});

app.delete('/api/admin/solicitudes/:id', requiereAuth, async (req, res) => {
  await cambiarDb(db => { db.solicitudes = db.solicitudes.filter(x => x.id !== req.params.id); });
  res.json({ ok: true });
});

/* ---------------- creación de galerías ---------------- */

// Carpeta en Drive: "2026-11-07 10-30 · Cueva de la Vaca · Juan Pérez"
function nombreCarpeta(g) {
  const hora = (g.hora || '').replace(':', '-');
  return [g.fecha, hora].filter(Boolean).join(' ') +
    (g.servicio ? ' · ' + g.servicio : '') +
    ' · ' + g.cliente.nombre;
}

async function crearGaleria(body) {
  const nombre = ((body.cliente || {}).nombre || '').trim();
  if (!nombre) throw new Error('El nombre del cliente es obligatorio');

  const db = store.get();
  const base = slugify(nombre);
  let id, code;
  do { id = base + '-' + alAzar(4, 'abcdefghjkmnpqrstuvwxyz23456789'); } while (db.galerias.some(g => g.id === id));
  do { code = alAzar(6, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'); } while (db.galerias.some(g => g.code === code));

  const local = store.getLocal();
  const gal = {
    id, code,
    cliente: { nombre, celular: ((body.cliente || {}).celular || '').trim() },
    servicio: (body.servicio || '').trim(),
    fecha: (body.fecha || '').trim(),
    hora: (body.hora || '').trim(),
    personas: (body.personas || '').trim(),
    notas: (body.notas || '').trim(),
    archivos: [],
    creadoEn: new Date().toISOString()
  };

  gal.carpetaDrive = await drive.crearCarpeta(nombreCarpeta(gal), local.rootFolderId);
  gal.carpetaThumbs = await drive.crearCarpeta('miniaturas', gal.carpetaDrive);

  await cambiarDb(db2 => db2.galerias.push(gal));
  return { id: gal.id, code: gal.code, cliente: gal.cliente, carpeta: nombreCarpeta(gal) };
}

/* ---------------- páginas ---------------- */

app.get('/galeria', (req, res) => res.redirect('/'));
app.get('/galeria/:code', (req, res) => res.sendFile(path.join(PUBLIC, 'galeria.html')));
app.get('/privacidad', (req, res) => res.sendFile(path.join(PUBLIC, 'privacidad.html')));
app.get('/terminos', (req, res) => res.sendFile(path.join(PUBLIC, 'terminos.html')));

/* ---------------- errores y arranque ---------------- */

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Un archivo es demasiado grande (máximo 2 GB). Súbelo aparte.'
      : 'Error al recibir los archivos: ' + err.code;
    return res.status(400).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🏔 ${config.marca} corriendo en http://localhost:${PORT}`);
  console.log(`   Panel de administración: http://localhost:${PORT}/admin`);
});
server.requestTimeout = 0;
server.headersTimeout = 120000;
server.keepAliveTimeout = 300000;
