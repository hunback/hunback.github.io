/* Apply the shared proposal content when the editor supplies design-data.js.
 * The static HTML remains the fallback so the mobile preview works without it. */
'use strict';
(() => {
  const design = window.DESIGN_CONTENT;
  if (!design || typeof design !== 'object') return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const missing = value => value === undefined || value === null;
  const text = value => missing(value) ? '' : typeof value === 'string' ? value.trim() : String(value);
  const object = value => value && typeof value === 'object' ? value : {};
  const clamp = value => Math.min(1, Math.max(0, Number(value)));

  function setText(selector, value, root = document) {
    const element = $(selector, root);
    if (element && !missing(value)) element.textContent = text(value);
    return element;
  }

  function setLabel(selector, value, root = document) {
    const element = $(selector, root);
    if (!element || missing(value)) return element;
    const valueText = text(value);
    const decoration = [...element.children].find(child => child.getAttribute('aria-hidden') === 'true');
    element.replaceChildren(document.createTextNode(valueText));
    if (decoration) element.append(document.createTextNode(' '), decoration);
    return element;
  }

  function setLineBreakText(element, value) {
    if (!element || missing(value)) return;
    element.replaceChildren();
    text(value).split(/\n/).forEach((line, index) => {
      if (index) element.append(document.createElement('br'));
      element.append(document.createTextNode(line));
    });
  }

  function setParagraphs(element, value) {
    if (!element || missing(value)) return;
    const paragraphs = text(value).split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
    element.replaceChildren();
    if (!paragraphs.length) return;
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const p = document.createElement('p');
      setLineBreakText(p, paragraph);
      if (paragraphIndex) p.className = 'content-paragraph';
      element.append(p);
    });
  }

  function setPosition(element, position) {
    if (!element || !Array.isArray(position) || position.length < 2) return;
    const x = Number(position[0]);
    const y = Number(position[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    element.style.objectPosition = `${clamp(x) * 100}% ${clamp(y) * 100}%`;
  }

  function setMeta(selector, value) {
    const element = $(selector);
    if (element && !missing(value)) element.setAttribute('content', text(value));
    return element;
  }

  function localAsset(path, fallback) {
    const value = text(path).replaceAll('\\', '/');
    if (!value || /^(?:[a-z]+:)?\/\//i.test(value)) return fallback;
    const marker = value.indexOf('public/');
    const relative = marker >= 0 ? value.slice(marker + 'public/'.length) : value.replace(/^\.\//, '');
    if (!relative.startsWith('assets/')) return fallback;
    return relative;
  }

  function fullAssetPath(path, fallback) {
    const value = localAsset(path, fallback);
    return value.replace(/-small(\.[^/]+)$/, '$1');
  }

  const assetMap = { ...object(window.WEDDING_ASSET_MAP) };
  const galleryPositions = new Map();

  function mapPhotoAsset(id, path, position) {
    const full = fullAssetPath(path, '');
    if (!full || !Number.isFinite(Number(id))) return '';
    const source = localAsset(path, full);
    const small = /-small\.[^/]+$/.test(source) ? source : full;
    const stem = `assets/photos/photo-${String(id).padStart(2, '0')}`;
    assetMap[`${stem}.webp`] = full;
    assetMap[`${stem}-small.webp`] = small;
    if (Array.isArray(position) && position.length >= 2) {
      galleryPositions.set(full, position);
      galleryPositions.set(small, position);
    }
    return full;
  }

  function assetKey(source) {
    const value = text(source).replaceAll('\\', '/');
    try { return new URL(value, location.href).pathname.replace(/^\/+/, ''); }
    catch (_) { return value.replace(/^\/+/, ''); }
  }

  function applyGalleryPositions() {
    const gallery = $('#gallery-grid');
    if (!gallery || !galleryPositions.size) return;
    gallery.querySelectorAll('img').forEach(image => {
      const source = assetKey(image.getAttribute('src') || image.src);
      for (const [path, position] of galleryPositions) {
        const key = assetKey(path);
        if (source === key || source.endsWith(`/${key}`)) {
          setPosition(image, position);
          image.removeAttribute('srcset');
          image.removeAttribute('sizes');
          break;
        }
      }
    });
  }

  function observeGalleryPositions() {
    const gallery = $('#gallery-grid');
    if (!gallery || !galleryPositions.size) return;
    applyGalleryPositions();
    if ('MutationObserver' in window) new MutationObserver(applyGalleryPositions).observe(gallery, { childList: true, subtree: true });
  }

  function applyPhoto(selector, photo) {
    const image = $(selector);
    const value = object(photo);
    if (!image || !text(value.path)) return;
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    const source = localAsset(value.path, image.getAttribute('src') || '');
    image.src = source;
    const alt = text(value.alt) || text(value.label);
    if (alt) image.alt = alt;
    setPosition(image, value.position);
  }

  function applyGalleryContent(entries) {
    if (!Array.isArray(entries) || !entries.length) return false;
    const current = Array.isArray(window.WEDDING_PHOTOS) ? window.WEDDING_PHOTOS : [];
    const usedIds = new Set();
    const mapped = entries.map((entry, index) => {
      const value = object(entry);
      const base = object(current[index]);
      const sourceId = /(?:^|[\\/])photo-(\d{1,3})(?:-small)?\.[^/]+$/i.exec(text(value.path));
      const baseId = sourceId ? Number(sourceId[1]) : Number.isInteger(base.id) ? base.id : index + 1;
      let id = Number.isInteger(value.id) ? value.id : baseId;
      while (usedIds.has(id)) id += 1;
      usedIds.add(id);
      const fallbackPath = `assets/photos/photo-${String(baseId).padStart(2, '0')}.webp`;
      const path = localAsset(value.path, fallbackPath);
      mapPhotoAsset(id, path, value.position);
      return {
        id,
        alt: text(value.alt) || text(value.label) || text(base.alt) || '웨딩 사진',
        width: Number(value.width) || Number(base.width) || 1200,
        height: Number(value.height) || Number(base.height) || 1800,
        group: text(value.group) || text(value.label) || text(base.group) || '사진'
      };
    });
    window.WEDDING_PHOTOS = mapped;
    return true;
  }

  function applyParents(selector, value, name, title) {
    const element = $(selector);
    const parents = text(value);
    const person = text(name);
    if (!element || !parents || !person) return;
    const separator = parents.lastIndexOf('의 ');
    const family = separator > 0 ? parents.slice(0, separator).trim() : parents;
    const relation = separator > 0 ? parents.slice(separator).trim() : '';
    element.replaceChildren(document.createTextNode(family));
    if (family.includes('·')) {
      const pieces = family.split('·').map(item => item.trim());
      element.replaceChildren(document.createTextNode(pieces[0]));
      if (pieces[1]) {
        element.append(document.createElement('span'));
        element.lastElementChild.textContent = ' · ';
        element.append(document.createTextNode(pieces[1]));
      }
    }
    if (relation) {
      const small = document.createElement('small');
      small.textContent = relation;
      element.append(small);
    }
    const strong = document.createElement('strong');
    strong.textContent = person;
    element.append(strong);
    if (title) element.setAttribute('aria-label', `${parents} ${person}`);
  }

  function formatDate(date) {
    if (missing(date)) return undefined;
    if (!text(date)) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(date));
    if (!match) return undefined;
    return `${match[1]}.${match[2]}.${match[3]}`;
  }

  function formatKoreanTime(time) {
    if (missing(time)) return undefined;
    if (!text(time)) return '';
    const match = /^(\d{1,2}):(\d{2})$/.exec(text(time));
    if (!match) return undefined;
    const hour24 = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23 || minute > 59) return undefined;
    const period = hour24 < 12 ? '오전' : '오후';
    const hour12 = hour24 % 12 || 12;
    return `${period} ${hour12}시 ${match[2]}분`;
  }

  function formatKoreanDate(date, time) {
    if (missing(date)) return undefined;
    if (!text(date)) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(date));
    if (!match) return undefined;
    const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const timeLabel = formatKoreanTime(time);
    return `${Number(match[2])}월 ${Number(match[3])}일 ${weekdays[day]}요일${timeLabel ? ` · ${timeLabel}` : ''}`;
  }

  function applyMapLinks(ceremony) {
    const query = [ceremony.venue, ceremony.hall, ceremony.address].map(text).filter(Boolean).join(' ');
    if (!query) return;
    const maps = object(ceremony.maps || design.maps);
    const naver = text(maps.naver) || `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
    const lat = Number(maps.latitude ?? maps.lat);
    const lng = Number(maps.longitude ?? maps.lng);
    const kakao = text(maps.kakao) || (Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://map.kakao.com/link/map/${encodeURIComponent(text(ceremony.venue) || query)},${lat},${lng}`
      : `https://map.kakao.com/link/search/${encodeURIComponent(query)}`);
    const links = [...document.querySelectorAll('.map-actions a')];
    if (links[0]) links[0].href = naver;
    if (links[1]) links[1].href = kakao;
  }

  function applyMetadata(couple, ceremony, copy, links, hero) {
    const groom = text(couple.groom);
    const bride = text(couple.bride);
    const pageTitle = missing(copy.pageTitle) ? (groom && bride ? `${groom}과 ${bride}, 결혼합니다` : undefined) : copy.pageTitle;
    const place = [ceremony.venue, ceremony.hall].map(text).filter(Boolean).join(' · ');
    const dateLabel = formatKoreanDate(ceremony.date, ceremony.time);
    const hasDerivedDescription = Boolean(dateLabel || place || groom || bride);
    const description = missing(copy.metaDescription)
      ? (hasDerivedDescription ? ([dateLabel, place].filter(Boolean).join(' · ') + (groom && bride ? `. ${groom}과 ${bride}의 결혼식에 초대합니다.` : '')) : undefined)
      : copy.metaDescription;
    if (!missing(pageTitle)) {
      document.title = text(pageTitle);
      setMeta('meta[property="og:title"]', pageTitle);
    }
    if (!missing(description)) {
      setMeta('meta[name="description"]', description);
      setMeta('meta[property="og:description"]', description);
    }
    if (!missing(links.invitation)) setMeta('meta[property="og:url"]', links.invitation);
    const heroPath = localAsset(object(hero).path, '');
    const canonical = text(links.invitation);
    if (heroPath && canonical) {
      try { setMeta('meta[property="og:image"]', new URL(heroPath, canonical.endsWith('/') ? canonical : `${canonical}/`).href); }
      catch (_) { /* Keep the checked-in social image when the edited URL is invalid. */ }
    }
    if (!missing(copy.metaImageAlt)) setMeta('meta[property="og:image:alt"]', copy.metaImageAlt);
    else if (groom && bride) setMeta('meta[property="og:image:alt"]', `${groom}과 ${bride}의 결혼식 사진`);
  }

  const couple = object(design.couple);
  const ceremony = object(design.ceremony);
  const copy = object(design.copy);
  const links = object(design.links);
  const style = object(design.style);
  const mobileStyle = object(design.mobileStyle);
  const photos = object(design.photos);
  const media = object(design.media);
  window.WEDDING_MEDIA = media;
  applyGalleryContent(photos.gallery);
  // Optional copy.ui / copy.labels fields keep other visible labels editable
  // without requiring the editor to patch this app. Missing fields use HTML.
  const ui = { ...object(design.ui), ...object(copy.ui), ...object(copy.labels) };

  const root = document.documentElement;
  for (const [key, value] of Object.entries(style)) {
    if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)) root.style.setProperty(`--${key}`, value);
  }
  for (const [key, value] of Object.entries(mobileStyle)) {
    if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)) root.style.setProperty(`--mobile-${key}`, value);
  }
  const paper = text(mobileStyle.paper) || text(style.paper);
  const themeColor = $('meta[name="theme-color"]');
  if (themeColor && /^#[0-9a-f]{3,8}$/i.test(paper)) themeColor.content = paper;

  const groom = text(couple.groom);
  const bride = text(couple.bride);
  const groomEn = text(couple.groomEn);
  const brideEn = text(couple.brideEn);
  const title = $('.cover-title');
  if (title && (groomEn || brideEn)) {
    title.replaceChildren(document.createTextNode(groomEn || 'hunback'));
    title.append(document.createElement('br'));
    const second = document.createElement('span');
    const heart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    heart.setAttribute('viewBox', '0 0 24 22');
    heart.setAttribute('aria-hidden', 'true');
    heart.classList.add('cover-heart');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('cover-heart-line');
    path.setAttribute('d', 'M12.1 19.5C9.6 17.2 3.3 13 2.8 8.5 2.5 5.8 4.4 3.8 7.1 4.1c2.2.2 4 1.7 5 3.8 1.2-2.3 3.1-3.8 5.5-3.7 2.8.1 4.6 2.4 3.7 5.2-1.3 4.1-6.4 8.2-9.2 10.1Z');
    const detail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    detail.classList.add('cover-heart-detail');
    detail.setAttribute('d', 'M4.6 8.2C4.3 6.5 5.4 5.2 7 5.3');
    heart.append(path, detail);
    second.append(heart, document.createTextNode(' ' + (brideEn || 'Jiwoo')));
    title.append(second);
  }
  const cover = $('.cover');
  if (cover && (groom || bride)) cover.setAttribute('aria-label', `${groom} ${bride} 결혼식 초대`);
  setLineBreakText($('.closing-overlay p'), copy.endingOverlay);
  const endingNames = $('.closing-overlay small');
  if (endingNames && (groom || bride)) endingNames.textContent = [groom, bride].filter(Boolean).join(' · ');
  setText('.profile-groom .profile-name', groom);
  setText('.profile-bride .profile-name', bride);
  setText('.profile-groom .profile-name-en', groomEn);
  setText('.profile-bride .profile-name-en', brideEn);

  const letterCopy = $('.letter-copy');
  setParagraphs(letterCopy, copy.greeting);
  setText('.letter .section-index', copy.invitationLabel);
  setText('.letter h2', copy.invitationTitle);
  setText('.scripture-quote p', copy.scripture);
  setText('.scripture-quote cite', copy.scriptureSource);
  setText('.closing-message', copy.closing);
  setText('.gallery h2', copy.galleryTitle);
  setText('.account-guide', copy.accountNote);

  const optionalText = {
    ceremonyTitle: '#ceremony h2',
    locationTitle: '#location h2',
    galleryTitle: '#gallery h2',
    galleryDescription: '#gallery .section-description',
    galleryGuide: '.gallery-guide',
    guestbookTitle: '#guestbook h2',
    guestbookDescription: '#guestbook .section-description',
    guestPhotosTitle: '#guest-photos h2',
    guestPhotosDescription: '#guest-photos .section-description',
    accountTitle: '#account h2',
    accountDescription: '#account .section-description',
    accountNote: '.account-guide',
    guestbookButton: '#guestbook-open',
    guestUploadButton: '#guest-upload',
    guestUploadNote: '.upload-note',
    addressCopyButton: '#copy-address',
    shareButton: '#share-link',
    coverNote: '.cover-note',
    groomProfile: '#groom-profile-copy',
    brideProfile: '#bride-profile-copy',
    localStatus: '#local-status',
    introSkip: '#intro-skip',
    introRetry: '#intro-retry',
    uploadHelpTitle: '.upload-help summary'
  };
  for (const [key, selector] of Object.entries(optionalText)) {
    const value = ui[key] ?? copy[key];
    if (value === undefined) continue;
    const buttonLike = ['guestbookButton', 'guestUploadButton', 'addressCopyButton', 'shareButton', 'introSkip', 'introRetry'].includes(key);
    const element = $(selector);
    if (element && ['groomProfile', 'brideProfile'].includes(key)) setLineBreakText(element, value);
    else (buttonLike ? setLabel : setText)(selector, value);
  }

  const dateNumeric = formatDate(ceremony.date);
  const dateKorean = formatKoreanDate(ceremony.date, ceremony.time);
  setText('.cover-date-top', dateNumeric);
  setText('.cover-date', dateKorean);
  const hasVenue = !missing(ceremony.venue) || !missing(ceremony.hall);
  setText('.cover-venue', hasVenue ? [text(ceremony.venue), text(ceremony.hall)].filter(Boolean).join(' · ') : undefined);
  setText('.ceremony-date', dateNumeric);
  const ceremonyDate = $('.ceremony-date');
  if (ceremonyDate && dateNumeric) {
    ceremonyDate.replaceChildren(document.createTextNode(dateNumeric.replaceAll('.', '. ')));
    const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(dateNumeric);
    if (match) ceremonyDate.textContent = `${match[1]}. ${match[2]}. ${match[3]}.`;
    const date = new Date(Date.UTC(Number(match?.[1] || 0), Number(match?.[2] || 1) - 1, Number(match?.[3] || 1)));
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getUTCDay()];
    const span = document.createElement('span');
    span.textContent = weekday ? ` ${weekday}요일` : '';
    ceremonyDate.append(span);
  }
  setText('.ceremony .muted', formatKoreanTime(ceremony.time));
  setText('.address', ceremony.address);

  const subway = text(ceremony.subway);
  const station = $('.station-card');
  if (station && !missing(ceremony.subway)) {
    if (!subway) {
      setText('.station-card strong', '');
      setText('.station-card p', '');
    }
    const [stationName, walk] = subway.split('·').map(item => item.trim());
    const badge = $('.station-badge', station);
    const line = stationName.match(/\d+/)?.[0];
    if (badge && line) badge.textContent = line;
    setText('.station-card strong', stationName.replace(/^\d+호선\s*/, ''), station);
    setText('.station-card p', walk || '', station);
  }
  setLineBreakText($('.transport-subway p'), ceremony.subway);
  setLineBreakText($('.transport-bus p'), ceremony.bus);
  setLineBreakText($('.transport-driving p'), ceremony.driving);
  setLineBreakText($('.transport-parking p'), ceremony.parking);

  applyParents('.family-lines p:first-child', couple.groomParents, groom, 'groom');
  applyParents('.family-lines p:last-child', couple.brideParents, bride, 'bride');
  applyPhoto('.cover-hero img', photos.mobileHero);
  applyPhoto('#ceremony-photo img', photos.mobileScarf);
  applyPhoto('#mobile-album-left-image', photos.mobileAlbumLeft);
  applyPhoto('#mobile-album-detail-image', photos.mobileAlbumDetail);
  applyPhoto('#mobile-album-right-image', photos.mobileAlbumRight);
  applyPhoto('#groom-profile-image', photos.groomProfile);
  applyPhoto('#bride-profile-image', photos.brideProfile);
  applyPhoto('#closing-photo img', photos.mobileEnding);
  if (Object.keys(assetMap).length) window.WEDDING_ASSET_MAP = assetMap;
  observeGalleryPositions();

  const config = window.WEDDING_CONFIG;
  if (config && (text(ceremony.date) || text(ceremony.time))) {
    config.weddingDate = `${text(ceremony.date)}T${text(ceremony.time) || '12:30'}:00+09:00`;
  }
  if (config) {
    const localPreview = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || window.WEDDING_OFFLINE_PREVIEW === true;
    if (localPreview) config.apiBase = '';
    if (text(ceremony.address)) config.address = text(ceremony.address);
    if (text(ceremony.venue)) config.venue = text(ceremony.venue);
    if (text(ceremony.hall)) config.hall = text(ceremony.hall);
    if (text(links.invitation)) config.canonicalUrl = text(links.invitation);
    if (text(links.guestAlbum)) config.guestAlbumUrl = text(links.guestAlbum);
  }

  applyMetadata(couple, ceremony, copy, links, photos.mobileHero);
  applyMapLinks(ceremony);

  window.MOBILE_CONTENT_APPLIED = true;
})();
