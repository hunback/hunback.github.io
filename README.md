# 훈백과 지우의 청첩장

2026년 12월 19일 낮 12시 30분 · 더테라스웨딩

GitHub Pages용 HTML·CSS·JavaScript와 사진·영상·글꼴을 포함합니다. `index.html`, `styles.css`, `app.js`, `photos.js`, `config.js`를 수정합니다. 미리보기는 이 폴더에서 `python -m http.server 8000 --bind 127.0.0.1`을 실행한 후 `http://127.0.0.1:8000/`에서 확인할 수 있습니다.

방명록·참석 응답은 Cloudflare Worker `hunback-wedding-api.hunback2315.workers.dev`와 비공개 D1 데이터베이스에 저장됩니다. PC 상시 가동은 필요하지 않습니다. `config.js`는 로컬 주소에서 같은 주소의 `/api`를 사용하고, 공개 주소에서는 운영 API를 사용합니다. 관리자 비밀값과 참석자 데이터는 이 저장소에 넣지 않습니다.

기존 `cards/`, `trifold/`, `designs/` 자료는 유지합니다. 최신 모바일은 `assets/`의 파일을 사용합니다.
