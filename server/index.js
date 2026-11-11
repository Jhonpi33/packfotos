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
  whatsapp: '', nequiNumero: '', nequiTitular: '',
  diasVigencia: 3, servicios: []
};
try {
  config = { ...config, ...JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')) };
} catch (e) {
  console.error('⚠ No se pudo leer config.json, usando valores por defecto.');
}

let timerLimpieza = null;

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
  whatsapp: config.whatsapp, nequiNumero: config.nequiNumero, nequiTitular: config.nequiTitular,
  diasVigencia: config.diasVigencia || 3, servicios: config.servicios
});

// Precio por persona del servicio (si es fijo) o null (si varía).
function precioPorPersona(servicio) {
  const s = (config.servicios || []).find(x => x.nombre === servicio);
  return s && s.precioPorPersona ? s.precioPorPersona : null;
}

const publicarGalerias = gals => gals.map(g => ({
  id: g.id, code: g.code, cliente: g.cliente, servicio: g.servicio,
  fecha: g.fecha, hora: g.hora, personas: g.personas, notas: g.notas,
  precio: g.precio, estado: g.estado || 'pendiente', formaPago: g.formaPago,
  comprobante: !!g.comprobanteId, comprobanteEn: g.comprobanteEn,
  pagadoEn: g.pagadoEn, fotosEn: g.fotosEn, creadoEn: g.creadoEn,
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

/* ---------------- caducidad de las fotos (3 días) ---------------- */

function expiraEn(gal) {
  const base = gal.fotosEn || ((gal.archivos || []).length ? gal.creadoEn : null);
  if (!base) return null;
  return new Date(new Date(base).getTime() + (config.diasVigencia || 3) * 24 * 3600 * 1000);
}

async function limpiarExpiradas() {
  if (!drive.listo()) return;
  try {
    const ahora = Date.now();
    const expiradas = store.get().galerias.filter(g => {
      const e = expiraEn(g);
      return (g.archivos || []).length > 0 && e && e.getTime() < ahora;
    });
    for (const g of expiradas) {
      try { if (g.carpetaDrive) await drive.eliminar(g.carpetaDrive); } catch (e) {}
      await cambiarDb(db => { db.galerias = db.galerias.filter(x => x.id !== g.id); });
      console.log('🗑 Eliminada galería expirada:', g.code, g.cliente?.nombre);
    }
  } catch (e) {
    console.error('Error al limpiar galerías expiradas:', e.message);
  }
}

/* ---------------- subida de archivos ---------------- */

const storage = multer.diskStorage({
    destination: TMP,
    filename: (req, file, cb) => cb(null,
      Date.now() + '-' + alAzar(6, 'abcdefghjkmnpqrstuvwxyz23456789') +
      path.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '').slice(0, 10))
  });
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2 GB por archivo
});
const uploadComprobante = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

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
    formaPago: (b.formaPago || '').trim(),
    atendido: false, creadoEn: new Date().toISOString()
  };
  await cambiarDb(db => db.solicitudes.push(solicitud));
  res.json({ ok: true });
});

app.get('/api/galeria/:code', async (req, res) => {
  await limpiarExpiradas();
  const g = store.buscar(req.params.code);
  if (!g) return res.status(404).json({ error: 'Galería no encontrada' });
  const pagado = g.estado === 'pagado';
  const vigencia = expiraEn(g);
  res.json({
    id: g.id, code: g.code, cliente: g.cliente,
    servicio: g.servicio, fecha: g.fecha, hora: g.hora, personas: g.personas,
    precio: g.precio, estado: g.estado, formaPago: g.formaPago,
    comprobanteEnviado: !!g.comprobanteId,
    desbloqueada: pagado,
    totalArchivos: (g.archivos || []).length,
    archivos: pagado ? (g.archivos || []).map(a => ({ id: a.id, nombre: a.nombre, tipo: a.tipo, size: a.size, thumb: a.thumb })) : [],
    expira: vigencia ? vigencia.toISOString() : null,
    nequi: { numero: config.nequiNumero, titular: config.nequiTitular },
    whatsapp: config.whatsapp,
    diasVigencia: config.diasVigencia || 3
  });
});

// El cliente sube la foto del comprobante de pago (Nequi).
app.post('/api/comprobante/:code', uploadComprobante.single('comprobante'), async (req, res) => {
  const g = store.buscar(req.params.code);
  if (!g) return res.status(404).json({ error: 'Galería no encontrada' });
  if (!req.file) return res.status(400).json({ error: 'Falta la foto del comprobante' });
  if (!req.file.mimetype.startsWith('image/')) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'El comprobante debe ser una imagen' });
  }

  try {
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const mime = media.mimeDe(ext) || 'image/jpeg';
    const subido = await drive.subir({
      carpeta: g.carpetaDrive, nombre: 'comprobante' + ext, mimeType: mime,
      origen: fs.createReadStream(req.file.path)
    });
    if (g.comprobanteId) await drive.eliminar(g.comprobanteId);
    await cambiarDb(db => {
      const x = db.galerias.find(gg => gg.id === g.id);
      if (x) { x.comprobanteId = subido.id; x.comprobanteEn = new Date().toISOString(); }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo subir el comprobante: ' + e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.get('/api/thumb/:code/:fileId', async (req, res) => {
  const r = store.archivo(req.params.code, req.params.fileId);
  if (!r || !r.archivo.thumb) return res.status(404).send('Sin miniatura');
  if (r.gal.estado !== 'pagado') return res.status(402).send('El pago aún no está confirmado');
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
  if (r.gal.estado !== 'pagado') return res.status(402).send('El pago aún no está confirmado');
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
  if (g.estado !== 'pagado') return res.status(402).send('El pago aún no está confirmado');
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
    await limpiarExpiradas();
    activarLimpieza();
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
  const seguro = req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `token=${tokenCorrecto()}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${seguro}`);
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
    if (req.body?.precio !== undefined && req.body.precio !== '' &&
        (!Number.isFinite(Number(req.body.precio)) || Number(req.body.precio) < 0)) {
      return res.status(400).json({ error: 'El precio debe ser un valor positivo' });
    }
    const gal = await crearGaleria(req.body || {});
    res.json({ ok: true, galeria: gal });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.patch('/api/admin/galerias/:id', requiereAuth, async (req, res) => {
  const b = req.body || {};
  if (!store.buscar(req.params.id)) return res.status(404).json({ error: 'Galería no encontrada' });
  if (b.estado !== undefined && !['pagado', 'pendiente'].includes(b.estado)) {
    return res.status(400).json({ error: 'Estado de pago inválido' });
  }
  if (b.precio !== undefined && (!Number.isFinite(Number(b.precio)) || Number(b.precio) < 0)) {
    return res.status(400).json({ error: 'El precio debe ser un valor positivo' });
  }
  await cambiarDb(db => {
    const g = db.galerias.find(x => x.id === req.params.id);
    if (!g) return;
    if (b.cliente) g.cliente = { ...g.cliente, ...b.cliente };
    if (b.servicio !== undefined) g.servicio = b.servicio;
    if (b.fecha !== undefined) g.fecha = b.fecha;
    if (b.hora !== undefined) g.hora = b.hora;
    if (b.personas !== undefined) g.personas = b.personas;
    if (b.precio !== undefined) g.precio = Number(b.precio) || 0;
    if (b.formaPago !== undefined) g.formaPago = b.formaPago;
    if (b.estado === 'pagado' && g.estado !== 'pagado') {
      g.estado = 'pagado';
      g.pagadoEn = g.pagadoEn || new Date().toISOString();
    }
    if (b.estado === 'pendiente') { g.estado = 'pendiente'; g.pagadoEn = null; }
  });
  res.json({ ok: true });
});

// Ver la foto del comprobante (solo administrador).
app.get('/api/admin/comprobante/:id', requiereAuth, async (req, res) => {
  const g = store.buscar(req.params.id);
  if (!g || !g.comprobanteId) return res.status(404).send('Sin comprobante');
  try {
    const d = await drive.stream(g.comprobanteId);
    res.status(d.status || 200);
    res.setHeader('content-type', d.headers['content-type'] || 'image/jpeg');
    d.data.on('error', () => res.destroy());
    d.data.pipe(res);
  } catch (e) {
    res.status(404).send('No disponible');
  }
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
      if (g) {
        g.archivos = (g.archivos || []).concat(subidos);
        g.fotosEn = g.fotosEn || new Date().toISOString();
      }
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
    formaPago: (body.formaPago || '').trim(),
    precio: body.precio !== undefined && body.precio !== ''
      ? Math.max(0, Number(body.precio) || 0)
      : (precioPorPersona((body.servicio || '').trim()) || 0) * (Number(body.personas) || 0),
    estado: 'pendiente',
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
async function iniciar() {
  try {
    const tokens = store.getLocal().driveTokens ||
      (process.env.GOOGLE_REFRESH_TOKEN ? { refresh_token: process.env.GOOGLE_REFRESH_TOKEN } : null);
    await drive.init(tokens);
    await prepararDrive();
    await limpiarExpiradas();
    activarLimpieza();
  } catch (e) {
    console.error('⚠ Google Drive:', e.message);
    console.error('  Ve al panel (/admin) y toca "Conectar Google Drive".');
  }

  const server = app.listen(PORT, () => {
    console.log(`🏔 ${config.marca} corriendo en http://localhost:${PORT}`);
    console.log(`   Panel de administración: http://localhost:${PORT}/admin`);
  });
  server.requestTimeout = 0;
  server.headersTimeout = 120000;
  server.keepAliveTimeout = 300000;
}

function activarLimpieza() {
  if (!timerLimpieza) timerLimpieza = setInterval(limpiarExpiradas, 10 * 60 * 1000);
}

iniciar();
