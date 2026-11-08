// Página de galería del cliente
const codigo = decodeURIComponent((location.pathname.split('/').filter(Boolean).pop() || '').trim());
let g = null;
let indice = 0;

const $ = sel => document.querySelector(sel);

function urlArchivo(a) { return `/api/archivo/${g.id}/${a.id}`; }
function urlThumb(a) { return `/api/thumb/${g.id}/${a.id}`; }

async function cargar() {
  try {
    const r = await fetch('/api/galeria/' + encodeURIComponent(codigo));
    if (!r.ok) throw new Error('no');
    g = await r.json();
    render();
  } catch (e) {
    $('#no-encontrada').classList.remove('oculto');
    $('#galeria').classList.add('oculto');
    cargarConfig().then(cfg => {
      $('#link-wa-noencontrada').href = 'https://wa.me/' + cfg.whatsapp +
        '?text=' + encodeURIComponent('Hola! No puedo abrir mi galería. 😕 Me llegó este link/código: ' + codigo);
    });
  }
}

function render() {
  const cfgPromise = cargarConfig().then(cfg => {
    document.title = `Galería de ${g.cliente.nombre} · ${cfg.marca}`;
    $('#marca').textContent = cfg.marca;
    $('#marca-pie').textContent = cfg.marca;
  });

  $('#nombre-cliente').textContent = g.cliente.nombre;

  // Chips de información
  const chips = [];
  if (g.evento?.tipo) chips.push('🎉 ' + g.evento.tipo);
  if (g.evento?.fecha) chips.push('📅 ' + fechaBonita(g.evento.fecha));
  if (g.evento?.hora) chips.push('🕐 ' + g.evento.hora);
  if (g.evento?.lugar) chips.push('📍 ' + g.evento.lugar);
  if (g.paquete) chips.push('📦 ' + g.paquete);
  chips.push('🖼 ' + g.totalArchivos + (g.totalArchivos === 1 ? ' archivo' : ' archivos'));
  $('#galeria-meta').innerHTML = chips.map(c => `<span class="chip">${esc(c)}</span>`).join('');

  // Estado
  const chip = $('#chip-estado');
  if (g.estado === 'pagado') {
    chip.className = 'chip chip-ok';
    chip.textContent = '✅ Pago confirmado';
  } else {
    chip.className = 'chip chip-espera';
    chip.textContent = '⏳ Pendiente de pago';
  }

  // Banner de pago
  if (g.estado !== 'pagado' && g.bloquearPendiente) {
    $('#banner-pago').classList.remove('oculto');
    $('#banner-monto').textContent = g.precio ? formatoPrecio(g.precio) : 'Tu paquete de fotos';
    $('#banner-nequi').textContent = formatearNumero(g.nequi.numero);
    $('#banner-titular').textContent = g.nequi.titular;
    $('#btn-copiar-nequi').addEventListener('click', () => copiar(g.nequi.numero, 'Número Nequi copiado ✔'));
    $('#btn-ya-pague').addEventListener('click', () => {
      const msg = encodeURIComponent(`Hola! Ya pagué mi galería por Nequi ✅\nCódigo: ${g.code}\nNombre: ${g.cliente.nombre}`);
      window.open('https://wa.me/' + g.whatsapp + '?text=' + msg, '_blank');
    });
    $('#btn-zip').classList.add('btn-fantasma');
    $('#btn-zip').innerHTML = '🔒 Descargar todo (paga para desbloquear)';
  } else {
    $('#banner-pago').classList.add('oculto');
  }

  // Grid
  const cont = $('#galeria');
  cont.innerHTML = '';
  if (!g.archivos.length) {
    $('#vacio').classList.remove('oculto');
    return;
  }
  g.archivos.forEach((a, i) => {
    if (a.tipo === 'foto') {
      const btn = document.createElement('button');
      btn.className = 'item';
      btn.innerHTML = `<img loading="lazy" src="${urlThumb(a)}" alt="${esc(a.nombre)}">`;
      btn.addEventListener('click', () => abrirVisor(i));
      cont.appendChild(btn);
    } else if (g.descargable) {
      const btn = document.createElement('button');
      btn.className = 'item';
      btn.innerHTML = `<video preload="metadata" muted playsinline src="${urlArchivo(a)}"></video><span class="play">▶</span>`;
      btn.addEventListener('click', () => abrirVisor(i));
      cont.appendChild(btn);
    } else {
      const div = document.createElement('div');
      div.className = 'item bloqueado';
      div.innerHTML = '<span class="candado">🔒</span><span class="play">▶</span>';
      cont.appendChild(div);
    }
  });

  cfgPromise.catch(() => {});
}

/* ---------- visor ---------- */
function abrirVisor(i) {
  indice = i;
  $('#visor').classList.remove('oculto');
  document.body.style.overflow = 'hidden';
  mostrar();
}

function mostrar() {
  const a = g.archivos[indice];
  if (!a) return;
  const medio = $('#visor-medio');
  medio.innerHTML = '';
  if (a.tipo === 'foto') {
    const img = document.createElement('img');
    img.src = urlArchivo(a);
    medio.appendChild(img);
  } else {
    const vid = document.createElement('video');
    vid.src = urlArchivo(a);
    vid.controls = true;
    vid.autoplay = true;
    vid.playsInline = true;
    medio.appendChild(vid);
  }
  $('#visor-info').textContent = `${indice + 1} / ${g.archivos.length} · ${a.nombre}`;
  $('#visor-descarga').href = urlArchivo(a);
  $('#visor-descarga').setAttribute('download', a.nombre);
}

function cerrarVisor() {
  $('#visor').classList.add('oculto');
  $('#visor-medio').innerHTML = '';
  document.body.style.overflow = '';
}

function navegar(dir) {
  indice = (indice + dir + g.archivos.length) % g.archivos.length;
  mostrar();
}

$('#visor-cerrar').addEventListener('click', cerrarVisor);
$('#visor-prev').addEventListener('click', () => navegar(-1));
$('#visor-next').addEventListener('click', () => navegar(1));
$('#visor').addEventListener('click', e => { if (e.target.id === 'visor') cerrarVisor(); });
document.addEventListener('keydown', e => {
  if ($('#visor').classList.contains('oculto')) return;
  if (e.key === 'Escape') cerrarVisor();
  if (e.key === 'ArrowLeft') navegar(-1);
  if (e.key === 'ArrowRight') navegar(1);
});

// Deslizar en el visor
let toqueX = null;
$('#visor').addEventListener('touchstart', e => { toqueX = e.touches[0].clientX; }, { passive: true });
$('#visor').addEventListener('touchend', e => {
  if (toqueX === null) return;
  const dx = e.changedTouches[0].clientX - toqueX;
  if (Math.abs(dx) > 50) navegar(dx < 0 ? 1 : -1);
  toqueX = null;
}, { passive: true });

/* ---------- descargar todo ---------- */
$('#btn-zip').addEventListener('click', () => {
  if (!g) return;
  if (!g.descargable) {
    toast('Esta galería está pendiente de pago 💛 Paga por Nequi para desbloquear la descarga', false);
    $('#banner-pago').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (!g.archivos.length) { toast('La galería está vacía', false); return; }
  $('#overlay-zip').classList.remove('oculto');
  // El navegador recibe el ZIP como descarga directa.
  window.location.href = '/api/zip/' + encodeURIComponent(g.id);
  setTimeout(() => $('#overlay-zip').classList.add('oculto'), 9000);
});

/* ---------- compartir ---------- */
$('#btn-compartir').addEventListener('click', async () => {
  if (!g) return;
  const datos = { title: `Galería de ${g.cliente.nombre}`, text: 'Tus fotos y videos están listos 📸', url: location.href };
  if (navigator.share) {
    try { await navigator.share(datos); return; } catch (e) { /* cancelado */ }
  }
  copiar(location.href, 'Link copiado ✔ Compártelo con quien quieras');
});

cargar();
