const menuToggle = document.getElementById('menu-toggle');
const menuNav = document.getElementById('nav-principal');
if (menuToggle && menuNav) {
  menuToggle.addEventListener('click', () => {
    const abierto = menuNav.classList.toggle('menu-abierto');
    menuToggle.setAttribute('aria-expanded', String(abierto));
    menuToggle.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
    menuToggle.textContent = abierto ? '✕' : '☰';
  });
  menuNav.addEventListener('click', e => {
    if (!e.target.closest('a')) return;
    menuNav.classList.remove('menu-abierto');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menú');
    menuToggle.textContent = '☰';
  });
}

(async () => {
  const cfg = await cargarConfig();

  // Textos de marca
  document.getElementById('eslogan').textContent = cfg.eslogan;
  document.title = cfg.marca + ' · ' + cfg.eslogan;
  document.getElementById('anio').textContent = new Date().getFullYear();
  document.getElementById('wa-pie').innerHTML =
    `Contáctanos por <a href="https://wa.me/${cfg.whatsapp}" target="_blank" rel="noopener" style="color:var(--acento)">WhatsApp</a> · ${new Date().getFullYear()}`;

  // Servicios (tarjetas + opciones del formulario)
  const lista = document.getElementById('lista-servicios');
  const opciones = document.getElementById('opciones-servicio');
  lista.innerHTML = '';
  opciones.innerHTML = '';

  const fotosServicio = {
    'Cueva de la Vaca': '/img/cueva-2.jpg',
    'Cuatrimotos': '/img/cuatrimotos-2.jpg'
  };

  cfg.servicios.forEach((s, i) => {
    // Tarjeta
    const card = document.createElement('article');
    card.className = 'servicio';
    const foto = fotosServicio[s.nombre];
    const fotoClase = s.nombre === 'Cuatrimotos' ? 'servicio-foto-cuatrimotos' : '';
    card.innerHTML = `
      ${foto
        ? `<div class="servicio-foto ${fotoClase}" style="background-image:url('${foto}')"></div>`
        : `<div class="servicio-foto servicio-foto-icono"><span>${esc(s.icono || '🏔️')}</span></div>`}
      <div class="servicio-cuerpo">
        <div class="servicio-icono">${esc(s.icono || '🏔️')}</div>
        <h3>${esc(s.nombre)}</h3>
        <p>${esc(s.descripcion || '')}</p>
        <button class="btn btn-fantasma btn-chico" data-servicio="${esc(s.nombre)}">Quiero mis fotos</button>
      </div>`;
    card.querySelector('button').addEventListener('click', () => {
      document.querySelector(`input[name="servicio"][value="${cssEscape(s.nombre)}"]`)?.click();
      document.getElementById('solicitar').scrollIntoView({ behavior: 'smooth' });
    });
    lista.appendChild(card);

    // Opción del formulario (radio)
    const label = document.createElement('label');
    label.className = 'opcion-servicio';
    label.innerHTML = `
      <input type="radio" name="servicio" value="${esc(s.nombre)}" ${i === 0 ? 'checked' : ''}>
      <span class="opcion-caja">
        <span class="opcion-icono">${esc(s.icono || '🏔️')}</span>
        <span class="opcion-nombre">${esc(s.nombre)}</span>
      </span>`;
    opciones.appendChild(label);
  });

  // Entrada por código
  const abrirCodigo = () => {
    const codigo = document.getElementById('input-codigo').value.trim().toUpperCase();
    if (!codigo) { toast('Escribe tu código primero', false); document.getElementById('input-codigo').focus(); return; }
    location.href = '/galeria/' + encodeURIComponent(codigo);
  };
  document.getElementById('form-codigo').addEventListener('submit', e => { e.preventDefault(); abrirCodigo(); });
  document.getElementById('btn-tengo-codigo').addEventListener('click', () => {
    document.getElementById('input-codigo').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('input-codigo').focus(), 400);
  });

  // Formulario de solicitud
  const form = document.getElementById('form-solicitud');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const servicio = form.querySelector('input[name="servicio"]:checked')?.value || '';
    const datos = {
      nombre: document.getElementById('s-nombre').value,
      celular: document.getElementById('s-celular').value,
      servicio,
      fecha: document.getElementById('s-fecha').value,
      hora: document.getElementById('s-hora').value,
      personas: document.getElementById('s-personas').value,
      notas: document.getElementById('s-notas').value
    };
    try {
      const r = await fetch('/api/solicitud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo enviar');

      const texto = encodeURIComponent(
        `Hola! Quiero mis fotos de Guaití 📸\n` +
        `👤 ${datos.nombre}\n` +
        `🏔️ ${datos.servicio}\n` +
        (datos.fecha ? `📅 ${datos.fecha}${datos.hora ? ' a las ' + datos.hora : ''}\n` : '') +
        (datos.personas ? `👥 ${datos.personas} personas\n` : '') +
        (datos.notas ? `📝 ${datos.notas}\n` : '') +
        `\nEnviado desde la página web.`
      );
      form.classList.add('oculto');
      document.getElementById('solicitud-ok').classList.remove('oculto');
      document.getElementById('link-wa-solicitud').href = 'https://wa.me/' + cfg.whatsapp + '?text=' + texto;
      document.getElementById('solicitud-ok').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(err.message, false);
    }
    btn.disabled = false;
  });
})();

function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/(["\\])/g, '\\$1');
}
