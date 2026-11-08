(async () => {
  const cfg = await cargarConfig();

  // Textos de marca
  document.getElementById('marca').textContent = cfg.marca;
  document.getElementById('eslogan').textContent = cfg.eslogan;
  document.title = cfg.marca + ' · Paquetes de fotos y videos';
  document.getElementById('anio').textContent = new Date().getFullYear();
  document.querySelectorAll('[data-marca]').forEach(el => { el.textContent = cfg.marca; });
  document.getElementById('wa-pie').innerHTML =
    `Contáctanos por <a href="https://wa.me/${cfg.whatsapp}" target="_blank" rel="noopener" style="color:var(--acento)">WhatsApp</a> · ${new Date().getFullYear()}`;

  // Nequi
  const numeroFormateado = formatearNumero(cfg.nequiNumero);
  document.getElementById('nequi-numero').textContent = numeroFormateado;
  document.getElementById('nequi-numero-lista').textContent = numeroFormateado;
  document.getElementById('nequi-titular').textContent = cfg.nequiTitular;
  document.getElementById('btn-copiar-nequi').addEventListener('click', () => copiar(cfg.nequiNumero, 'Número Nequi copiado ✔'));

  // Paquetes
  const lista = document.getElementById('lista-paquetes');
  const selectPaq = document.getElementById('r-paquete');
  selectPaq.innerHTML = '<option value="">Elige uno…</option>';
  cfg.paquetes.forEach((p, i) => {
    const card = document.createElement('article');
    card.className = 'paquete' + (i === 1 ? ' destacado' : '');
    card.innerHTML = `
      ${i === 1 ? '<span class="etiqueta-destacado">Más pedido</span>' : ''}
      <h3>${esc(p.nombre)}</h3>
      <div class="precio">${formatoPrecio(p.precio)}</div>
      <p>${esc(p.detalle || '')}</p>
      <button class="btn btn-fantasma" data-paquete="${esc(p.nombre)}">Reservar este paquete</button>`;
    card.querySelector('button').addEventListener('click', () => {
      selectPaq.value = p.nombre;
      document.getElementById('reserva').scrollIntoView({ behavior: 'smooth' });
    });
    lista.appendChild(card);

    const opt = document.createElement('option');
    opt.value = p.nombre;
    opt.textContent = `${p.nombre} · ${formatoPrecio(p.precio)}`;
    selectPaq.appendChild(opt);
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

  // Reserva
  const form = document.getElementById('form-reserva');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const datos = {
      nombre: document.getElementById('r-nombre').value,
      celular: document.getElementById('r-celular').value,
      tipoEvento: document.getElementById('r-tipo').value,
      paquete: document.getElementById('r-paquete').value,
      fecha: document.getElementById('r-fecha').value,
      hora: document.getElementById('r-hora').value,
      lugar: document.getElementById('r-lugar').value,
      notas: document.getElementById('r-notas').value
    };
    try {
      const r = await fetch('/api/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo enviar');

      const texto = encodeURIComponent(
        `Hola! Quiero reservar una sesión de fotos 📸\n` +
        `👤 ${datos.nombre}\n📅 ${datos.fecha}${datos.hora ? ' a las ' + datos.hora : ''}\n` +
        `🎉 ${datos.tipoEvento || 'Evento'}\n📦 ${datos.paquete || 'Paquete por definir'}\n` +
        `📍 ${datos.lugar || ''}\n` +
        (datos.notas ? `📝 ${datos.notas}\n` : '') +
        `\nEnviado desde la página web.`
      );
      form.classList.add('oculto');
      document.getElementById('reserva-ok').classList.remove('oculto');
      document.getElementById('link-wa-reserva').href = 'https://wa.me/' + cfg.whatsapp + '?text=' + texto;
      document.getElementById('reserva-ok').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      toast(err.message, false);
    }
    btn.disabled = false;
  });
})();
