// Panel de administración — Guaití
let autenticado = false;
let datos = { galerias: [], solicitudes: [], config: {} };

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
  const nuevas = datos.solicitudes.filter(x => !x.atendido).length;
  $('#contador-solicitudes').textContent = nuevas;
  renderServicios();
  renderGalerias();
  renderSolicitudes();
}

function renderServicios() {
  const sel = $('#n-servicio');
  sel.innerHTML = '<option value="">Elige uno…</option>';
  datos.config.servicios.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.nombre;
    opt.textContent = (s.icono ? s.icono + ' ' : '') + s.nombre;
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
    g.servicio, g.fecha && fechaBonita(g.fecha), g.hora,
    g.personas ? g.personas + ' pers.' : '',
    g.totalFotos ? g.totalFotos + ' fotos' : '',
    g.totalVideos ? g.totalVideos + ' videos' : '',
    g.totalArchivos === 0 ? 'sin archivos aún' : ''
  ].filter(Boolean).join(' · ');

  el.innerHTML = `
    <div class="galeria-titulo">
      <h3>${esc(g.cliente.nombre)}</h3>
      <button class="chip-codigo" data-accion="copiar-codigo" title="Copiar código">${g.code}</button>
    </div>
    ${meta ? `<div class="galeria-meta">${esc(meta)}</div>` : ''}
    <div class="galeria-estado">
      <label>Pago:</label>
      <select data-campo="estado">
        <option value="pendiente" ${(g.estado || 'pendiente') === 'pendiente' ? 'selected' : ''}>Pendiente</option>
        <option value="pagado" ${g.estado === 'pagado' ? 'selected' : ''}>Confirmado</option>
      </select>
      <label>Valor COP:</label>
      <input data-campo="precio" type="number" min="0" step="1000" value="${Number(g.precio) || 0}" style="width:120px">
      ${g.comprobante ? `<a class="btn btn-chico btn-fantasma" href="/api/admin/comprobante/${encodeURIComponent(g.id)}" target="_blank" rel="noopener">Ver comprobante</a>` : '<span>Sin comprobante</span>'}
      <button class="btn btn-chico" data-accion="guardar-pago">Guardar</button>
    </div>
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

function renderSolicitudes() {
  const cont = $('#lista-solicitudes');
  cont.innerHTML = '';
  if (!datos.solicitudes.length) {
    cont.innerHTML = '<p class="vacio">Aún no hay solicitudes. Cuando un cliente llene el formulario de la página, aparece aquí con sus datos.</p>';
    return;
  }
  [...datos.solicitudes].reverse().forEach(s => {
    const el = document.createElement('article');
    el.className = 'solicitud tarjeta';
    el.dataset.id = s.id;
    const meta = [s.servicio, s.fecha && fechaBonita(s.fecha), s.hora, s.personas ? s.personas + ' pers.' : '', s.celular]
      .filter(Boolean).join(' · ');
    el.innerHTML = `
      <div class="reserva-titulo">
        <h3>${esc(s.nombre)}</h3>
        <span class="chip ${s.atendido ? 'chip-ok' : 'chip-espera'}">${s.atendido ? '✓ Atendida' : 'Nueva'}</span>
      </div>
      ${meta ? `<div class="galeria-meta">${esc(meta)}</div>` : ''}
      ${s.notas ? `<p class="reserva-notas">📝 ${esc(s.notas)}</p>` : ''}
      <div class="galeria-acciones">
        <button class="btn btn-chico" data-accion="solicitud-crear">➕ Crear galería</button>
        <button class="btn btn-chico btn-fantasma" data-accion="solicitud-wa">💬 Responder</button>
        <button class="btn btn-chico btn-fantasma" data-accion="solicitud-atender">${s.atendido ? '↩ Pendiente' : '✓ Atendida'}</button>
        <button class="btn btn-chico btn-peligro" data-accion="solicitud-borrar">🗑</button>
      </div>`;
    cont.appendChild(el);
  });
}

/* ---------- acciones por delegación ---------- */

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-accion]');
  if (!t) return;
  const accion = t.dataset.accion;

  if (accion === 'copiar-link') {
    const id = t.closest('.galeria')?.dataset.id;
    return copiar(enlaceGaleria(id), 'Link copiado ✔');
  }
  if (accion === 'copiar-codigo') {
    const id = t.closest('.galeria')?.dataset.id;
    const g = datos.galerias.find(x => x.id === id);
    return copiar(g?.code || '', 'Código copiado ✔');
  }
  if (accion === 'ver') {
    const id = t.closest('.galeria')?.dataset.id;
    return window.open(enlaceGaleria(id), '_blank');
  }
  if (accion === 'guardar-pago') {
    const card = t.closest('.galeria');
    const id = card?.dataset.id;
    const precio = card?.querySelector('[data-campo="precio"]')?.value;
    const estado = card?.querySelector('[data-campo="estado"]')?.value;
    const r = await fetch('/api/admin/galerias/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precio, estado })
    });
    const j = await r.json();
    if (!r.ok) { toast(j.error || 'No se pudo guardar el pago', false); return; }
    toast(estado === 'pagado' ? 'Pago confirmado; fotos habilitadas ✔' : 'Pago actualizado ✔');
    cargarDatos();
    return;
  }
  if (accion === 'wa') {
    const id = t.closest('.galeria')?.dataset.id;
    const g = datos.galerias.find(x => x.id === id);
    const msg = encodeURIComponent(
      `Hola ${g.cliente.nombre}! 🎉 Tus fotos de Guaití ya están listas.\n\n` +
      `Míralas aquí: ${enlaceGaleria(id)}\n\n` +
      `Puedes verlas y descargarlas todas. ¡Disfrútalas! 🏔️`
    );
    window.open('https://wa.me/' + telWa(g.cliente.celular) + '?text=' + msg, '_blank');
  }
  if (accion === 'borrar') {
    const id = t.closest('.galeria')?.dataset.id;
    if (!confirm('¿Eliminar esta galería y TODOS sus archivos? Esta acción no se puede deshacer.')) return;
    await fetch('/api/admin/galerias/' + id, { method: 'DELETE' });
    toast('Galería eliminada');
    cargarDatos();
  }
  if (accion === 'archivo-borrar') {
    const id = t.closest('.galeria')?.dataset.id;
    const fid = t.dataset.archivo;
    if (!confirm('¿Eliminar este archivo?')) return;
    await fetch(`/api/admin/galerias/${id}/archivo/${fid}`, { method: 'DELETE' });
    toast('Archivo eliminado');
    cargarDatos();
  }

  // Solicitudes
  if (accion === 'solicitud-crear') {
    const s = datos.solicitudes.find(x => x.id === t.closest('.solicitud')?.dataset.id);
    if (!s) return;
    prefillNueva(s);
    switchTab('galerias');
    $('#form-nueva').classList.remove('oculto');
    $('#form-nueva').scrollIntoView({ behavior: 'smooth' });
  }
  if (accion === 'solicitud-wa') {
    const s = datos.solicitudes.find(x => x.id === t.closest('.solicitud')?.dataset.id);
    if (!s) return;
    const msg = encodeURIComponent(`Hola ${s.nombre}! 👋 Gracias por dejarnos tus datos.\n`);
    window.open('https://wa.me/' + telWa(s.celular) + '?text=' + msg, '_blank');
  }
  if (accion === 'solicitud-atender') {
    const s = datos.solicitudes.find(x => x.id === t.closest('.solicitud')?.dataset.id);
    if (!s) return;
    await fetch('/api/admin/solicitudes/' + s.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atendido: !s.atendido })
    });
    cargarDatos();
  }
  if (accion === 'solicitud-borrar') {
    const s = datos.solicitudes.find(x => x.id === t.closest('.solicitud')?.dataset.id);
    if (!s) return;
    if (!confirm('¿Eliminar esta solicitud?')) return;
    await fetch('/api/admin/solicitudes/' + s.id, { method: 'DELETE' });
    toast('Solicitud eliminada');
    cargarDatos();
  }
});

// Rellena el formulario de nueva galería con los datos de una solicitud
function prefillNueva(s) {
  const f = $('#form-nueva-galeria');
  f.elements.nombre.value = s.nombre || '';
  f.elements.celular.value = s.celular || '';
  f.elements.servicio.value = s.servicio || '';
  f.elements.fecha.value = s.fecha || '';
  f.elements.hora.value = s.hora || '';
  f.elements.personas.value = s.personas || '';
  f.elements.notas.value = s.notas || '';
}

document.addEventListener('change', e => {
  const sel = e.target;
  if (sel.matches('input[type="file"]')) {
    const id = sel.closest('.galeria')?.dataset.id;
    if (sel.files && sel.files.length) {
      subirArchivos(id, sel.files).then(() => { sel.value = ''; });
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

$('#form-nueva-galeria').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    cliente: { nombre: f.get('nombre'), celular: f.get('celular') },
    servicio: f.get('servicio'), fecha: f.get('fecha'), hora: f.get('hora'),
    personas: f.get('personas'), notas: f.get('notas'), precio: f.get('precio')
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

function switchTab(tab) {
  $$('.panel-tabs button').forEach(x => x.classList.toggle('activo', x.dataset.tab === tab));
  $('#lista-galerias').classList.toggle('oculto', tab !== 'galerias');
  $('#lista-solicitudes').classList.toggle('oculto', tab !== 'solicitudes');
}
$$('.panel-tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

init();
