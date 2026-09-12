/* Public configuration. Never put an API secret, administrator token, or guest data here. */
window.WEDDING_CONFIG = {
  version: 'mobile-20260913-garden-complete',
  canonicalUrl: 'https://hunback.github.io/',
  // Local work uses local SQLite; the public invitation uses the hosted D1 API.
  apiBase: ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    ? '' : 'https://hunback-wedding-api.hunback2315.workers.dev',
  weddingDate: '2026-12-19T12:30:00+09:00',
  address: '경기 고양시 일산동구 강석로 9',
  venue: '더테라스웨딩',
  hall: '11층 더테라스 홀',
  // 기존 하객 공유 앨범. Google 로그인 후 사진과 영상을 업로드합니다.
  guestAlbumUrl: 'https://drive.google.com/drive/folders/1uEmtC8PYTgQWiYc3uCr3EP_xjxRAnGC-',
  // Contact display remains separately configurable.
  contacts: [], // { side: 'groom'|'bride', role: '신랑', name: '박훈백', phone: '...' }
  // 이전 Site와 아름 청첩장에서 대조한 계좌입니다.
  // 각 kakaoPayUrl의 빈 따옴표 안에 송금 링크를 넣으면 해당 송금 버튼이 나타납니다.
  accounts: [
    { side: 'groom', role: '신랑', bank: '카카오뱅크', number: '3333-02-4301683', holder: '박훈백', kakaoPayUrl: '' },
    { side: 'bride', role: '신부', bank: '카카오뱅크', number: '3333-06-5024327', holder: '최지우', kakaoPayUrl: '' }
  ]
};
