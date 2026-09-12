/* Public configuration. Never put an API secret, administrator token, or guest data here. */
window.WEDDING_CONFIG = {
  version: 'mobile-20260913-smooth-intro',
  canonicalUrl: 'https://hunback.github.io/',
  // Local work uses local SQLite; the public invitation uses the hosted D1 API.
  apiBase: ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    ? '' : 'https://hunback-wedding-api.hunback2315.workers.dev',
  weddingDate: '2026-12-19T12:30:00+09:00',
  address: '경기 고양시 일산동구 강석로 9',
  venue: '더테라스웨딩',
  hall: '11층 더테라스 홀',
  // These values were not available in the supplied material. Do not invent them.
  contacts: [], // { side: 'groom'|'bride', role: '신랑', name: '박훈백', phone: '...' }
  accounts: []  // { side: 'groom'|'bride', bank: '...', number: '...', holder: '...' }
};
