// Panel de administración
let autenticado = false;
let datos = { galerias: [], reservas: [], config: {} };

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const enlaceGaleria = id => `${location.origin}/galeria/${id}`;

async function init() {
  const r = await fetch('/api/admin/estado').then(r => r.json());
  autenticado = r.autenticado;
  mostrarVistas();
  if (autenticado) {
    await cargarDatos();
    await estadoDrive();
    const params = new URLSearchParams(location.search);
    if (params.get('drive') === 'ok') toast('Google Drive conectado ✔ Ya puedes subir fotos');
    if (params.get('drive') === 'error') toast('No se pudo conectar Google Drive. Inténtalo de nuevo.', false);
    if (location.search) history.replaceState(null, '', location.pathname);
  }
}

async function estadoDrive() {
  try {
    const e = await fetch('/api/estado').then(r => r.json());
    const banner = $('#banner-drive');
    if (e.drive === 'conectado') banner.classList.add('oculto');
    else banner.classList.remove('oculto');
  } catch (e) { /* sin conexión */ }
}

$('#btn-conectar-drive').addEventListener('click', async () => {
  const r = await fetch('/api/drive/url').then(r => r.json());
  if (r.error) { toast(r.error, false); return; }
  window.location.href = r.url;
});

function mostrarVistas() {
  $('#vista-login').classList.toggle('oculto', autenticado);
  $('#vista-panel').classList.toggle('oculto', !autenticado);
}

async function cargarDatos() {
  const r = await fetch('/api/admin/datos');
  if (r.status === 401) { autenticado = false; mostrarVistas(); return; }
  datos = await r.json();
  $('#marca').textContent = datos.config.marca;
  const nuevas = datos.reservas.filter(x => !x.atendido).length;
  $('#contador-reservas').textContent = nuevas;
  renderPaquetes();
  renderGalerias();
  renderReservas();
}

function renderPaquetes() {
  const sel = $('#n-paquete');
  sel.innerHTML = '<option value="">Sin paquete</option>';
  datos.config.paquetes.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.nombre;
    opt.textContent = `${p.nombre} · ${formatoPrecio(p.precio)}`;
    opt.dataset.precio = p.precio;
    sel.appendChild(opt);
  });
}

function renderGalerias() {
  const cont = $('#lista-galerias');
  cont.innerHTML = '';
  if (!datos.galerias.length) {
    cont.innerHTML = '<p class="vacio">Aún no hay galerías. Crea la primera con el botón <strong>➕ Nueva galería</strong>.</p>';
    return;
  }
  [...datos.galerias].reverse().forEach(g => cont.appendChild(tarjetaGaleria(g)));
}

function tarjetaGaleria(g) {
  const el = document.createElement('article');
  el.className = 'galeria tarjeta';
  el.dataset.id = g.id;

  const fHtml = (g.archivos || []).map(a => `
    <div class="archivo">
      ${a.tipo === 'foto'
        ? `<img loading="lazy" src="/api/thumb/${g.id}/${a.id}" alt="">`
        : '<div class="archivo-video">🎬</div>'}
      <div class="archivo-info">
        <span class="archivo-nombre" title="${esc(a.nombre)}">${esc(a.nombre)}</span>
        <span class="archivo-size">${tamano(a.size)}</span>
      </div>
      <button class="archivo-borrar" data-accion="archivo-borrar" data-archivo="${a.id}" title="Eliminar archivo">✕</button>
    </div>`).join('');

  const meta = [
    g.evento?.tipo, g.evento?.fecha && fechaBonita(g.evento.fecha), g.evento?.hora,
    g.paquete, g.precio ? formatoPrecio(g.precio) : '', `${g.totalArchivos} archivos`
  ].filter(Boolean).join(' · ');

  el.innerHTML = `
    <div class="galeria-titulo">
      <h3>${esc(g.cliente.nombre)}</h3>
      <button class="chip-codigo" data-accion="copiar-codigo" title="Copiar código">${g.code}</button>
      <span class="chip ${g.estado === 'pagado' ? 'chip-ok' : 'chip-espera'}">${g.estado === 'pagado' ? '✅ Pagada' : '⏳ Pendiente'}</span>
    </div>
    ${meta ? `<div class="galeria-meta">${esc(meta)}</div>` : ''}
    <label class="galeria-estado">Estado
      <select class="estado-galeria">
        <option value="pendiente" ${g.estado === 'pendiente' ? 'selected' : ''}>⏳ Pendiente de pago</option>
        <option value="pagado" ${g.estado === 'pagado' ? 'selected' : ''}>✅ Pagado (descargas activas)</option>
      </select>
    </label>
    <div class="galeria-acciones">
      <button class="btn btn-chico" data-accion="copiar-link">🔗 Copiar link</button>
      <button class="btn btn-chico btn-fantasma" data-accion="wa">💬 Enviar a cliente</button>
      <button class="btn btn-chico btn-fantasma" data-accion="ver">👁 Ver galería</button>
      <label class="btn btn-chico btn-subir">📤 Subir fotos/videos<input type="file" hidden multiple accept="image/*,video/*"></label>
      <button class="btn btn-chico btn-peligro" data-accion="borrar">🗑 Eliminar</button>
    </div>
    <div class="progreso oculto"><div class="progreso-barra"></div><span class="progreso-texto">0%</span></div>
    <div class="archivos">${fHtml}</div>`;

  return el;
}

function renderReservas() {
  const cont = $('#lista-reservas');
  cont.innerHTML = '';
  if (!datos.reservas.length) {
    cont.innerHTML = '<p class="vacio">No hay reservas todavía. Las reservas que hagan los clientes en la página aparecen aquí.</p>';
    return;
  }
  [...datos.reservas].reverse().forEach(r => {
    const el = document.createElement('article');
    el.className = 'reserva tarjeta';
    el.dataset.id = r.id;
    const meta = [r.tipoEvento, r.fecha && fechaBonita(r.fecha), r.hora, r.lugar, r.paquete, r.celular]
      .filter(Boolean).join(' · ');
    el.innerHTML = `
      <div class="reserva-titulo">
        <h3>${esc(r.nombre)}</h3>
        <span class="chip ${r.atendido ? 'chip-ok' : 'chip-espera'}">${r.atendido ? '✓ Atendida' : 'Nueva'}</span>
      </div>
      ${meta ? `<div class="galeria-meta">${esc(meta)}</div>` : ''}
      ${r.notas ? `<p class="reserva-notas">📝 ${esc(r.notas)}</p>` : ''}
      <div class="galeria-acciones">
        <button class="btn btn-chico btn-fantasma" data-accion="reserva-wa">💬 Responder</button>
        <button class="btn btn-chico" data-accion="reserva-atender">${r.atendido ? '↩ Marcar pendiente' : '✓ Marcar atendida'}</button>
      </div>`;
    cont.appendChild(el);
  });
}

/* ---------- acciones por delegación ---------- */

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-accion]');
  if (!t) return;
  const accion = t.dataset.accion;
  const card = t.closest('.galeria');
  const id = card?.dataset.id;

  if (accion === 'copiar-link' && id) return copiar(enlaceGaleria(id), 'Link copiado ✔');
  if (accion === 'copiar-codigo' && id) {
    const g = datos.galerias.find(x => x.id === id);
    return copiar(g?.code || '', 'Código copiado ✔');
  }
  if (accion === 'ver' && id) return window.open(enlaceGaleria(id), '_blank');
  if (accion === 'wa' && id) {
    const g = datos.galerias.find(x => x.id === id);
    const msg = encodeURIComponent(
      `Hola ${g.cliente.nombre}! 🎉 Tu galería ya está lista.\n\n` +
      `Mírala aquí: ${enlaceGaleria(id)}\n\n` +
      `💛 Paga por Nequi al ${formatearNumero(datos.config.nequiNumero)} (${datos.config.nequiTitular}) ` +
      `y se desbloquean los videos y la descarga completa. 😉`
    );
    window.open('https://wa.me/' + telWa(g.cliente.celular) + '?text=' + msg, '_blank');
  }
  if (accion === 'borrar' && id) {
    if (!confirm('¿Eliminar esta galería y TODOS sus archivos? Esta acción no se puede deshacer.')) return;
    await fetch('/api/admin/galerias/' + id, { method: 'DELETE' });
    toast('Galería eliminada');
    cargarDatos();
  }
  if (accion === 'archivo-borrar' && id) {
    const fid = t.dataset.archivo;
    if (!confirm('¿Eliminar este archivo?')) return;
    await fetch(`/api/admin/galerias/${id}/archivo/${fid}`, { method: 'DELETE' });
    toast('Archivo eliminado');
    cargarDatos();
  }
  if (accion === 'reserva-wa') {
    const r = datos.reservas.find(x => x.id === t.closest('.reserva')?.dataset.id);
    if (!r) return;
    const msg = encodeURIComponent(`Hola ${r.nombre}! 👋 Gracias por tu reserva.\n`);
    window.open('https://wa.me/' + telWa(r.celular) + '?text=' + msg, '_blank');
  }
  if (accion === 'reserva-atender') {
    const rid = t.closest('.reserva')?.dataset.id;
    const r = datos.reservas.find(x => x.id === rid);
    if (!r) return;
    await fetch('/api/admin/reservas/' + rid, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atendido: !r.atendido })
    });
    cargarDatos();
  }
});

document.addEventListener('change', async e => {
  const sel = e.target;

  if (sel.matches('.estado-galeria')) {
    const id = sel.closest('.galeria')?.dataset.id;
    await fetch('/api/admin/galerias/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: sel.value })
    });
    toast(sel.value === 'pagado'
      ? 'Galería marcada como PAGADA ✅ El cliente ya puede descargar todo'
      : 'Galería pendiente de pago ⏳ Descargas bloqueadas');
    cargarDatos();
  }

  if (sel.matches('input[type="file"]')) {
    const id = sel.closest('.galeria')?.dataset.id;
    if (sel.files && sel.files.length) {
      await subirArchivos(id, sel.files);
      sel.value = '';
    }
  }
});

/* ---------- subida de archivos con progreso ---------- */

function subirArchivos(id, files) {
  return new Promise(resolve => {
    const card = document.querySelector(`.galeria[data-id="${id}"]`);
    const prog = card?.querySelector('.progreso');
    const barra = card?.querySelector('.progreso-barra');
    const texto = card?.querySelector('.progreso-texto');
    if (prog) prog.classList.remove('oculto');

    const fd = new FormData();
    for (const f of files) fd.append('archivos', f);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && barra) {
        const p = Math.round((e.loaded / e.total) * 100);
        barra.style.width = p + '%';
        if (texto) texto.textContent = p + '%';
      }
    };
    xhr.onload = () => {
      if (prog) prog.classList.add('oculto');
      let j = {};
      try { j = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status === 200 && j.ok) {
        const errores = (j.errores || []).length;
        toast(`✔ ${j.subidos} archivos subidos${errores ? ' · ' + errores + ' fallaron' : ''}`);
      } else {
        toast(j.error || 'Error al subir los archivos', false);
      }
      cargarDatos();
      resolve();
    };
    xhr.onerror = () => {
      if (prog) prog.classList.add('oculto');
      toast('Error de conexión al subir. Inténtalo de nuevo.', false);
      cargarDatos();
      resolve();
    };
    xhr.open('POST', '/api/admin/galerias/' + id + '/archivos');
    xhr.send(fd);
  });
}

/* ---------- login / logout ---------- */

$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await fetch('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: $('#login-password').value })
  });
  const j = await r.json();
  if (!r.ok) { toast(j.error || 'Contraseña incorrecta', false); return; }
  autenticado = true;
  mostrarVistas();
  cargarDatos();
});

$('#btn-salir').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
});

/* ---------- nueva galería ---------- */

$('#btn-nueva').addEventListener('click', () => {
  $('#form-nueva').classList.toggle('oculto');
  if (!$('#form-nueva').classList.contains('oculto')) $('#form-nueva').scrollIntoView({ behavior: 'smooth' });
});
$('#btn-cancelar-nueva').addEventListener('click', () => $('#form-nueva').classList.add('oculto'));

$('#n-paquete').addEventListener('change', e => {
  const opt = e.target.selectedOptions[0];
  if (opt?.dataset.precio) $('#n-precio').value = opt.dataset.precio;
});

$('#form-nueva-galeria').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    cliente: { nombre: f.get('nombre'), celular: f.get('celular') },
    evento: { tipo: f.get('tipo'), fecha: f.get('fecha'), hora: f.get('hora'), lugar: f.get('lugar') },
    paquete: f.get('paquete'), precio: f.get('precio'), estado: f.get('estado')
  };
  const r = await fetch('/api/admin/galerias', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) { toast(j.error || 'No se pudo crear', false); return; }
  toast('Galería creada 🎉 Ahora sube las fotos');
  e.target.reset();
  $('#form-nueva').classList.add('oculto');
  cargarDatos();
});

/* ---------- pestañas ---------- */

$$('.panel-tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.panel-tabs button').forEach(x => x.classList.toggle('activo', x === b));
  $('#lista-galerias').classList.toggle('oculto', b.dataset.tab !== 'galerias');
  $('#lista-reservas').classList.toggle('oculto', b.dataset.tab !== 'reservas');
}));

init();
