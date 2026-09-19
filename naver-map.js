'use strict';
(() => {
  const container = document.getElementById('naver-map');
  if (!container) return;
  const content = window.DESIGN_CONTENT || {};
  const settings = content.naverMap || {};
  const ceremony = content.ceremony || {};
  const query = [ceremony.venue, ceremony.address].filter(Boolean).join(' ');
  const url = ceremony.maps?.naver || `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
  const route = document.createElement('a');
  route.href = 'assets/maps/terrace-location.pdf';
  route.target = '_blank';
  route.rel = 'noopener noreferrer';
  route.className = 'outline-button';
  route.style.marginTop = '12px';
  route.style.width = '100%';
  route.textContent = '약도 보기';
  container.parentElement.after(route);
  const key = String(settings.clientId || '').trim();
  function fallback(message) {
    container.replaceChildren();
    container.style.display = 'grid';
    container.style.placeContent = 'center';
    container.style.gap = '16px';
    container.style.textAlign = 'center';
    const venue = document.createElement('strong');
    venue.textContent = ceremony.venue || '예식 장소';
    const note = document.createElement('p');
    note.textContent = message;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '네이버 지도에서 보기 ↗';
    container.append(venue, note, link);
  }
  if (!key) {
    container.dataset.mapState = 'awaiting-key';
    fallback('위치와 길찾기는 네이버 지도에서 확인하실 수 있습니다.');
    return;
  }
  let failed = false;
  let timer;
  function fail() {
    clearTimeout(timer);
    failed = true;
    container.dataset.mapState = 'unavailable';
    fallback('지도를 불러오지 못했습니다. 아래에서 위치를 확인해 주세요.');
  }
  window.navermap_authFailure = fail;
  const script = document.createElement('script');
  script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`;
  script.async = true;
  script.onerror = fail;
  script.onload = () => {
    clearTimeout(timer);
    if (failed || !window.naver?.maps) return fail();
    try {
      const latitude = Number(settings.latitude ?? 37.6443318);
      const longitude = Number(settings.longitude ?? 126.7876533);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return fail();
      const position = new naver.maps.LatLng(latitude, longitude);
      const map = new naver.maps.Map(container, {
        center: position, zoom: 17, scrollWheel: false,
        zoomControl: true, zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT }
      });
      const label = document.createElement('div');
      label.textContent = ceremony.venue || '예식 장소';
      label.style.cssText = 'width:116px;padding:7px 4px;background:white;border:2px solid #03a94f;border-radius:5px;text-align:center;color:#163627;font:bold 12px sans-serif;box-shadow:0 2px 6px #0002';
      new naver.maps.Marker({ position, map, title: ceremony.venue || '예식 장소', icon: { content: label.outerHTML, anchor: new naver.maps.Point(62,18) } });
      container.dataset.mapState = 'initializing';
      naver.maps.Event.once(map, 'tilesloaded', () => { if (!failed) container.dataset.mapState = 'ready'; });
      if ('ResizeObserver' in window) {
        new ResizeObserver(() => {
          if (failed || !window.naver?.maps?.Size || container.dataset.mapState === 'unavailable') return;
          map.setSize(new naver.maps.Size(container.clientWidth, container.clientHeight));
          map.setCenter(position);
        }).observe(container);
      }
    } catch (_) { fail(); }
  };
  container.dataset.mapState = 'loading';
  timer = setTimeout(fail, 12000);
  document.head.append(script);
})();
