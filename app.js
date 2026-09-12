'use strict';
(() => {
  const config = window.WEDDING_CONFIG || {};
  const photos = window.WEDDING_PHOTOS || [];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { api: false, mode: 'offline', before: null, galleryCount: 0, deleteId: null, toastTimer: null, requestId: null };
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
    try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); }
    catch (_) {
      const area = node('textarea'); area.value = text; area.setAttribute('readonly', '');
      area.style.position = 'fixed'; area.style.left = '-9999px'; document.body.append(area); area.select();
      const done = document.execCommand('copy'); area.remove(); toast(done ? '복사했습니다.' : '복사할 내용을 길게 눌러 선택해 주세요.');
    }
  }
  async function api(path, method = 'GET', payload) {
    if (isFilePreview) throw new Error('파일 미리보기에서는 전송되지 않습니다. Start.command로 로컬 서버를 실행해 주세요.');
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
    if (id === '#guestbook-dialog' || id === '#rsvp-dialog') {
      const status = $('.form-status', dialog);
      if (!state.api) status.textContent = '접수 서버 미연결 상태입니다. 작성 화면만 확인할 수 있으며 실제 전송은 되지 않습니다.';
      else if (state.mode === 'local-preview') status.textContent = '로컬 확인용입니다. 작성 내용은 이 컴퓨터에만 저장됩니다.';
    }
    dialog.showModal();
  }
  $$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
  });
  // No automatic RSVP code: there is precisely one user-triggered opening path.
  $('#rsvp-open').addEventListener('click', () => openDialog('#rsvp-dialog'));
  $('#guestbook-open').addEventListener('click', () => openDialog('#guestbook-dialog'));
  $('#contact-open').addEventListener('click', () => openDialog('#contact-dialog'));

  // A single, required opening sequence: 1.5s fade-in, one video pass, then 1.5s fade-out to the hero image.
  const video = $('#intro-video'); const introGate = $('#intro-gate'); const retry = $('#intro-retry');
  function finishIntro() {
    let finished = false;
    const removeGate = () => { if (finished) return; finished = true; introGate.hidden = true; document.body.classList.remove('intro-active'); };
    introGate.classList.add('is-leaving');
    introGate.addEventListener('transitionend', event => { if (event.target === introGate) removeGate(); }, { once: true });
    window.setTimeout(removeGate, 1550); // Also completes when reduced-motion disables CSS transitions.
  }
  async function playIntro() {
    retry.hidden = true;
    try { video.currentTime = 0; await video.play(); }
    catch (_) { retry.hidden = false; }
  }
  video.addEventListener('ended', finishIntro);
  video.addEventListener('error', () => { retry.hidden = false; });
  retry.addEventListener('click', playIntro);
  window.setTimeout(playIntro, 1500);

  // Block image UI enlargement, not text accessibility zoom or normal vertical scrolling.
  document.addEventListener('dblclick', event => { if (event.target.closest('.protected-media')) event.preventDefault(); });
  document.addEventListener('contextmenu', event => { if (event.target.closest('.protected-media')) event.preventDefault(); });
  document.addEventListener('dragstart', event => { if (event.target.closest('.protected-media')) event.preventDefault(); });
  document.addEventListener('touchstart', event => { if (event.touches.length > 1 && event.target.closest('.protected-media')) event.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', event => { if (event.target.closest('.protected-media')) event.preventDefault(); }, { passive: false });

  // Gentle single-use reveals; content remains visible if JS or IntersectionObserver fails.
  if (!reduced.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.remove('is-pending'); entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: .05, rootMargin: '0px 0px 20px 0px' });
    $$('.reveal').forEach(el => { if (el.getBoundingClientRect().top > innerHeight) el.classList.add('is-pending'); observer.observe(el); });
    reduced.addEventListener('change', () => { if (reduced.matches) { observer.disconnect(); $$('.is-pending').forEach(el => el.classList.remove('is-pending')); } });
  }

  // December 2026: 1st Tuesday, wedding on Saturday the 19th.
  const calendar = $('#calendar');
  ['일', '월', '화', '수', '목', '금', '토'].forEach((day, index) => { const el = node('span', `weekday ${index === 0 ? 'sunday' : ''}`, day); el.setAttribute('role', 'columnheader'); calendar.append(el); });
  const first = new Date(Date.UTC(2026, 11, 1)).getUTCDay();
  for (let cell = 0; cell < 35; cell++) {
    const date = cell - first + 1; const valid = date >= 1 && date <= 31;
    const el = node('span', `${cell % 7 === 0 ? 'sunday' : ''} ${date === 19 ? 'wedding-day' : ''}`, valid ? String(date) : ''); el.setAttribute('role', 'cell');
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
  $('#share-link').addEventListener('click', () => copy(config.canonicalUrl));

  function openPhoto(photo) {
    const stem = `assets/photos/photo-${String(photo.id).padStart(2,'0')}`;
    const image = $('#photo-dialog-image');
    image.src = asset(`${stem}.webp`); image.alt = photo.alt;
    $('#photo-dialog-caption').textContent = photo.group;
    $('#photo-dialog').showModal();
  }

  function renderMorePhotos() {
    const end = Math.min(state.galleryCount + 8, photos.length); const grid = $('#gallery-grid');
    for (let index = state.galleryCount; index < end; index++) {
      const photo = photos[index];
      const groupStart = index === 0 || photo.group !== photos[index - 1].group;
      if (groupStart) grid.append(node('h3', 'group-label', photo.group));
      const figure = node('figure', `${groupStart || photo.width > photo.height ? 'featured' : ''}`);
      const button = node('button', 'gallery-photo protected-media reveal'); button.type = 'button';
      button.setAttribute('aria-label', `${photo.alt} 크게 보기`);
      const img = node('img'); const stem = `assets/photos/photo-${String(photo.id).padStart(2,'0')}`; img.src = asset(`${stem}-small.webp`);
      if (!window.WEDDING_ASSET_MAP) img.srcset = `${stem}-small.webp 560w, ${stem}.webp 1200w`;
      img.sizes = photo.width > photo.height ? '(max-width: 430px) 92vw, 396px' : '(max-width: 430px) 44vw, 194px';
      img.alt = photo.alt; img.width = photo.width; img.height = photo.height; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
      button.append(img); button.addEventListener('click', () => openPhoto(photo)); figure.append(button); grid.append(figure);
    }
    state.galleryCount = end; $('#gallery-more').hidden = end >= photos.length;
    $('#photo-counter').textContent = `${end} / ${photos.length}`;
  }
  $('#gallery-more').addEventListener('click', renderMorePhotos); renderMorePhotos();

  function renderEmpty(message) {
    const card = node('article', 'guest-card empty-card'); const flower = flowerIcon();
    card.append(flower, node('p', '', message)); $('#guestbook-list').replaceChildren(card); $('#guestbook-list').setAttribute('aria-busy', 'false');
  }
  function flowerIcon() {
    const span = node('span', 'flower'); span.setAttribute('aria-hidden','true');
    const NS='http://www.w3.org/2000/svg'; const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('viewBox','0 0 32 32');
    for(let i=0;i<5;i++) { const c=document.createElementNS(NS,'circle'); const a=(i*72-90)*Math.PI/180;
      c.setAttribute('cx',String(16+6*Math.cos(a))); c.setAttribute('cy',String(16+6*Math.sin(a))); c.setAttribute('r','6.3'); c.setAttribute('fill','#92759f'); svg.append(c); }
    const dot=document.createElementNS(NS,'circle'); dot.setAttribute('cx','16');dot.setAttribute('cy','16');dot.setAttribute('r','2.5');dot.setAttribute('fill','#fcfaf7');svg.append(dot);span.append(svg);return span;
  }
  function guestCard(entry) {
    const card = node('article', 'guest-card'); card.dataset.id = entry.id;
    const flower = flowerIcon();
    const remove = node('button', 'guest-delete', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `${entry.name}님의 방명록 삭제`);
    remove.addEventListener('click', () => { state.deleteId = entry.id; $('#delete-form').reset(); openDialog('#delete-dialog'); });
    const author = node('p', 'guest-author', `From. ${entry.name}`);
    const date = new Date(entry.createdAt); const formatted = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
    author.append(node('span', 'guest-date', formatted)); card.append(remove, flower, node('p','guest-message',entry.message), author); return card;
  }
  async function loadGuests(append = false) {
    const list = $('#guestbook-list'); list.setAttribute('aria-busy', 'true');
    try {
      const data = await api(`/guestbook?limit=3${append && state.before ? `&before=${state.before}` : ''}`);
      if (!append) list.replaceChildren();
      data.items.forEach(entry => list.append(guestCard(entry)));
      if (!list.childElementCount) renderEmpty('아직 남겨진 축하 글이 없습니다. 첫 마음을 남겨주세요.');
      state.before = data.nextBefore; $('#guestbook-more').hidden = !data.nextBefore;
    } catch (error) { if (!append) renderEmpty('축하 글을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'); $('#connection-status').textContent = error.message; }
    finally { list.setAttribute('aria-busy', 'false'); }
  }
  $('#guestbook-more').addEventListener('click', async event => { event.currentTarget.disabled = true; await loadGuests(true); event.currentTarget.disabled = false; });
  async function connect() {
    if (isFilePreview) { renderEmpty('두 사람에게 따뜻한 축하의 마음을 남겨주세요.'); $('#connection-status').textContent = '파일 미리보기 · 실제 방명록 서버 미연결'; $('#local-status').hidden = false; return; }
    try {
      const health = await api('/health');
      if (health.ok !== true || !['local-preview','production'].includes(health.mode)) throw new Error('지원하지 않는 접수 서버입니다.');
      state.api = true; state.mode = health.mode;
      state.passwordProtocol = health.passwordProtocol || '';
      if (health.mode === 'local-preview') { $('#connection-status').textContent = '로컬 미리보기 · 이 컴퓨터의 테스트 기록만 표시됩니다.'; $('#local-status').hidden = false; }
      await loadGuests();
    } catch (_) {
      renderEmpty('두 사람에게 따뜻한 축하의 마음을 남겨주세요.');
      $('#connection-status').textContent = '접수 서버 연결 전입니다. 현재는 작성 화면만 확인할 수 있습니다.';
      if (localHost) $('#local-status').hidden = false;
    }
  }
  connect();
  function fieldError(id, message) { const input = $(`#${id}`); const error = $(`#${id}-error`); if (input) input.setAttribute('aria-invalid', String(!!message)); if (error) error.textContent = message; }
  function status(form, text, success = false) { const el = $('.form-status',form); el.textContent = text; el.classList.toggle('success',success); }
  $('#guest-message').addEventListener('input', event => { $('#message-counter').textContent = `${[...event.target.value].length} / 500`; });
  ['guest-name','guest-message','guest-password','rsvp-name','rsvp-consent'].forEach(id => $(`#${id}`).addEventListener('input', () => fieldError(id,'')));
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
    try {await api(`/guestbook/${state.deleteId}/delete`,'POST',{password:form.elements.password.value});form.reset();$('#delete-dialog').close();await loadGuests();toast('방명록을 삭제했습니다.');}catch(error){status(form,error.message);}finally{button.disabled=false;}
  });
  $$('#rsvp-form input[name=attendance]').forEach(radio => radio.addEventListener('change',() => {const no=$('#rsvp-form input[name=attendance]:checked').value==='no';$('#rsvp-attending-fields').hidden=no;$$('input,select', $('#rsvp-attending-fields')).forEach(el=>el.disabled=no);}));
  function requestId() { return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=crypto.getRandomValues(new Uint8Array(1))[0]&15;return (c==='x'?r:((r&3)|8)).toString(16);}); }
  $('#rsvp-form').addEventListener('submit', async event => {
    event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form));
    const name=data.name.trim();const consent=$('#rsvp-consent').checked;
    fieldError('rsvp-name',name?'':'성함을 입력해 주세요.');fieldError('rsvp-consent',consent?'':'정보 수집 및 이용 동의가 필요합니다.');
    if(!name){$('#rsvp-name').focus();return;}if(!consent){$('#rsvp-consent').focus();return;}
    if(!state.api){status(form,'접수 서버가 연결되지 않아 참석 의사를 전송하지 않았습니다.');return;}
    const button=$('.submit-button',form);button.disabled=true;state.requestId ||= requestId();
    try {
      const result=await api('/rsvp','POST',{name,side:data.side,attendance:data.attendance,count:data.attendance==='yes'?Number(data.count):0,meal:data.attendance==='yes'?data.meal:'no',note:data.note.trim(),consent:true,website:data.website||'',requestId:state.requestId});
      status(form,state.mode==='local-preview'?'로컬 미리보기 DB에 저장했습니다. 신랑·신부에게 실제 전송된 것은 아닙니다.':'참석 의사를 전달했습니다. 감사합니다.',true);
      state.requestId=null;form.reset();$('#rsvp-attending-fields').hidden=false;$$('#rsvp-attending-fields input,#rsvp-attending-fields select').forEach(el=>el.disabled=false);
    } catch(error){status(form,error.message);}finally{button.disabled=false;}
  });

  for (const [side,label] of [['groom','신랑측 계좌번호'],['bride','신부측 계좌번호']]) {
    const details=node('details');details.append(node('summary','',label));const body=node('div','account-body');const accounts=(config.accounts||[]).filter(item=>item.side===side);
    if(!accounts.length)body.append(node('p','','계좌 정보가 아직 입력되지 않았습니다.'));
    accounts.forEach(account=>{const row=node('div','account-row');row.append(node('p','',`${account.bank} ${account.number}`),node('p','',account.holder));const button=node('button','text-button','계좌번호 복사');button.type='button';button.addEventListener('click',()=>copy(account.number));row.append(button);body.append(row);});
    details.append(body);$('#account-list').append(details);
  }
  // Do not display empty bank-account placeholders to wedding guests.
  $$('#account-list details').forEach(item => { item.hidden = !$('.account-row', item); });
  $('#account').hidden = !$$('#account-list details').some(item => !item.hidden);
  for(const contact of (config.contacts||[])) {
    if(!/^[+\d\s-]+$/.test(contact.phone||''))continue;
    const row=node('div','contact-row');const name=node('p','',contact.name);name.prepend(node('small','',contact.role));const call=node('a','','전화하기');call.href=`tel:${contact.phone.replace(/[\s-]/g,'')}`;row.append(name,call);$('#contacts').append(row);
  }
  $('#contact-open').hidden=!$('#contacts').childElementCount;
  // Audit information is explicit: a class-name inference is not a verified metric match.
  window.WEDDING_DIAGNOSTICS={version:config.version,photos:photos.length,lightbox:true,rsvpAutoOpen:false,introLoop:video.loop,introGate:true,introFadeMs:1500,fontFamilyEvidence:'user-approved similarity palette: Gowun Dodum / Gowun Batang / Montserrat / Cormorant Garamond / Allura',fontsLoaded:false};
  if(document.fonts){Promise.all([document.fonts.load('16px "Gowun Dodum"'),document.fonts.load('16px "Gowun Batang"'),document.fonts.load('16px "Montserrat"'),document.fonts.load('16px "Cormorant Garamond"'),document.fonts.load('24px "Allura"')]).then(lists=>{window.WEDDING_DIAGNOSTICS.fontsLoaded=lists.every(list=>list.length>0);}).catch(()=>{window.WEDDING_DIAGNOSTICS.fontsLoaded=false;});}
})();
