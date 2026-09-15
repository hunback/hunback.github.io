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
    if (panel) panel.hidden = true;
    return;
  }

  audio.src = localAsset(configuredPath);
  audio.load();
  toggle.disabled = false;
  toggle.textContent = '♪ 음악 켜기';

  toggle.addEventListener('click', async () => {
    if (audio.paused) {
      try { await audio.play(); }
      catch (_) { status.textContent = '음악을 재생하지 못했습니다.'; }
    } else audio.pause();
  });
  audio.addEventListener('play', () => { toggle.textContent = '♪ 음악 끄기'; status.textContent = '음악을 재생 중입니다.'; });
  audio.addEventListener('pause', () => { toggle.textContent = '♪ 음악 켜기'; status.textContent = '음악이 멈춰 있습니다.'; });
  audio.addEventListener('ended', () => { toggle.textContent = '♪ 음악 켜기'; status.textContent = '음악 재생이 끝났습니다.'; });
  audio.addEventListener('error', () => { toggle.disabled = true; status.textContent = '음악을 불러오지 못했습니다.'; });
})();
