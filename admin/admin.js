'use strict';
(() => {
  const API = ['localhost','127.0.0.1','[::1]'].includes(location.hostname)
    ? 'http://127.0.0.1:8787/api'
    : 'https://hunback-wedding-api.hunback2315.workers.dev/api';
  const $ = selector => document.querySelector(selector);
  const state = {token: '', cursor: null, items: [], urls: []};
  const formatSize = bytes => {
    if (!Number.isFinite(bytes) || bytes < 1) return '0 B';
    const units = ['B','KB','MB','GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
  };
  const request = async (path, options = {}) => {
    const response = await fetch(API + path, {cache: 'no-store', credentials: 'omit', ...options, headers: {Authorization: `Bearer ${state.token}`, Accept: 'application/json', ...options.headers}});
    if (response.status === 401) throw new Error('관리자 비밀번호가 맞지 않습니다.');
    if (!response.ok) {
      let message = '보관함을 불러오지 못했습니다.';
      try { message = (await response.json()).error || message; } catch (_) {}
      throw new Error(message);
    }
    return response;
  };
  const revokeUrls = () => { state.urls.forEach(URL.revokeObjectURL); state.urls = []; };
  const summary = () => {
    $('#total-count').textContent = state.items.length;
    $('#photo-count').textContent = state.items.filter(item => item.type.startsWith('image/')).length;
    $('#video-count').textContent = state.items.filter(item => item.type.startsWith('video/')).length;
    $('#total-size').textContent = formatSize(state.items.reduce((sum, item) => sum + item.size, 0));
  };
  const download = async (item, preview = false) => {
    const response = await request(`/admin/photos/file?key=${encodeURIComponent(item.key)}`, {headers: {Accept: item.type}});
    const url = URL.createObjectURL(await response.blob());
    state.urls.push(url);
    if (preview) return url;
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = item.name; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => { URL.revokeObjectURL(url); state.urls = state.urls.filter(value => value !== url); }, 1500);
  };
  const card = item => {
    const article = document.createElement('article'); article.className = 'photo-card';
    const preview = document.createElement('div'); preview.className = 'preview'; preview.textContent = item.type.startsWith('video/') ? '영상' : '사진 불러오는 중';
    if (item.type.startsWith('image/')) download(item, true).then(url => { const image = new Image(); image.alt = '하객이 올린 사진'; image.src = url; preview.replaceChildren(image); }).catch(() => { preview.textContent = '미리보기 없음'; });
    const info = document.createElement('div'); info.className = 'photo-info';
    const name = document.createElement('p'); name.className = 'photo-name'; name.textContent = item.name;
    const meta = document.createElement('p'); meta.className = 'photo-meta';
    const date = item.uploadedAt ? new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.uploadedAt)) : '업로드 시각 없음';
    const saved = item.optimized && item.originalSize > item.size ? ` · ${Math.round((1 - item.size / item.originalSize) * 100)}% 절감` : '';
    meta.textContent = `${date} · ${formatSize(item.size)}${saved}`;
    const button = document.createElement('button'); button.className = 'download'; button.type = 'button'; button.textContent = '다운로드';
    button.addEventListener('click', async () => { button.disabled = true; try { await download(item); } catch (error) { $('#list-status').textContent = error.message; } finally { button.disabled = false; } });
    info.append(name, meta, button); article.append(preview, info); return article;
  };
  async function load(append = false) {
    $('#list-status').textContent = '파일을 불러오고 있습니다.';
    try {
      const query = append && state.cursor ? `?cursor=${encodeURIComponent(state.cursor)}` : '';
      const data = await (await request('/admin/photos' + query)).json();
      if (!append) { revokeUrls(); state.items = []; $('#photo-list').replaceChildren(); }
      state.items.push(...data.items); data.items.forEach(item => $('#photo-list').append(card(item)));
      state.cursor = data.cursor; $('#load-more').hidden = !state.cursor; summary();
      $('#list-status').textContent = state.items.length ? `최근 파일 ${state.items.length}개를 표시하고 있습니다.` : '아직 올라온 사진이나 영상이 없습니다.';
    } catch (error) {
      $('#list-status').textContent = error.message;
      if (/비밀번호/.test(error.message)) lock(error.message);
    }
  }
  function unlock(token) {
    state.token = token; sessionStorage.setItem('wedding-admin-token', token);
    $('#login-panel').hidden = true; $('#dashboard').hidden = false; $('#logout').hidden = false; load();
  }
  function lock(message = '') {
    state.token = ''; state.cursor = null; state.items = []; revokeUrls(); sessionStorage.removeItem('wedding-admin-token');
    $('#dashboard').hidden = true; $('#logout').hidden = true; $('#login-panel').hidden = false; $('#login-status').textContent = message;
  }
  $('#login-form').addEventListener('submit', event => { event.preventDefault(); const token = new FormData(event.currentTarget).get('token').trim(); $('#login-status').textContent = ''; unlock(token); });
  $('#logout').addEventListener('click', () => lock());
  $('#refresh').addEventListener('click', () => load());
  $('#load-more').addEventListener('click', () => load(true));
  window.addEventListener('pagehide', revokeUrls);
  const saved = sessionStorage.getItem('wedding-admin-token'); if (saved) unlock(saved);
})();
