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
    const query = item.source === 'mybox' ? `myboxId=${encodeURIComponent(item.myboxId)}` : `key=${encodeURIComponent(item.key)}`;
    const response = await request(`/admin/photos/file?${query}`, {headers: {Accept: item.type}});
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
  let gallery=[],galleryVersion=0,dirty=false,busy=false;
  const galleryStatus=message=>{$('#gallery-status').textContent=message;};
  const galleryUrl=p=>p.preview||(p.src.startsWith('/api/')?API.replace(/\/api$/,'')+p.src:'https://hunback.github.io/'+p.src);
  function movePhoto(index,target){if(target<0||target>=gallery.length)return;gallery.splice(target,0,gallery.splice(index,1)[0]);dirty=true;drawGallery();}
  function drawGallery(){
    const list=$('#gallery-items');list.replaceChildren();
    gallery.forEach((photo,index)=>{
      const article=document.createElement('article');article.className='photo-card';
      const img=new Image();img.src=galleryUrl(photo);img.alt=photo.alt;img.loading='lazy';img.style.cssText='width:100%;height:200px;object-fit:contain';
      const controls=document.createElement('div');controls.className='photo-info';
      const label=document.createElement('label');label.textContent=`${index%2?'오른쪽':'왼쪽'} · 위치 `;
      const order=document.createElement('input');order.type='number';order.min=1;order.max=gallery.length;order.value=index+1;order.style.width='60px';order.setAttribute('aria-label',`사진 ${index+1} 위치`);order.onchange=()=>movePhoto(index,Number(order.value)-1);label.append(order);controls.append(label);
      for(const [name,action] of [['앞으로',()=>movePhoto(index,index-1)],['뒤로',()=>movePhoto(index,index+1)],['갤러리에서 삭제',()=>{gallery.splice(index,1);dirty=true;drawGallery();}]]){
        const button=document.createElement('button');button.type='button';button.className='download';button.textContent=name;button.disabled=(name==='앞으로'&&index===0)||(name==='뒤로'&&index===gallery.length-1);button.onclick=action;controls.append(button);
      }
      article.append(img,controls);list.append(article);
    });galleryStatus(`${gallery.length}장${dirty?' · 저장하지 않은 변경 사항이 있습니다.':''}`);
  }
  async function loadGallery(){
    if(busy)return;
    try{const data=await(await request('/gallery')).json();gallery=data.items;galleryVersion=data.version;dirty=false;drawGallery();}catch(e){galleryStatus(e.message);}
  }
  function tab(name){$('#gallery-editor').hidden=name!=='gallery';$('#guest-archive').hidden=name==='gallery';$('#tab-gallery').setAttribute('aria-pressed',String(name==='gallery'));$('#tab-photos').setAttribute('aria-pressed',String(name!=='gallery'));if(name==='gallery'&&!dirty)loadGallery();}
  $('#tab-gallery').onclick=()=>tab('gallery');$('#tab-photos').onclick=()=>tab('photos');
  $('#gallery-reset').onclick=()=>{if(!dirty||confirm('저장하지 않은 변경을 취소하고 마지막 저장 상태로 돌아갈까요?'))loadGallery();};
  $('#gallery-files').onchange=async event=>{
    if(busy)return;busy=true;$('#gallery-save').disabled=true;event.target.disabled=true;
    try{for(const file of event.target.files){
      if(gallery.length>=150)throw Error('갤러리는 150장까지 저장할 수 있습니다.');
      galleryStatus(`${file.name} 업로드 중…`);
      const preview=URL.createObjectURL(file),img=new Image();img.src=preview;await img.decode();
      let data;try{data=await(await request('/admin/gallery/upload',{method:'POST',headers:{'Content-Type':file.type},body:file})).json();}catch(e){URL.revokeObjectURL(preview);throw e;}
      gallery.push({src:data.src,alt:file.name.replace(/\.[^.]+$/,''),width:img.naturalWidth,height:img.naturalHeight,preview});dirty=true;
    }drawGallery();}catch(e){galleryStatus(e.message);}finally{busy=false;event.target.disabled=false;event.target.value='';$('#gallery-save').disabled=false;}
  };
  $('#gallery-save').onclick=async()=>{
    if(busy)return;busy=true;$('#gallery-save').disabled=true;
    try{const data=await(await request('/admin/gallery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:galleryVersion,items:gallery.map(({preview,...p})=>p)})})).json();galleryVersion=data.version;dirty=false;drawGallery();galleryStatus('저장했습니다. 공개 청첩장을 새로 열면 반영됩니다.');}catch(e){galleryStatus(e.message);}finally{busy=false;$('#gallery-save').disabled=false;}
  };
  window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
  const saved = sessionStorage.getItem('wedding-admin-token'); if (saved) unlock(saved);
})();
