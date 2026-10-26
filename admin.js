(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const config = window.SUPABASE_CONFIG || {};
  const warning = byId('setupWarning');
  const loginStatus = byId('loginStatus');
  const globalStatus = byId('globalStatus');
  const loginPanel = byId('loginPanel');
  const dashboard = byId('dashboard');

  const showStatus = (el, msg, error = false) => {
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('error', error);
  };

  const configured = config.url && config.publishableKey &&
    !config.url.includes('TEU-PROJETO') &&
    !config.publishableKey.includes('COLOCA_A_TUA');

  if (!configured || !window.supabase) {
    if (warning) warning.classList.remove('admin-hidden');
    showStatus(warning, 'Configuração incompleta. Edita supabase-config.js com o Project URL e a chave pública do Supabase e confirma a ligação à internet.', true);
    showStatus(loginStatus, 'Ainda não configurado. Não introduzas credenciais de administrador até completares a configuração.');
    return;
  }

  const sb = window.supabase.createClient(config.url, config.publishableKey);
  let map = null;
  let marker = null;

  function initMap() {
    if (map || !window.L || !byId('eventMap')) return;
    map = L.map('eventMap').setView([39.5, -8.0], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    map.on('click', e => setPin(e.latlng.lat, e.latlng.lng));
    window.setTimeout(() => map.invalidateSize(), 150);
  }

  function setPin(lat, lng) {
    byId('eventLat').value = lat.toFixed(6);
    byId('eventLng').value = lng.toFixed(6);
    if (marker) marker.setLatLng([lat, lng]);
    else marker = L.marker([lat, lng]).addTo(map);
  }

  async function refreshSession() {
    const { data, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw sessionError;
    const session = data.session;

    if (!session) {
      loginPanel?.classList.remove('admin-hidden');
      dashboard?.classList.add('admin-hidden');
      return;
    }

    const { data: profile, error } = await sb.from('profiles')
      .select('role').eq('id', session.user.id).maybeSingle();

    if (error || !profile || !['admin', 'editor', 'event_manager', 'moderator'].includes(profile.role)) {
      await sb.auth.signOut();
      showStatus(loginStatus, 'Esta conta não tem papel administrativo autorizado. Confirma a tabela profiles e o papel da conta.', true);
      return;
    }

    loginPanel?.classList.add('admin-hidden');
    dashboard?.classList.remove('admin-hidden');
    initMap();
    await refreshRecent();
  }

  byId('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    showStatus(loginStatus, 'A validar acesso…');
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: byId('email').value.trim(),
        password: byId('password').value
      });
      if (error) throw error;
      await refreshSession();
    } catch (err) {
      showStatus(loginStatus, 'Não foi possível iniciar sessão: ' + (err.message || String(err)), true);
    }
  });

  byId('logoutBtn')?.addEventListener('click', async () => {
    try {
      const { error } = await sb.auth.signOut();
      if (error) throw error;
      location.reload();
    } catch (err) {
      showStatus(globalStatus, 'Erro ao terminar sessão: ' + (err.message || String(err)), true);
    }
  });

  sb.auth.onAuthStateChange(() => {
    // O Supabase/RLS valida as permissões no servidor.
  });

  byId('contentTitle')?.addEventListener('input', e => {
    const slug = byId('contentSlug');
    if (!slug.dataset.manual) {
      slug.value = e.target.value.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
  });
  byId('contentSlug')?.addEventListener('input', e => { e.target.dataset.manual = '1'; });

  byId('contentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    showStatus(globalStatus, 'A guardar conteúdo…');
    try {
      const type = byId('contentType').value;
      const title = byId('contentTitle').value.trim();
      const slug = byId('contentSlug').value.trim();
      const status = byId('contentStatus').value;
      const auth = await sb.auth.getUser();
      if (auth.error) throw auth.error;
      if (!auth.data.user) throw new Error('A sessão expirou. Inicia sessão novamente.');

      const row = {
        title, slug, status,
        body: byId('contentBody').value.trim(),
        published_at: status === 'published' ? new Date().toISOString() : null,
        created_by: auth.data.user.id
      };

      if (type === 'stories') {
        const ep = byId('episode').value;
        row.episode_number = ep ? Number(ep) : null;
      } else {
        row.excerpt = byId('contentExcerpt').value.trim() || null;
      }

      const file = byId('coverFile').files[0];
      if (file) {
        if (!file.type.startsWith('image/')) throw new Error('A capa tem de ser uma imagem.');
        const path = `covers/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
        const { error: uploadError } = await sb.storage.from('public-media').upload(path, file, { upsert: false });
        if (uploadError) throw uploadError;
        row.cover_path = path;
      }

      const { error } = await sb.from(type).insert(row);
      if (error) throw error;
      e.target.reset();
      byId('contentSlug').dataset.manual = '';
      showStatus(globalStatus, 'Conteúdo guardado. Estado: ' + status + '.');
      await refreshRecent();
    } catch (err) {
      console.error('Erro ao guardar conteúdo:', err);
      showStatus(globalStatus, 'Erro ao guardar conteúdo: ' + (err.message || String(err)), true);
    }
  });

  byId('mediaForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    showStatus(globalStatus, 'A carregar ficheiro…');
    try {
      const file = byId('mediaFile').files[0];
      const type = byId('mediaType').value;
      if (!file) throw new Error('Seleciona um ficheiro.');
      if (type === 'image' && !file.type.startsWith('image/')) throw new Error('Seleciona uma imagem.');
      if (type === 'video' && !file.type.startsWith('video/')) throw new Error('Seleciona um vídeo.');
      if (file.size > 50 * 1024 * 1024) throw new Error('O ficheiro ultrapassa o limite de 50 MB.');

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const path = `media/${Date.now()}-${safeName}`;
      const { error: uploadError } = await sb.storage.from('public-media').upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const status = byId('mediaStatus').value;
      const auth = await sb.auth.getUser();
      if (auth.error) throw auth.error;
      if (!auth.data.user) throw new Error('A sessão expirou. Inicia sessão novamente.');

      const { error } = await sb.from('media_assets').insert({
        title: byId('mediaTitle').value.trim(),
        description: byId('mediaDescription').value.trim() || null,
        media_type: type,
        storage_path: path,
        album_name: byId('mediaAlbum').value.trim() || null,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
        created_by: auth.data.user.id
      });
      if (error) throw error;
      e.target.reset();
      showStatus(globalStatus, 'Ficheiro carregado e registo guardado.');
      await refreshRecent();
    } catch (err) {
      console.error('Erro ao carregar ficheiro:', err);
      showStatus(globalStatus, 'Erro no carregamento: ' + (err.message || String(err)), true);
    }
  });

  // Registo explícito do formulário de eventos e diagnóstico do envio.
  const eventForm = byId('eventForm');
  if (!eventForm) {
    console.error('Não foi encontrado o formulário #eventForm em admin.html.');
  } else {
    eventForm.addEventListener('submit', async e => {
      e.preventDefault();
      showStatus(globalStatus, 'A guardar evento…');
      console.log('Formulário de evento submetido.');

      try {
        const title = byId('eventTitle').value.trim();
        const venue = byId('eventVenue').value.trim();
        const address = byId('eventAddress').value.trim();
        const startValue = byId('eventStart').value;
        const endValue = byId('eventEnd').value;
        const latValue = byId('eventLat').value.trim();
        const lngValue = byId('eventLng').value.trim();

        if (!title || !venue || !address || !startValue || !latValue || !lngValue) {
          throw new Error('Preenche todos os campos obrigatórios e escolhe um ponto no mapa.');
        }

        const lat = Number(latValue);
        const lng = Number(lngValue);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
            !Number.isFinite(lng) || lng < -180 || lng > 180) {
          throw new Error('Coordenadas inválidas. Escolhe novamente o ponto no mapa.');
        }

        const startsAt = new Date(startValue);
        if (Number.isNaN(startsAt.getTime())) throw new Error('A data e hora de início não são válidas.');

        let endsAt = null;
        if (endValue) {
          endsAt = new Date(endValue);
          if (Number.isNaN(endsAt.getTime())) throw new Error('A data e hora de fim não são válidas.');
          if (endsAt <= startsAt) throw new Error('A data e hora de fim têm de ser posteriores ao início.');
        }

        const auth = await sb.auth.getUser();
        if (auth.error) throw auth.error;
        if (!auth.data.user) throw new Error('A sessão expirou. Inicia sessão novamente.');

        const { error } = await sb.from('events').insert({
          title,
          venue,
          public_address: address,
          description: byId('eventDescription').value.trim() || null,
          latitude: lat,
          longitude: lng,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt ? endsAt.toISOString() : null,
          status: byId('eventStatus').value,
          created_by: auth.data.user.id
        });
        if (error) throw error;

        e.target.reset();
        if (marker && map) {
          map.removeLayer(marker);
          marker = null;
        }
        showStatus(globalStatus, byId('eventStatus').value === 'published' ? 'Evento guardado como PUBLICADO. Atualiza o site para confirmar que aparece.' : 'Evento guardado como RASCUNHO. Para o mostrar no site, altera o estado para Publicado e guarda novamente.');
        await refreshRecent();
      } catch (err) {
        console.error('Erro ao guardar evento:', err);
        showStatus(globalStatus, 'Erro ao guardar evento: ' + (err.message || String(err)), true);
      }
    });
  }

  async function refreshRecent() {
    const list = byId('recentList');
    if (!list) return;
    list.replaceChildren();

    const sources = [
      ['Contos', 'stories'],
      ['Aventuras', 'adventures'],
      ['Multimédia', 'media_assets'],
      ['Eventos', 'events']
    ];

    for (const [label, table] of sources) {
      const { data, error } = await sb.from(table)
        .select('*').order('created_at', { ascending: false }).limit(5);
      const li = document.createElement('li');
      li.textContent = error
        ? `${label}: não foi possível carregar (${error.message}).`
        : `${label}: ${(data || []).length} registo(s) recente(s).`;
      list.appendChild(li);
    }
  }

  byId('refreshBtn')?.addEventListener('click', async () => {
    try {
      await refreshRecent();
      showStatus(globalStatus, 'Lista atualizada.');
    } catch (err) {
      showStatus(globalStatus, 'Erro ao atualizar a lista: ' + (err.message || String(err)), true);
    }
  });

  refreshSession().catch(err => {
    console.error('Erro ao verificar sessão:', err);
    showStatus(loginStatus, 'Erro ao verificar sessão: ' + (err.message || String(err)), true);
  });
})();
