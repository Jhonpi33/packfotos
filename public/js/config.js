// Configuración compartida entre todas las páginas
window.CONFIG = null;

async function cargarConfig() {
  if (window.CONFIG) return window.CONFIG;
  const r = await fetch('/api/config');
  window.CONFIG = await r.json();
  return window.CONFIG;
}

function formatoPrecio(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
}

function formatearNumero(n) {
  return String(n || '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Convierte un celular colombiano a formato internacional para wa.me
function telWa(num) {
  let n = String(num || '').replace(/\D/g, '');
  if (n.length === 10 && n.startsWith('3')) n = '57' + n;
  return n;
}

function fechaBonita(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return iso; }
}

function tamano(b) {
  const n = Number(b) || 0;
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, ok = true) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'visible ' + (ok ? 'ok' : 'error');
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = ''; }, 3200);
}

async function copiar(texto, mensaje) {
  try {
    await navigator.clipboard.writeText(texto);
    toast(mensaje || 'Copiado ✔');
    return true;
  } catch (e) {
    toast('No se pudo copiar automáticamente', false);
    return false;
  }
}
