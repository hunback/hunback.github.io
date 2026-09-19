'use strict';
(() => {
  const audio = document.querySelector('#bgm-audio');
  const toggle = document.querySelector('#bgm-toggle');
  const status = document.querySelector('#bgm-status');
  const panel = document.querySelector('#music');
  if (!audio || !toggle || !status) return;

  const content = window.DESIGN_CONTENT || {};
  const media = content.media && typeof content.media === 'object' ? content.media : {};
  const configuredPath = typeof media.bgm === 'string' ? media.bgm.trim() : '';
  audio.volume = .14;

  function localAsset(path) {
    if (!path || /^(?:[a-z]+:)?\/\//i.test(path)) return '';
    const normalized = path.replaceAll('\\', '/');
    const marker = normalized.indexOf('public/');
    const relative = marker >= 0 ? normalized.slice(marker + 'public/'.length) : normalized.replace(/^\.\//, '');
    return relative.startsWith('assets/') ? relative : '';
  }

  if (!configuredPath || !localAsset(configuredPath)) {
    toggle.setAttribute('aria-label', '배경 음악 준비 중'); toggle.title = '배경 음악 준비 중'; toggle.disabled = true;
    toggle.addEventListener('click', () => { status.textContent = '배경 음악을 준비 중입니다.'; });
    return;
  }

  audio.src = localAsset(configuredPath);
  audio.load();
  toggle.disabled = false;
  toggle.setAttribute('aria-label', '배경 음악 켜기'); toggle.setAttribute('aria-pressed', 'false');

  toggle.addEventListener('click', async () => {
    if (audio.paused) {
      try { await audio.play(); }
      catch (_) { status.textContent = '음악을 재생하지 못했습니다.'; }
    } else audio.pause();
  });
  audio.addEventListener('play', () => { toggle.setAttribute('aria-label', '배경 음악 끄기'); toggle.setAttribute('aria-pressed', 'true'); status.textContent = '음악을 재생 중입니다.'; });
  audio.addEventListener('pause', () => { toggle.setAttribute('aria-label', '배경 음악 켜기'); toggle.setAttribute('aria-pressed', 'false'); status.textContent = '음악이 멈춰 있습니다.'; });
  audio.addEventListener('ended', () => { toggle.setAttribute('aria-label', '배경 음악 켜기'); toggle.setAttribute('aria-pressed', 'false'); status.textContent = '음악 재생이 끝났습니다.'; });
  audio.addEventListener('error', () => { toggle.disabled = true; status.textContent = '음악을 불러오지 못했습니다.'; });
})();
