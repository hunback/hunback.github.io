/* Public configuration. Never put an API secret, administrator token, or guest data here. */
window.WEDDING_CONFIG = {
  version: 'mobile-20260919-reference-pass',
  canonicalUrl: 'https://hunback.github.io/',
  // 카카오디벨로퍼스 JavaScript 키만 넣습니다. 어드민 키와 REST API 키는 넣지 않습니다.
  kakaoJavaScriptKey: '7c74f3002f659bfacaebba51deb1aac5',
  // Local work uses local SQLite; the public invitation uses the hosted D1 API.
  apiBase: (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname))
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
    { side: 'groom', role: '신랑 부모님', bank: '카카오뱅크', number: '3333-23-8145544', holder: '박대선 · 이유선 (예금주 이유선)', kakaoPayUrl: '' },
    { side: 'bride', role: '신부', bank: '카카오뱅크', number: '3333-06-5024327', holder: '최지우', kakaoPayUrl: '' },
    { side: 'bride', role: '신부 아버지', bank: '카카오뱅크', number: '3333-33-7728094', holder: '최완호', kakaoPayUrl: '' },
    { side: 'bride', role: '신부 어머니', bank: '우체국', number: '104877-02-252013', holder: '안효순', kakaoPayUrl: '' }
  ]
};
