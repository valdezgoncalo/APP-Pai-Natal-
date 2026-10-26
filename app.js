(() => {
  'use strict';

  const STORAGE_KEYS = {
    prefs: 'mundoPaiNatal.preferences.v1',
    missions: 'mundoPaiNatal.missions.v1'
  };
  const defaultPrefs = { stories: true, events: false, media: true, letters: true };

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  let prefs = { ...defaultPrefs, ...readStorage(STORAGE_KEYS.prefs, {}) };
  document.querySelectorAll('[data-pref]').forEach(input => {
    input.checked = !!prefs[input.dataset.pref];
    input.addEventListener('change', () => {
      prefs[input.dataset.pref] = input.checked;
      writeStorage(STORAGE_KEYS.prefs, prefs);
      const status = document.getElementById('pushStatus');
      if (status) status.textContent = 'Preferências guardadas neste dispositivo. Para enviar alertas reais, é necessário configurar o servidor de notificações.';
    });
  });

  const storyBtn = document.getElementById('moreStoryBtn');
  storyBtn?.addEventListener('click', () => {
    const extra = document.getElementById('storyExtra');
    if (!extra) return;
    extra.hidden = !extra.hidden;
    storyBtn.innerHTML = extra.hidden ? 'Continuar a aventura <span>→</span>' : 'Recolher a história <span>↑</span>';
  });

  const galleryDialog = document.getElementById('galleryDialog');
  document.querySelectorAll('[data-gallery]').forEach(button => button.addEventListener('click', () => {
    const title = document.getElementById('dialogTitle');
    if (title) title.textContent = button.dataset.gallery;
    galleryDialog?.showModal();
  }));
  function closeGallery() { galleryDialog?.close(); }
  document.getElementById('closeDialog')?.addEventListener('click', closeGallery);
  document.getElementById('dialogOk')?.addEventListener('click', closeGallery);
  galleryDialog?.addEventListener('click', e => { if (e.target === galleryDialog) closeGallery(); });

  const letterMessage = document.getElementById('letterMessage');
  letterMessage?.addEventListener('input', () => {
    const count = document.getElementById('charCount');
    if (count) count.textContent = letterMessage.value.length;
  });
  const letterDialog = document.getElementById('letterDialog');
  document.getElementById('letterForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('letterName')?.value.trim() || '';
    const message = letterMessage?.value.trim() || '';
    if (!message) return;
    const preview = document.getElementById('letterPreview');
    if (preview) preview.textContent = (name ? `Mensagem preparada por ${name}: ` : 'A tua mensagem: ') + message;
    letterDialog?.showModal();
    const status = document.getElementById('letterStatus');
    if (status) status.textContent = 'A carta foi preparada apenas para demonstração. Não foi enviada.';
  });
  function closeLetter() { letterDialog?.close(); }
  document.getElementById('closeLetterDialog')?.addEventListener('click', closeLetter);
  document.getElementById('closeLetterOk')?.addEventListener('click', closeLetter);
  letterDialog?.addEventListener('click', e => { if (e.target === letterDialog) closeLetter(); });

  const missionInputs = [...document.querySelectorAll('.mission-list input')];
  const savedMissions = readStorage(STORAGE_KEYS.missions, []);
  missionInputs.forEach((input, i) => {
    input.checked = !!savedMissions[i];
    input.addEventListener('change', () => writeStorage(STORAGE_KEYS.missions, missionInputs.map(x => x.checked)));
  });

  let deferredPrompt = null;
  const installButtons = [document.getElementById('installBtn'), document.getElementById('installBtnBottom')];
  const installStatus = document.createElement('p');
  installStatus.className = 'form-status';
  installStatus.setAttribute('role', 'status');
  document.querySelector('.install-banner')?.appendChild(installStatus);
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    installButtons.forEach(button => { if (button) button.hidden = false; });
  });
  async function installApp() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installButtons.forEach(button => { if (button) button.hidden = true; });
      return;
    }
    if (installStatus) installStatus.textContent = 'No iPhone, usa Partilhar e depois “Adicionar ao ecrã principal”. Noutros dispositivos, procura “Instalar aplicação” no menu do navegador.';
  }
  installButtons.forEach(button => button?.addEventListener('click', installApp));
  window.addEventListener('appinstalled', () => {
    if (installStatus) installStatus.textContent = 'Aplicação instalada. Bem-vindo ao Mundo do Pai Natal!';
    installButtons.forEach(button => { if (button) button.hidden = true; });
  });

  const pushBtn = document.getElementById('pushBtn');
  pushBtn?.addEventListener('click', async () => {
    const status = document.getElementById('pushStatus');
    if (!status) return;
    if (!('Notification' in window)) {
      status.textContent = 'Este navegador não suporta a API de notificações. Podes continuar a consultar as novidades no site.';
      return;
    }
    if (!window.isSecureContext) {
      status.textContent = 'As notificações requerem HTTPS ou localhost. Publica a app num alojamento seguro para testar esta funcionalidade.';
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') status.textContent = 'Permissão concedida neste navegador. O envio real de notificações só ficará ativo depois de configurar o serviço Push no servidor.';
      else status.textContent = 'As notificações não foram autorizadas. Podes alterar esta opção nas definições do navegador.';
    } catch {
      status.textContent = 'Não foi possível pedir autorização neste dispositivo.';
    }
  });

  // Carrega eventos públicos da Supabase e substitui o conteúdo demonstrativo do mapa.
  async function loadPublishedEvents() {
    const mapInfo = document.querySelector('.map-info');
    if (!mapInfo) return;

    const placeholder = mapInfo.querySelector('.event-placeholder');
    const heading = mapInfo.querySelector('h3');
    const intro = mapInfo.querySelector('p');
    const config = window.SUPABASE_CONFIG || {};
    const statusLine = document.createElement('p');
    statusLine.className = 'fine-print';
    statusLine.setAttribute('role', 'status');

    if (!config.url || !config.publishableKey || !window.supabase?.createClient) {
      if (placeholder) {
        const title = placeholder.querySelector('strong');
        const small = placeholder.querySelector('small');
        if (title) title.textContent = 'Eventos temporariamente indisponíveis';
        if (small) small.textContent = 'A ligação aos eventos ainda não está configurada nesta página.';
      }
      return;
    }

    try {
      const client = window.supabase.createClient(config.url, config.publishableKey);
      const { data: events, error } = await client
        .from('events')
        .select('id,title,description,venue,public_address,latitude,longitude,starts_at,ends_at,status')
        .eq('status', 'published')
        .gte('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('starts_at', { ascending: true });

      if (error) throw error;

      if (placeholder) placeholder.remove();
      if (heading) heading.textContent = events?.length ? 'Próximas visitas do Pai Natal' : 'Ainda não há visitas publicadas';
      if (intro) intro.textContent = events?.length
        ? 'Descobre os próximos locais e horários confirmados pela equipa do Pai Natal.'
        : 'Volta em breve para descobrir as próximas paragens.';

      const list = document.createElement('div');
      list.className = 'published-events-list';
      if (!events?.length) {
        const empty = document.createElement('p');
        empty.className = 'event-placeholder';
        empty.textContent = 'Ainda não existem eventos publicados para apresentar.';
        list.appendChild(empty);
      } else {
        events.forEach(event => {
          const card = document.createElement('article');
          card.className = 'event-placeholder';
          const icon = document.createElement('span');
          icon.className = 'event-icon';
          icon.textContent = '📍';
          const details = document.createElement('span');
          const title = document.createElement('strong');
          title.textContent = event.title;
          const venue = document.createElement('small');
          venue.textContent = `${event.venue} — ${event.public_address}`;
          const date = document.createElement('small');
          const dateValue = new Date(event.starts_at);
          date.textContent = dateValue.toLocaleString('pt-PT', {
            dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Lisbon'
          });
          details.append(title, venue, date);
          if (event.description) {
            const description = document.createElement('small');
            description.textContent = event.description;
            details.appendChild(description);
          }
          const mapLink = document.createElement('a');
          mapLink.className = 'inline-link';
          mapLink.href = `https://www.google.com/maps?q=${encodeURIComponent(`${event.latitude},${event.longitude}`)}`;
          mapLink.target = '_blank';
          mapLink.rel = 'noopener noreferrer';
          mapLink.textContent = 'Ver localização no mapa →';
          details.appendChild(mapLink);
          card.append(icon, details);
          list.appendChild(card);
        });
      }
      mapInfo.appendChild(list);
    } catch (error) {
      console.error('Não foi possível carregar os eventos publicados:', error);
      statusLine.textContent = 'Não foi possível carregar os eventos. Confirma a ligação e as permissões de leitura da tabela events na Supabase.';
      mapInfo.appendChild(statusLine);
    }
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
  loadPublishedEvents();
})();
