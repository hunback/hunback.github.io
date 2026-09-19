'use strict';
(() => {
  const config = window.WEDDING_CONFIG || {};
  // Local previews must stay off the production D1 endpoint. Exported pages keep the verified API.
  const localPreview = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || window.WEDDING_OFFLINE_PREVIEW === true;
  if (localPreview) config.apiBase = '';
  const photos = window.WEDDING_PHOTOS || [];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { api: false, mode: 'offline', before: null, galleryCount: 0, deleteId: null, toastTimer: null };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const apiBase = (config.apiBase || '').replace(/\/$/, '');
  const asset = (path) => window.WEDDING_ASSET_MAP?.[path] || path;
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const isFilePreview = location.protocol === 'file:' || window.WEDDING_OFFLINE_PREVIEW === true;
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function toast(text) {
    const el = $('#toast'); el.textContent = text; el.hidden = false;
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => { el.hidden = true; }, 3300);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); return true; }
    catch (_) {
      const area = node('textarea'); area.value = text; area.setAttribute('readonly', '');
      area.style.position = 'fixed'; area.style.left = '-9999px'; document.body.append(area); area.select();
      let done = false;
      try { done = document.execCommand('copy'); } catch (_) { /* Keep the visible number selectable. */ }
      area.remove(); toast(done ? '복사했습니다.' : '복사할 내용을 길게 눌러 선택해 주세요.');
      return done;
    }
  }
  async function api(path, method = 'GET', payload) {
    if (isFilePreview) throw new Error('파일 미리보기에서는 저장할 수 없습니다. 실제 청첩장 또는 Start-Local.cmd로 실행한 로컬 주소를 이용해 주세요.');
    if (method === 'POST' && payload && typeof payload.password === 'string' && state.passwordProtocol === 'pbkdf2-sha256-600000-v1') {
      const toHex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
      const deletion = /^\/guestbook\/(\d+)\/delete$/.exec(path);
      const salt = deletion ? (await api(`/guestbook/${deletion[1]}/challenge`)).salt : toHex(crypto.getRandomValues(new Uint8Array(16)));
      if (typeof salt !== 'string' || !/^[0-9a-f]{32}$/.test(salt)) throw new Error('삭제 비밀번호 정보를 확인하지 못했습니다.');
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(payload.password), 'PBKDF2', false, ['deriveBits']);
      const proof = await crypto.subtle.deriveBits({name:'PBKDF2', salt:Uint8Array.from(salt.match(/../g), part=>parseInt(part,16)), iterations:600000, hash:'SHA-256'}, key, 256);
      const {password, ...rest} = payload;
      payload = {...rest, salt, passwordProof:toHex(proof)};
    }
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(`${apiBase}/api${path}`, {
        method, headers: { Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {}), signal: controller.signal, cache: 'no-store', credentials: 'omit'
      });
      const type = response.headers.get('Content-Type') || '';
      if (!type.includes('application/json')) throw new Error('접수 서버에 연결되지 않았습니다. 입력한 내용은 저장되거나 전송되지 않았습니다.');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return body;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('서버 응답이 지연되고 있습니다. 전송 여부를 확인한 뒤 다시 시도해 주세요.');
      if (error instanceof TypeError) throw new Error('접수 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function openDialog(id) {
    const dialog = $(id);
    $$('.form-status', dialog).forEach(el => { el.textContent = ''; el.classList.remove('success'); });
    if (id === '#guestbook-dialog') {
      const status = $('.form-status', dialog);
      if (!state.api) status.textContent = '접수 서버 미연결 상태입니다. 작성 화면만 확인할 수 있으며 실제 전송은 되지 않습니다.';
      else if (state.mode === 'local-preview') status.textContent = '로컬 확인용입니다. 작성 내용은 이 컴퓨터에만 저장됩니다.';
    }
    dialog.showModal();
    if (!state.api && !isFilePreview && id === '#guestbook-dialog') {
      connect().then(() => {
        if (state.api) $('.form-status', dialog).textContent = state.mode === 'local-preview' ? '로컬 확인용입니다. 작성 내용은 이 컴퓨터에만 저장됩니다.' : '';
      });
    }
  }
  $$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
  });
  // No automatic RSVP code: there is precisely one user-triggered opening path.
  $('#guestbook-open').addEventListener('click', () => openDialog('#guestbook-dialog'));
  $('#contact-open').addEventListener('click', () => openDialog('#contact-dialog'));

  // Keep an unloaded or stalled film invisible. The white gate dissolves in only
  // after playback starts, then dissolves out during the final frames.
  const video = $('#intro-video'); const introGate = $('#intro-gate'); const retry = $('#intro-retry');
  const main = $('#wedding'); const introSkip = $('#intro-skip');
  const media = window.WEDDING_MEDIA || window.DESIGN_CONTENT?.media || {};
  const introFadeInMs = 650;
  const introFadeOutMs = 850;
  let introFinished = false; let introReady = false; let introExiting = false;
  let loadingTimer; let stallTimer; let exitTimer;
  function removeIntroGate() {
    if (introFinished) return;
    introFinished = true;
    clearTimeout(loadingTimer); clearTimeout(stallTimer); clearTimeout(exitTimer);
    video?.pause();
    const restoreFocus = Boolean(introGate?.contains(document.activeElement));
    if (retry) retry.hidden = true;
    document.body.classList.add('intro-complete');
    if (introGate) introGate.hidden = true;
    document.body.classList.remove('intro-active');
    if (main) main.inert = false;
    if (restoreFocus) $('#invitation')?.focus?.({ preventScroll: true });
  }
  function finishIntro(immediate = false) {
    if (introFinished || introExiting) {
      if (immediate) removeIntroGate();
      return;
    }
    introExiting = true;
    clearTimeout(loadingTimer); clearTimeout(stallTimer); clearTimeout(exitTimer);
    document.body.classList.add('intro-complete');
    if (main) main.inert = false;
    if (immediate || !introGate) { removeIntroGate(); return; }
    introGate.classList.add('is-leaving');
    introGate.addEventListener('transitionend', event => {
      if (event.target === introGate && event.propertyName === 'opacity') removeIntroGate();
    });
    exitTimer = window.setTimeout(removeIntroGate, introFadeOutMs + 80);
  }
  function scheduleIntroExit() {
    clearTimeout(exitTimer);
    if (!video || introFinished || introExiting || !Number.isFinite(video.duration)) return;
    const delay = Math.max(0, (video.duration - video.currentTime - introFadeOutMs / 1000) * 1000);
    exitTimer = window.setTimeout(() => finishIntro(), delay);
  }
  async function playIntro() {
    if (introFinished || !video) return;
    if (retry) retry.hidden = true;
    try {
      await video.play();
      if (introFinished) video.pause();
      else scheduleIntroExit();
    }
    catch (_) { if (!introFinished && retry) retry.hidden = false; }
  }
  function readyIntro() {
    if (introReady || introFinished || !video || !introGate) return;
    introReady = true;
    clearTimeout(loadingTimer);
    if (reduced.matches) finishIntro(true);
    else {
      try {
        if (video.currentTime < .02 && Number.isFinite(video.duration)) video.currentTime = Math.min(.04, video.duration / 20);
      } catch (_) { /* Some mobile browsers do not allow a seek before playback. */ }
      playIntro();
    }
  }
  if (video) {
    video.muted = true;
    video.playsInline = true;
    video.autoplay = false;
    video.removeAttribute('autoplay');
    video.loop = false;
    video.addEventListener('loadeddata', readyIntro, { once: true });
    video.addEventListener('canplay', readyIntro, { once: true });
    video.addEventListener('ended', () => finishIntro(true));
    video.addEventListener('error', () => finishIntro(true));
    // A failed download must never leave guests trapped behind the opening.
    $('source', video)?.addEventListener('error', () => finishIntro(true));
    video.addEventListener('waiting', () => {
      introGate?.classList.remove('is-ready');
      clearTimeout(exitTimer);
      clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => finishIntro(true), 2500);
    });
    video.addEventListener('playing', () => {
      clearTimeout(stallTimer);
      introGate?.classList.add('is-ready');
      scheduleIntroExit();
    });
    video.addEventListener('timeupdate', () => {
      if (Number.isFinite(video.duration) && video.duration - video.currentTime <= introFadeOutMs / 1000) finishIntro();
    });
  }
  retry?.addEventListener('click', playIntro);
  introSkip?.addEventListener('click', () => finishIntro(true));
  reduced.addEventListener?.('change', event => { if (event.matches) finishIntro(true); });
  if (!media || media.introEnabled !== false) {
    if (!video || !introGate || !main || location.hash || reduced.matches) finishIntro(true);
    else {
      introGate.hidden = false;
      document.body.classList.add('intro-active');
      main.inert = true;
      loadingTimer = window.setTimeout(() => finishIntro(true), 6000);
      if (video.readyState >= 2) readyIntro();
      if (video.ended) finishIntro();
    }
  } else finishIntro(true);

  // Block image UI enlargement, not text accessibility zoom or normal vertical scrolling.
  document.addEventListener('dblclick', event => { if (event.target.closest('.protected-media')) event.preventDefault(); });
  document.addEventListener('contextmenu', event => { if (event.target.closest('.protected-media')) event.preventDefault(); });
  document.addEventListener('dragstart', event => { if (event.target.closest('.protected-media')) event.preventDefault(); });
  document.addEventListener('touchstart', event => { if (event.touches.length > 1 && event.target.closest('.protected-media')) event.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', event => { if (event.target.closest('.protected-media')) event.preventDefault(); }, { passive: false });

  // Register static AND subsequently rendered content. Never hide anything unless
  // an observer exists; deep links, keyboard focus and reduced motion stay usable.
  const revealRegistry = new WeakSet();
  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove('is-pending');
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .08, rootMargin: '0px 0px -36px 0px' }) : null;
  function observeReveals(root = document) {
    const elements = [...(root.matches?.('.reveal') ? [root] : []), ...$$('.reveal', root)];
    elements.forEach(el => {
      if (revealRegistry.has(el)) return;
      revealRegistry.add(el);
      if (!revealObserver || el.getBoundingClientRect().top < innerHeight - 36) {
        el.classList.add('is-visible'); return;
      }
      el.classList.add('is-pending'); revealObserver.observe(el);
    });
  }
  let motionChoice = null;
  try { motionChoice = localStorage.getItem('wedding-motion'); } catch (_) { /* Storage is optional. */ }
  function setMotion() {
    const mode = ['full', 'reduce'].includes(motionChoice) ? motionChoice : reduced.matches ? 'reduce' : 'full';
    document.documentElement.dataset.motion = mode;
    const button = $('#motion-toggle'); button.hidden = true;
    button.textContent = mode === 'reduce' ? '스크롤 움직임 켜기' : '움직임 줄이기';
    button.setAttribute('aria-pressed', String(mode === 'reduce'));
  }
  setMotion(); reduced.addEventListener('change', setMotion);
  $('#motion-toggle').addEventListener('click', () => {
    motionChoice = document.documentElement.dataset.motion === 'reduce' ? 'full' : 'reduce';
    try { localStorage.setItem('wedding-motion', motionChoice); } catch (_) { /* Storage is optional. */ }
    setMotion();
  });
  document.addEventListener('focusin', event => {
    const pending = event.target.closest('.is-pending');
    if (pending) { pending.classList.remove('is-pending'); pending.classList.add('is-visible'); revealObserver?.unobserve(pending); }
  });

  // December 2026: 1st Tuesday, wedding on Saturday the 19th.
  const calendar = $('#calendar');
  ['일', '월', '화', '수', '목', '금', '토'].forEach((day, index) => { const el = node('span', `weekday ${index === 0 ? 'sunday' : ''}`, day); el.setAttribute('role', 'columnheader'); calendar.append(el); });
  const first = new Date(Date.UTC(2026, 11, 1)).getUTCDay();
  for (let cell = 0; cell < 35; cell++) {
    const date = cell - first + 1; const valid = date >= 1 && date <= 31;
    const el = node('span', `${cell % 7 === 0 ? 'sunday' : ''} ${date === 19 ? 'wedding-day' : ''}`, date === 19 ? '' : (valid ? String(date) : '')); el.setAttribute('role', 'cell');
    if (date === 19) {
      const heart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      heart.setAttribute('viewBox', '0 0 48 45');
      heart.setAttribute('aria-hidden', 'true');
      heart.classList.add('calendar-heart');
      const stroke = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      stroke.setAttribute('d', 'M24.2 39.2C20.6 35.7 7.5 27.1 6.5 17.1 5.8 10.2 10.9 6.3 16.4 7.4 20.2 8.2 23.1 11.2 24.3 14.5 26.3 10.4 29.6 7.4 34.5 7.5 40.8 7.6 44 12.2 42 18.4 39.3 26.6 29.5 35.3 24.2 39.2Z');
      heart.append(stroke);
      el.append(heart, node('span', 'calendar-number', String(date)));
    }
    if (date === 19) el.setAttribute('aria-label', '12월 19일 토요일, 결혼식'); calendar.append(el);
  }
  function updateCountdown() {
    const remaining = new Date(config.weddingDate || '2026-12-19T12:30:00+09:00').getTime() - Date.now();
    const el = $('#countdown'); el.replaceChildren();
    if (remaining <= 0) { el.append(node('p','countdown-message','함께해 주셔서 감사합니다.')); return; }
    const seconds = Math.floor(remaining / 1000); const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds % 86400 / 3600); const minutes = Math.floor(seconds % 3600 / 60); const secs = seconds % 60;
    [['DAYS', days], ['HOUR', hours], ['MIN', minutes], ['SEC', secs]].forEach(([label, value], index) => {
      if (index) el.append(node('span','clock-separator',':'));
      const unit = node('span','clock-unit'); unit.append(node('small','',label), node('strong','',String(value).padStart(2,'0'))); el.append(unit);
    });
    el.append(node('p','countdown-message',`훈백과 지우의 결혼식이 ${days}일 남았습니다.`));
  }
  updateCountdown(); setInterval(updateCountdown, 1000);
  $('#copy-address').addEventListener('click', () => copy(config.address));
  let kakaoShareReady = false;
  const kakaoKey = typeof config.kakaoJavaScriptKey === 'string' ? config.kakaoJavaScriptKey.trim() : '';
  if (kakaoKey && location.protocol === 'https:') {
    const sdk = document.createElement('script');
    sdk.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
    sdk.integrity = 'sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy';
    sdk.crossOrigin = 'anonymous';
    sdk.onload = () => {
      try {
        if (!window.Kakao?.isInitialized()) window.Kakao?.init(kakaoKey);
        kakaoShareReady = Boolean(window.Kakao?.isInitialized() && window.Kakao?.Share?.sendDefault);
        if (kakaoShareReady) $('.share-hint').textContent = '카카오톡에서 받을 사람을 선택해 주세요.';
      } catch (_) { kakaoShareReady = false; }
    };
    document.head.append(sdk);
  }
  $('#share-link').addEventListener('click', async () => {
    const url = config.canonicalUrl || 'https://hunback.github.io/';
    if (kakaoShareReady) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: 'feed',
          content: {
            title: '훈백과 지우가 결혼합니다',
            description: '2026년 12월 19일 토요일 낮 12시 30분 · 더테라스웨딩 11층 더테라스 홀',
            imageUrl: 'https://hunback.github.io/assets/share/invitation-cover.jpg',
            imageWidth: 1333,
            imageHeight: 2000,
            link: {mobileWebUrl: url, webUrl: url}
          },
          buttons: [{title: '청첩장 보기', link: {mobileWebUrl: url, webUrl: url}}]
        });
        return;
      } catch (_) { /* 기기에서 카카오 공유를 열지 못하면 기본 공유 메뉴를 사용합니다. */ }
    }
    if (navigator.share) {
      try {
        await navigator.share({title:'훈백과 지우, 결혼합니다',text:'2026년 12월 19일 낮 12시 30분 · 더테라스웨딩',url});
      } catch (error) {
        if (error.name !== 'AbortError') await copy(url);
      }
    } else {
      await copy(url);
      toast('초대장 링크를 복사했습니다. 카카오톡 채팅에 붙여 넣어 주세요.');
    }
  });

  const photoDialog = $('#photo-dialog');
  const enlargedPhoto = $('#photo-dialog-image');
  const photoStage = $('.photo-dialog-stage');
  const photoPosition = $('#photo-position');
  const photoLoadStatus = $('#photo-load-status');
  const photoRetry = $('#photo-retry');
  let activePhotoIndex = -1;
  let photoGesture = null;
  let photoAnimation;
  let photoLoadingTimer;
  const adjacentPhotos = [new Image(), new Image()];
  function photoSource(photo) {
    return asset(`assets/photos/photo-${String(photo.id).padStart(2,'0')}.webp`);
  }
  function loadEnlargedPhoto(source, alt) {
    clearTimeout(photoLoadingTimer);
    photoRetry.hidden = true; photoLoadStatus.hidden = true;
    photoStage.setAttribute('aria-busy', 'true');
    enlargedPhoto.alt = alt; enlargedPhoto.src = source;
    if (!enlargedPhoto.complete) photoLoadingTimer = window.setTimeout(() => {
      photoLoadStatus.textContent = '사진을 불러오고 있습니다.'; photoLoadStatus.hidden = false;
    }, 350);
    else if (enlargedPhoto.naturalWidth) photoStage.setAttribute('aria-busy', 'false');
  }
  enlargedPhoto.addEventListener('load', () => {
    clearTimeout(photoLoadingTimer); photoLoadStatus.hidden = true;
    photoStage.setAttribute('aria-busy', 'false');
  });
  enlargedPhoto.addEventListener('error', () => {
    clearTimeout(photoLoadingTimer); photoStage.setAttribute('aria-busy', 'false');
    photoLoadStatus.textContent = '사진을 불러오지 못했습니다.'; photoLoadStatus.hidden = false; photoRetry.hidden = false;
  });
  photoRetry.addEventListener('click', () => loadEnlargedPhoto(enlargedPhoto.src, enlargedPhoto.alt));
  function showGalleryPhoto(index, direction = 0) {
    if (!photos.length) return;
    activePhotoIndex = (index + photos.length) % photos.length;
    const photo = photos[activePhotoIndex];
    photoAnimation?.cancel(); enlargedPhoto.style.transform = '';
    loadEnlargedPhoto(photoSource(photo), photo.alt);
    photoPosition.hidden = false; photoPosition.textContent = `${activePhotoIndex + 1} / ${photos.length}`;
    $('#photo-prev').hidden = photos.length < 2; $('#photo-next').hidden = photos.length < 2;
    if (direction && document.documentElement.dataset.motion !== 'reduce') {
      photoAnimation = enlargedPhoto.animate([
        {opacity:.35, transform:`translateX(${direction * 30}px)`},
        {opacity:1, transform:'translateX(0)'}
      ], {duration:220, easing:'ease-out'});
    }
    [-1,1].forEach((offset,i) => {adjacentPhotos[i].src = photoSource(photos[(activePhotoIndex + offset + photos.length) % photos.length]);});
  }
  function changePhoto(direction) {
    if (activePhotoIndex >= 0 && photos.length > 1) showGalleryPhoto(activePhotoIndex + direction, direction);
  }
  function openPhoto(photo) {
    showGalleryPhoto(photos.indexOf(photo));
    document.body.classList.add('photo-open'); photoDialog.showModal();
  }
  $('#photo-prev').addEventListener('click', () => changePhoto(-1));
  $('#photo-next').addEventListener('click', () => changePhoto(1));
  photoDialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); changePhoto(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  photoStage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button') || activePhotoIndex < 0 || photos.length < 2) return;
    photoAnimation?.cancel();
    photoGesture = {id:event.pointerId, x:event.clientX, y:event.clientY};
    photoStage.setPointerCapture(event.pointerId);
  });
  photoStage.addEventListener('pointermove', event => {
    if (!photoGesture || event.pointerId !== photoGesture.id) return;
    const dx=event.clientX-photoGesture.x, dy=event.clientY-photoGesture.y;
    if (Math.abs(dx)>Math.abs(dy)) enlargedPhoto.style.transform=`translateX(${Math.max(-70,Math.min(70,dx*.4))}px)`;
  });
  photoStage.addEventListener('pointerup', event => {
    if (!photoGesture || event.pointerId !== photoGesture.id) return;
    const dx=event.clientX-photoGesture.x, dy=event.clientY-photoGesture.y;
    photoGesture=null; enlargedPhoto.style.transform='';
    if (Math.abs(dx)>=45 && Math.abs(dx)>Math.abs(dy)*1.3) changePhoto(dx<0?1:-1);
  });
  photoStage.addEventListener('pointercancel', () => {photoGesture=null; enlargedPhoto.style.transform='';});
  photoDialog.addEventListener('close', () => {
    document.body.classList.remove('photo-open'); photoGesture=null; activePhotoIndex=-1;
    photoAnimation?.cancel(); enlargedPhoto.style.transform=''; clearTimeout(photoLoadingTimer);
  });
  const ceremonyPhoto = $('#ceremony-photo');
  if (ceremonyPhoto) ceremonyPhoto.addEventListener('click', () => {
    const image = $('img', ceremonyPhoto); activePhotoIndex=-1;
    $('#photo-prev').hidden=true; $('#photo-next').hidden=true; photoPosition.hidden=true;
    loadEnlargedPhoto(image.currentSrc || image.src, image.alt);
    document.body.classList.add('photo-open'); photoDialog.showModal();
  });

  function createGalleryPhoto(photo, index) {
      const figure = node('figure', 'reveal photo-reveal');
      figure.style.setProperty('--reveal-delay', `${index % 2 * 90}ms`);
      const button = node('button', 'gallery-photo protected-media'); button.type = 'button';
      button.setAttribute('aria-label', `${photo.alt} 크게 보기`);
      const img = node('img'); const stem = `assets/photos/photo-${String(photo.id).padStart(2,'0')}`; img.src = asset(`${stem}-small.webp`);
      if (!window.WEDDING_ASSET_MAP) img.srcset = `${stem}-small.webp 560w, ${stem}.webp 1200w`;
      img.sizes = '(max-width: 430px) calc((100vw - 44px) / 2), 194px';
      img.alt = photo.alt; img.width = photo.width; img.height = photo.height; img.style.setProperty('--photo-ratio', `${photo.width} / ${photo.height}`); img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
      button.append(img); button.addEventListener('click', () => openPhoto(photo)); figure.append(button);
      return figure;
  }
  function renderGallery() {
    const grid = $('#gallery-grid');
    grid.replaceChildren();
    const columns = node('div', 'gallery-columns');
    const left = node('div', 'gallery-column');
    const right = node('div', 'gallery-column');
    photos.forEach((photo, index) => {
      (index % 2 ? right : left).append(createGalleryPhoto(photo, index));
    });
    columns.append(left, right);
    grid.append(columns);
    state.galleryCount = photos.length;
    observeReveals(grid);
  }
  renderGallery();

  function guestFlower() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('guest-flower');
    for (let i = 0; i < 12; i++) {
      const petal = document.createElementNS(svg.namespaceURI, 'ellipse');
      for (const [key, value] of Object.entries({cx:16, cy:9, rx:2.6, ry:6, fill:'currentColor', opacity: i % 2 ? '.48' : '.7', transform:`rotate(${i * 30} 16 16)`})) petal.setAttribute(key, value);
      svg.append(petal);
    }
    const center = document.createElementNS(svg.namespaceURI, 'circle');
    center.setAttribute('cx',16); center.setAttribute('cy',16); center.setAttribute('r',3); center.setAttribute('fill','#9A7AA2'); svg.append(center);
    return svg;
  }
  function renderEmpty(message) {
    const card = node('article', 'guest-card empty-card reveal');
    card.append(guestFlower(), node('p', '', message));
    $('#guestbook-list').replaceChildren(card); $('#guestbook-list').setAttribute('aria-busy', 'false');
    observeReveals(card);
  }
  function guestCard(entry) {
    const card = node('article', 'guest-card reveal'); card.dataset.id = entry.id;
    const remove = node('button', 'guest-delete', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `${entry.name}님의 방명록 삭제`);
    remove.addEventListener('click', () => { state.deleteId = entry.id; $('#delete-form').reset(); openDialog('#delete-dialog'); });
    const author = node('p', 'guest-author', `- ${entry.name} -`);
    card.append(remove, guestFlower(), node('p','guest-message',entry.message), author); return card;
  }
  async function loadGuests(append = false, limit = 3) {
    const list = $('#guestbook-list'); list.setAttribute('aria-busy', 'true');
    try {
      const data = await api(`/guestbook?limit=${limit}${append && state.before ? `&before=${state.before}` : ''}`);
      if (!append) list.replaceChildren();
      data.items.forEach(entry => list.append(guestCard(entry)));
      if (!list.childElementCount) renderEmpty('아직 남겨진 축하 글이 없습니다. 첫 마음을 남겨주세요.');
      state.before = data.nextBefore;
      $('#guestbook-retry').hidden = true;
      $('#connection-status').textContent = state.mode === 'local-preview' ? '로컬 미리보기 · 이 컴퓨터의 테스트 기록만 표시됩니다.' : '';
      observeReveals(list);
      return true;
    } catch (error) { if (!append) renderEmpty('축하 글을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.'); $('#connection-status').textContent = error.message; $('#guestbook-retry').hidden = false; return false; }
    finally { list.setAttribute('aria-busy', 'false'); }
  }
  let allGuestsBefore = null;
  async function loadAllGuests(append = false) {
    const list = $('#guestbook-all-list'); const more = $('#guestbook-all-next');
    list.setAttribute('aria-busy', 'true'); more.disabled = true;
    if (!append) { list.replaceChildren(node('p', '', '축하 글을 불러오고 있습니다.')); allGuestsBefore = null; }
    try {
      const data = await api(`/guestbook?limit=12${append && allGuestsBefore ? `&before=${allGuestsBefore}` : ''}`);
      if (!append) list.replaceChildren();
      data.items.forEach(entry => list.append(guestCard(entry)));
      if (!list.childElementCount) list.append(node('p', '', '아직 남겨진 축하 글이 없습니다. 첫 마음을 남겨주세요.'));
      allGuestsBefore = data.nextBefore; more.hidden = !allGuestsBefore;
      observeReveals(list);
    } catch(error) {
      if (!append) list.replaceChildren(node('p', '', error.message));
      else toast(error.message);
    } finally { list.setAttribute('aria-busy', 'false'); more.disabled = false; }
  }
  $('#guestbook-more').addEventListener('click', () => { openDialog('#guestbook-all-dialog'); loadAllGuests(); });
  $('#guestbook-all-next').addEventListener('click', () => loadAllGuests(true));
  let connectionTask;
  function connect() {
    if (!connectionTask) connectionTask = connectOnce().finally(() => { connectionTask = null; });
    return connectionTask;
  }
  async function connectOnce() {
    if (isFilePreview) { renderEmpty('두 사람에게 따뜻한 축하의 마음을 남겨주세요.'); $('#connection-status').textContent = '파일 미리보기 · 실제 방명록 서버 미연결'; $('#local-status').hidden = false; return; }
    try {
      const health = await api('/health');
      if (health.ok !== true || !['local-preview','production'].includes(health.mode)) throw new Error('지원하지 않는 접수 서버입니다.');
      state.api = true; state.mode = health.mode;
      state.passwordProtocol = health.passwordProtocol || '';
      if (health.photoUpload === true) {
        $('#direct-upload').hidden = false;
        $('#guest-drive-fallback').hidden = true;
      }
      if (health.mode === 'local-preview') { $('#connection-status').textContent = '로컬 미리보기 · 이 컴퓨터의 테스트 기록만 표시됩니다.'; $('#local-status').hidden = false; }
      await loadGuests();
    } catch (_) {
      renderEmpty('두 사람에게 따뜻한 축하의 마음을 남겨주세요.');
      $('#connection-status').textContent = '접수 서버 연결 전입니다. 현재는 작성 화면만 확인할 수 있습니다.';
      $('#guestbook-retry').hidden = false;
      if (localHost) $('#local-status').hidden = false;
    }
  }
  $('#guestbook-retry').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await connect(); } finally { button.disabled = false; }
  });
  connect();
  function fieldError(id, message) { const input = $(`#${id}`); const error = $(`#${id}-error`); if (input) input.setAttribute('aria-invalid', String(!!message)); if (error) error.textContent = message; }
  function status(form, text, success = false) { const el = $('.form-status',form); el.textContent = text; el.classList.toggle('success',success); }
  $('#guest-message').addEventListener('input', event => { $('#message-counter').textContent = `${[...event.target.value].length} / 500`; });
  ['guest-name','guest-message','guest-password'].forEach(id => $(`#${id}`).addEventListener('input', () => fieldError(id,'')));
  $('#guestbook-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
    const name = data.name.trim(); const message = data.message.trim(); let firstError = null;
    for (const [id,error] of [['guest-name',name ? '' : '이름을 입력해 주세요.'],['guest-message',message ? '' : '내용을 입력해 주세요.'],['guest-password',data.password.length >= 4 ? '' : '비밀번호를 4자 이상 입력해 주세요.']]) {fieldError(id,error);if (error && !firstError) firstError = id;}
    if (firstError) { $(`#${firstError}`).focus(); return; }
    if (!state.api) { status(form, '접수 서버가 연결되지 않아 저장하지 않았습니다. 먼저 서버 연결을 확인해 주세요.'); return; }
    const button = $('.submit-button',form); button.disabled = true;
    try {
      await api('/guestbook','POST',{name,message,password:data.password,website:data.website||''});
      form.reset(); $('#message-counter').textContent='0 / 500'; await loadGuests();
      status(form,state.mode==='local-preview'?'이 컴퓨터의 미리보기 DB에 저장했습니다. 실제 하객용 사이트에는 반영되지 않습니다.':'축하의 마음을 남겨주셔서 감사합니다.',true);
    } catch(error) {status(form,error.message);} finally {button.disabled=false;}
  });
  $('#delete-form').addEventListener('submit', async event => {
    event.preventDefault(); const form=event.currentTarget; const button=$('.submit-button',form);button.disabled=true;
    try {await api(`/guestbook/${state.deleteId}/delete`,'POST',{password:form.elements.password.value});form.reset();$('#delete-dialog').close();await loadGuests();if ($('#guestbook-all-dialog').open) await loadAllGuests();toast('방명록을 삭제했습니다.');}catch(error){status(form,error.message);}finally{button.disabled=false;}
  });
  for (const [side,label] of [['groom','신랑측 계좌번호'],['bride','신부측 계좌번호']]) {
    const details=node('details');details.open=true;details.append(node('summary','',label));const body=node('div','account-body');const accounts=(config.accounts||[]).filter(item=>item.side===side && item.bank && item.number && item.holder);
    accounts.forEach(account=>{
      const row=node('div','account-row');
      const person=node('p','account-person');
      person.append(node('span','sr-only',`${account.role || (side==='groom'?'신랑측':'신부측')} `),node('strong','',account.holder));
      const number=node('span','account-number',account.number);number.dir='ltr';
      const bankline=node('p','account-bankline');
      bankline.append(node('span','account-bank',account.bank), node('span','', ' | '),number);
      row.append(bankline, person);
      const actions=node('div','account-actions');
      const button=node('button','account-copy');button.type='button';
      const copyLabel=()=> {
        const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'); icon.setAttribute('viewBox','0 0 16 16'); icon.setAttribute('aria-hidden','true');
        const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','M6 5h7v9H6zM10 5V2H3v9h3');icon.append(path);
        button.replaceChildren(icon,document.createTextNode('복사'));
      }; copyLabel();
      button.setAttribute('aria-label',`${account.holder} 계좌번호 복사`);
      let resetLabel;
      button.addEventListener('click',async()=>{
        if(await copy(account.number)) {
          clearTimeout(resetLabel);button.textContent='완료 ✓';
          resetLabel=window.setTimeout(copyLabel,2200);
        }
      });
      actions.append(button);
      if(account.kakaoPayUrl) {
        try {
          const url=new URL(account.kakaoPayUrl);
          if(url.protocol==='https:' && ['qr.kakaopay.com','link.kakaopay.com'].includes(url.hostname) && !url.username && !url.password) {
            const pay=node('a','account-pay');
            const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
            const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.2 4.8 6.6L6 21l4.1-2.6h1.9c5.5 0 10-3.4 10-7.6S17.5 3 12 3Z');icon.append(path);pay.append(icon,document.createTextNode('pay'));
            pay.href=url.href;pay.target='_blank';pay.rel='noopener noreferrer';
            pay.setAttribute('aria-label',`${account.holder}에게 카카오페이로 송금하기, 새 창`);actions.append(pay);
          }
        } catch (_) { /* An invalid optional link does not disable bank-account copying. */ }
      }
      row.append(actions);body.append(row);
    });
    details.classList.add('reveal');details.append(body);$('#account-list').append(details);
  }
  // Do not display empty bank-account placeholders to wedding guests.
  $$('#account-list details').forEach(item => { item.hidden = !$('.account-row', item); });
  $('#account').hidden = !$$('#account-list details').some(item => !item.hidden);
  for(const contact of (config.contacts||[])) {
    if(!/^[+\d\s-]+$/.test(contact.phone||''))continue;
    const row=node('div','contact-row');const name=node('p','',contact.name);name.prepend(node('small','',contact.role));const call=node('a','','전화하기');call.href=`tel:${contact.phone.replace(/[\s-]/g,'')}`;row.append(name,call);$('#contacts').append(row);
  }
  $('#contact-open').hidden=!$('#contacts').childElementCount;
  if (config.guestAlbumUrl) {
    try {
      const url = new URL(config.guestAlbumUrl);
      if (url.protocol === 'https:' && url.hostname === 'drive.google.com' && url.pathname.startsWith('/drive/folders/') && !url.username && !url.password) $('#guest-upload').href = url.href;
    } catch (_) { /* The restored, verified album link remains available. */ }
  }
  const guestFiles = $('#guest-files'), guestSend = $('#guest-send');
  const uploadTypes = {'heic':'image/heic','heif':'image/heif','mov':'video/quicktime','jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp','mp4':'video/mp4'};
  function selectedType(file) { return file.type || uploadTypes[file.name.split('.').at(-1).toLowerCase()] || ''; }
  guestFiles.addEventListener('change', () => {
    const files = [...guestFiles.files];
    $('#upload-selection').textContent = files.length ? `${files.length}개 선택 · ${files.map(file => file.name).join(', ')}` : '사진·영상을 선택해 주세요. 한 번에 5개까지 올릴 수 있습니다.';
    $('#upload-status').textContent = '';
    guestSend.disabled = !files.length || files.length > 5;
    if (files.length > 5) $('#upload-status').textContent = '한 번에 5개까지만 선택해 주세요.';
  });
  guestSend.addEventListener('click', async () => {
    if (!state.api || ![...guestFiles.files].length) return;
    const files = [...guestFiles.files];
    if (files.length > 5) return;
    guestSend.disabled = true;
    let sent = 0;
    for (const file of files) {
      const type = selectedType(file);
      const max = type.startsWith('video/') ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
      if (!type || !['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime'].includes(type) || file.size < 12 || file.size > max) {
        $('#upload-status').textContent = `${file.name}: 사진은 20MB, 영상은 50MB 이하의 JPG·PNG·WebP·HEIC·MP4·MOV 파일을 선택해 주세요.`;
        break;
      }
      $('#upload-status').textContent = `${sent + 1}/${files.length} 업로드 중 · ${file.name}`;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 120000);
      try {
        const response = await fetch(`${apiBase}/api/photos`, {method:'POST',body:file,headers:{'Content-Type':type,'Accept':'application/json'},credentials:'omit',cache:'no-store',signal:controller.signal});
        const result = await response.json();
        if (!response.ok || result.ok !== true) throw new Error(result.error || '파일을 전달하지 못했습니다.');
        sent++;
      } catch(error) {
        $('#upload-status').textContent = `${sent}개 완료 · ${file.name} 전송 상태를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.`;
        break;
      } finally { clearTimeout(timer); }
    }
    if (sent === files.length) {
      $('#upload-status').textContent = state.mode === 'local-preview' ? `${sent}개를 이 컴퓨터의 테스트 폴더에 저장했습니다.` : `${sent}개를 두 사람에게 전달했습니다. 고맙습니다.`;
      guestFiles.value = '';
      $('#upload-selection').textContent = '사진·영상을 선택해 주세요. 한 번에 5개까지 올릴 수 있습니다.';
    } else guestSend.disabled = false;
  });
  // All useful sections participate, including controls and dynamically built cards.
  $$('.section > .map-actions, .transport-list, .calendar-button, .gallery-guide, .guestbook-actions, .account-guide, .rsvp-card, .closing-photo, .ending > p, .ending > #share-link').forEach(el => el.classList.add('reveal'));
  observeReveals();
  const navLinks = $$('.quick-nav a');
  let navFrame = 0;
  function updateNav() {
    navFrame = 0;
    const current = navLinks.filter(link => $(link.hash)?.getBoundingClientRect().top <= innerHeight * .4).at(-1);
    navLinks.forEach(link => {
      if (link === current) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', () => { if (!navFrame) navFrame = requestAnimationFrame(updateNav); }, {passive:true});
  window.addEventListener('resize', updateNav); updateNav();
  // Audit information is explicit: a class-name inference is not a verified metric match.
  window.WEDDING_DIAGNOSTICS={version:config.version,photos:photos.length,lightbox:true,rsvpAutoOpen:false,introLoop:video?.loop ?? false,introGate:Boolean(introGate),introEnabled:media?.introEnabled !== false,introFadeInMs,introFadeOutMs,representativePhoto:42,fontFamilyEvidence:'Caveat / Gowun Dodum / Cormorant Garamond',fontsLoaded:false};
  if(document.fonts){Promise.all([document.fonts.load('16px "Gowun Dodum"'),document.fonts.load('16px "Gowun Batang"'),document.fonts.load('16px "Montserrat"'),document.fonts.load('16px "Cormorant Garamond"'),document.fonts.load('28px "Caveat"')]).then(lists=>{window.WEDDING_DIAGNOSTICS.fontsLoaded=lists.every(list=>list.length>0);}).catch(()=>{window.WEDDING_DIAGNOSTICS.fontsLoaded=false;});}
})();
