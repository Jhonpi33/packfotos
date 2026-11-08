// Conexión con Google Drive (la cuenta personal del fotógrafo, vía OAuth).
const { google } = require('googleapis');
const { Readable } = require('stream');

const DB_NAME = '_base-de-datos.json';
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

let oauth = null;
let drive = null;
let raizId = null;

function configurar() {
  const id = process.env.GOOGLE_CLIENT_ID || '';
  const secreto = process.env.GOOGLE_CLIENT_SECRET || '';
  if (!id || !secreto) {
    throw new Error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env (mira la sección 2 del README)');
  }
  if (!oauth) oauth = new google.auth.OAuth2(id, secreto);
}

function listo() { return !!drive; }

async function init(tokens) {
  configurar();
  if (!tokens || !tokens.refresh_token) {
    throw new Error('Google Drive aún no está conectado. En el panel toca "Conectar Google Drive".');
  }
  oauth.setCredentials(tokens);
  drive = google.drive({ version: 'v3', auth: oauth });
  // Verifica el acceso (el token de acceso se renueva solo cuando hace falta).
  await drive.files.list({ pageSize: 1, fields: 'files(id)' });
}

function urlAutorizar(redirectUri) {
  configurar();
  return oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    redirect_uri: redirectUri,
    state: 'packfotos'
  });
}

async function intercambiar(codigo, redirectUri) {
  configurar();
  const { tokens } = await oauth.getToken({ code: codigo, redirect_uri: redirectUri });
  return tokens;
}

function cliente() {
  if (!drive) throw new Error('Google Drive no está conectado');
  return drive;
}

function setRaiz(id) { raizId = id; }

async function buscarOCrearCarpetaRaiz(nombre) {
  const r = await cliente().files.list({
    q: `name='${nombre.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    pageSize: 5
  });
  if (r.data.files.length) return r.data.files[0].id;
  return crearCarpeta(nombre, null);
}

async function crearCarpeta(nombre, padre) {
  const r = await cliente().files.create({
    requestBody: {
      name: nombre,
      mimeType: 'application/vnd.google-apps.folder',
      parents: padre ? [padre] : []
    },
    fields: 'id'
  });
  return r.data.id;
}

async function subir({ carpeta, nombre, mimeType, origen }) {
  const r = await cliente().files.create({
    requestBody: { name: nombre, parents: [carpeta] },
    media: { mimeType, body: origen },
    fields: 'id,size'
  });
  return { id: r.data.id, size: r.data.size };
}

async function subirBuffer({ carpeta, nombre, mimeType, buffer }) {
  // googleapis arma el multipart con .pipe(), así que el cuerpo debe ser un stream
  // (con un Buffer falla con "part.body.pipe is not a function").
  const r = await cliente().files.create({
    requestBody: { name: nombre, parents: [carpeta] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id'
  });
  return { id: r.data.id };
}

async function stream(fileId, range) {
  const params = { fileId, alt: 'media' };
  const opts = { responseType: 'stream' };
  if (range) opts.headers = { Range: range };
  const r = await cliente().files.get(params, opts);
  return { data: r.data, headers: r.headers, status: r.status };
}

async function eliminar(fileId) {
  try { await cliente().files.delete({ fileId }); } catch (e) { /* ya no existe */ }
}

/* ---------- respaldo de la base de datos en Drive ---------- */

async function buscarDb() {
  if (!raizId) return null;
  const r = await cliente().files.list({
    q: `name='${DB_NAME}' and '${raizId}' in parents and trashed=false`,
    fields: 'files(id,modifiedTime)'
  });
  return r.data.files[0] || null;
}

async function guardarDb(id, json) {
  if (id) {
    await cliente().files.update({ fileId: id, media: { mimeType: 'application/json', body: json } });
    return id;
  }
  const existente = await buscarDb();
  if (existente) {
    await cliente().files.update({ fileId: existente.id, media: { mimeType: 'application/json', body: json } });
    return existente.id;
  }
  const creado = await cliente().files.create({
    requestBody: { name: DB_NAME, parents: [raizId] },
    media: { mimeType: 'application/json', body: json },
    fields: 'id'
  });
  return creado.data.id;
}

async function descargar(fileId) {
  const r = await cliente().files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  return r.data;
}

module.exports = {
  init, listo, urlAutorizar, intercambiar, setRaiz,
  buscarOCrearCarpetaRaiz, crearCarpeta, subir, subirBuffer,
  stream, eliminar, buscarDb, guardarDb, descargar
};
