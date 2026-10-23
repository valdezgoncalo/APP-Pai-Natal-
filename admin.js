(() => {
  const config = window.SUPABASE_CONFIG || {};
  const warning = document.getElementById('setupWarning');
  const loginStatus = document.getElementById('loginStatus');
  const globalStatus = document.getElementById('globalStatus');
  const loginPanel = document.getElementById('loginPanel');
  const dashboard = document.getElementById('dashboard');
  const showStatus = (el, msg, error=false) => { el.textContent = msg; el.classList.toggle('error', error); };
  const configured = config.url && config.publishableKey &&
    !config.url.includes('TEU-PROJETO') && !config.publishableKey.includes('COLOCA_A_TUA');
  if (!configured || !window.supabase) {
    warning.classList.remove('admin-hidden');
    showStatus(warning, 'Configuração incompleta. Edita supabase-config.js com o Project URL e a chave pública do Supabase e confirma a ligação à internet.', true);
    showStatus(loginStatus, 'Ainda não configurado. Não introduzas credenciais de administrador até completares a configuração.');
    return;
  }

  const sb = window.supabase.createClient(config.url, config.publishableKey);
  let map, marker;
  function initMap() {
    if (map || !window.L) return;
    map = L.map('eventMap').setView([39.5, -8.0], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    map.on('click', e => setPin(e.latlng.lat, e.latlng.lng));
    setTimeout(() => map.invalidateSize(), 150);
  }
  function setPin(lat, lng) {
    document.getElementById('eventLat').value = lat.toFixed(6);
    document.getElementById('eventLng').value = lng.toFixed(6);
    if (marker) marker.setLatLng([lat,lng]); else marker = L.marker([lat,lng]).addTo(map);
  }
  async function refreshSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { loginPanel.classList.remove('admin-hidden'); dashboard.classList.add('admin-hidden'); return; }
    const { data: profile, error } = await sb.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    if (error || !profile || !['admin','editor','event_manager','moderator'].includes(profile.role)) {
      await sb.auth.signOut();
      showStatus(loginStatus, 'Esta conta não tem papel administrativo autorizado. Confirma a tabela profiles e o papel da conta.', true);
      return;
    }
    loginPanel.classList.add('admin-hidden'); dashboard.classList.remove('admin-hidden');
    initMap(); await refreshRecent();
  }
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    showStatus(loginStatus, 'A validar acesso…');
    const { error } = await sb.auth.signInWithPassword({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value
    });
    if (error) { showStatus(loginStatus, 'Não foi possível iniciar sessão: ' + error.message, true); return; }
    await refreshSession();
  });
  document.getElementById('logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  sb.auth.onAuthStateChange((_event, _session) => { /* sessão atualizada; operações verificam permissões no servidor via RLS */ });

  document.getElementById('contentTitle').addEventListener('input', e => {
    const slug = document.getElementById('contentSlug');
    if (!slug.dataset.manual) slug.value = e.target.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  });
  document.getElementById('contentSlug').addEventListener('input', e => { e.target.dataset.manual='1'; });

  document.getElementById('contentForm').addEventListener('submit', async e => {
    e.preventDefault(); showStatus(globalStatus, 'A guardar conteúdo…');
    try {
      const type = document.getElementById('contentType').value;
      const title = document.getElementById('contentTitle').value.trim();
      const slug = document.getElementById('contentSlug').value.trim();
      const status = document.getElementById('contentStatus').value;
      const row = {
        title, slug, status, body: document.getElementById('contentBody').value.trim(),
        published_at: status === 'published' ? new Date().toISOString() : null,
        created_by: (await sb.auth.getUser()).data.user.id
      };
      if (type === 'stories') {
        const ep = document.getElementById('episode').value;
        row.episode_number = ep ? Number(ep) : null;
      } else row.excerpt = document.getElementById('contentExcerpt').value.trim() || null;
      const file = document.getElementById('coverFile').files[0];
      if (file) {
        if (!file.type.startsWith('image/')) throw new Error('A capa tem de ser uma imagem.');
        const path = `covers/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`;
        const { error: upErr } = await sb.storage.from('public-media').upload(path, file, { upsert:false });
        if (upErr) throw upErr;
        row.cover_path = path;
      }
      const { error } = await sb.from(type).insert(row);
      if (error) throw error;
      e.target.reset(); document.getElementById('contentSlug').dataset.manual='';
      showStatus(globalStatus, 'Conteúdo guardado. Estado: ' + status + '.');
      await refreshRecent();
    } catch (err) { showStatus(globalStatus, 'Erro ao guardar conteúdo: ' + (err.message || err), true); }
  });

  document.getElementById('mediaForm').addEventListener('submit', async e => {
    e.preventDefault(); showStatus(globalStatus, 'A carregar ficheiro…');
    try {
      const file = document.getElementById('mediaFile').files[0];
      const type = document.getElementById('mediaType').value;
      if (!file) throw new Error('Seleciona um ficheiro.');
      if (type === 'image' && !file.type.startsWith('image/')) throw new Error('Seleciona uma imagem.');
      if (type === 'video' && !file.type.startsWith('video/')) throw new Error('Seleciona um vídeo.');
      if (file.size > 50 * 1024 * 1024) throw new Error('O ficheiro ultrapassa o limite de 50 MB.');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'-');
      const path = `media/${Date.now()}-${safeName}`;
      const { error: upErr } = await sb.storage.from('public-media').upload(path, file, { upsert:false });
      if (upErr) throw upErr;
      const status = document.getElementById('mediaStatus').value;
      const user = (await sb.auth.getUser()).data.user;
      const { error } = await sb.from('media_assets').insert({
        title: document.getElementById('mediaTitle').value.trim(),
        description: document.getElementById('mediaDescription').value.trim() || null,
        media_type: type, storage_path: path,
        album_name: document.getElementById('mediaAlbum').value.trim() || null,
        status, published_at: status === 'published' ? new Date().toISOString() : null,
        created_by: user.id
      });
      if (error) throw error;
      e.target.reset(); showStatus(globalStatus, 'Ficheiro carregado e registo guardado.');
      await refreshRecent();
    } catch (err) { showStatus(globalStatus, 'Erro no carregamento: ' + (err.message || err), true); }
  });

  document.getElementById('eventForm').addEventListener('submit', async e => {
    e.preventDefault(); showStatus(globalStatus, 'A guardar evento…');
    try {
      const lat = Number(document.getElementById('eventLat').value);
      const lng = Number(document.getElementById('eventLng').value);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Coordenadas inválidas.');
      const status = document.getElementById('eventStatus').value;
      const user = (await sb.auth.getUser()).data.user;
      const endValue = document.getElementById('eventEnd').value;
      const { error } = await sb.from('events').insert({
        title: document.getElementById('eventTitle').value.trim(),
        venue: document.getElementById('eventVenue').value.trim(),
        public_address: document.getElementById('eventAddress').value.trim(),
        description: document.getElementById('eventDescription').value.trim() || null,
        latitude: lat, longitude: lng,
        starts_at: new Date(document.getElementById('eventStart').value).toISOString(),
        ends_at: endValue ? new Date(endValue).toISOString() : null,
        status, created_by: user.id
      });
      if (error) throw error;
      e.target.reset(); if (marker) { map.removeLayer(marker); marker=null; }
      showStatus(globalStatus, 'Evento guardado. Confirma a data e o PIN antes de o publicar.');
      await refreshRecent();
    } catch (err) { showStatus(globalStatus, 'Erro ao guardar evento: ' + (err.message || err), true); }
  });

  async function refreshRecent() {
    const list = document.getElementById('recentList'); list.replaceChildren();
    const sources = [
      ['Contos', 'stories'], ['Aventuras', 'adventures'], ['Multimédia', 'media_assets'], ['Eventos', 'events']
    ];
    for (const [label, table] of sources) {
      const { data, error } = await sb.from(table).select('*').order('created_at', {ascending:false}).limit(5);
      const li = document.createElement('li');
      li.textContent = error ? `${label}: não foi possível carregar.` : `${label}: ${(data||[]).length} registo(s) recente(s).`;
      list.appendChild(li);
    }
  }
  document.getElementById('refreshBtn').addEventListener('click', refreshRecent);
  refreshSession().catch(err => showStatus(loginStatus, err.message || String(err), true));
})();
