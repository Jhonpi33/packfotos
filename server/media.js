// Procesamiento de imágenes: miniaturas y conversión HEIC → JPG.
const sharp = require('sharp');

const MIMES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.3gp': 'video/3gpp'
};

function mimeDe(ext) {
  return MIMES[ext] || 'application/octet-stream';
}

// Miniatura JPG de máximo 720px (para que la galería cargue rápido).
async function miniatura(archivo) {
  return sharp(archivo, { failOn: 'error' })
    .rotate()
    .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}

// Las fotos HEIC del iPhone se convierten a JPG para que se vean en cualquier navegador.
async function convertirHeic(entrada, salida) {
  await sharp(entrada, { failOn: 'error' }).rotate().jpeg({ quality: 92 }).toFile(salida);
}

module.exports = { mimeDe, miniatura, convertirHeic };
