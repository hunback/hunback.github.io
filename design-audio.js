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
  audio.volume = .4;

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
  audio.loop = true;
  audio.preload = 'auto';
  audio.autoplay = true;
  toggle.disabled = false;
  let wantsMusic = true;
  let starting = null;
  function render() {
    const playing = !audio.paused && !audio.ended;
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.setAttribute('aria-label', playing ? '배경 음악 끄기' : '배경 음악 켜기');
    toggle.title = playing ? '배경 음악 끄기' : '배경 음악 켜기';
  }
  async function start() {
    if (!wantsMusic || starting || !audio.paused) return;
    starting = audio.play();
    try {
      await starting;
      if (!wantsMusic) audio.pause();
    } catch (_) {
      status.textContent = '화면을 터치하거나 음악 버튼을 누르면 음악이 시작됩니다.';
    } finally { starting = null; render(); }
  }
  function unlock(event) {
    if (event.target?.closest?.('#bgm-toggle') || !wantsMusic) return;
    start();
  }
  document.addEventListener('pointerdown', unlock, {passive: true});
  document.addEventListener('touchend', unlock, {passive: true});
  document.addEventListener('click', unlock);
  document.addEventListener('keydown', unlock);
  toggle.addEventListener('click', () => {
    if (!audio.paused || starting) {
      wantsMusic = false; audio.pause(); render();
    } else {
      wantsMusic = true;
      if (audio.error) audio.load();
      start();
    }
  });
  audio.addEventListener('playing', () => { render(); status.textContent = '음악을 재생 중입니다.'; });
  audio.addEventListener('pause', () => { render(); status.textContent = '음악이 꺼져 있습니다.'; });
  audio.addEventListener('error', () => { render(); status.textContent = '음악을 불러오지 못했습니다. 버튼을 눌러 다시 시도해 주세요.'; });
  render();
  start();
})();
