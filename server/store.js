// Almacenamiento local de la base de datos (JSON) con respaldo automático en Drive.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const LOCAL_PATH = path.join(DATA_DIR, 'local.json');

let db = { galerias: [], reservas: [] };
let local = {};
let chain = Promise.resolve();

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch (e) { db = { galerias: [], reservas: [] }; }
  if (!Array.isArray(db.galerias)) db.galerias = [];
  if (!Array.isArray(db.reservas)) db.reservas = [];
  try { local = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')); } catch (e) { local = {}; }
}

function persist() {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function persistLocal() {
  const tmp = LOCAL_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(local, null, 2));
  fs.renameSync(tmp, LOCAL_PATH);
}

// Mutaciones serializadas para evitar escrituras simultáneas.
function mutate(fn) {
  chain = chain.then(() => { fn(db); persist(); }).catch(err => console.error('[store]', err));
  return chain;
}

function setLocal(patch) {
  local = { ...local, ...patch };
  persistLocal();
  return local;
}

function get() { return db; }
function getLocal() { return local; }

function buscar(codeOrId) {
  const q = String(codeOrId || '').trim().toLowerCase();
  return db.galerias.find(g => g.id.toLowerCase() === q || g.code.toLowerCase() === q) || null;
}

function archivo(codeOrId, fileId) {
  const gal = buscar(codeOrId);
  if (!gal) return null;
  const f = (gal.archivos || []).find(a => a.id === fileId);
  return f ? { gal, archivo: f } : null;
}

function getGalerias() { return db.galerias; }

module.exports = { load, mutate, setLocal, get, getLocal, buscar, archivo, getGalerias, DB_PATH };
