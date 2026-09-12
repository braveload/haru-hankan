# 하루한칸

소상공인과 1인 사업자를 위한 랜딩페이지·로고 제작 스튜디오의 정적 웹사이트입니다.

- 운영 주소: https://haru-hankan.onrender.com/
- 로고 포트폴리오: https://haru-hankan.onrender.com/logo-samples.html
- 보류 중인 영수증 앱: https://github.com/braveload/receipt-bot-mvp

## 구조

```text
site/            Render에 게시되는 HTML, CSS, JavaScript와 이미지
verify_site.py   내부 링크, 필수 페이지, 문의 주소를 확인하는 표준 라이브러리 검사
render.yaml      Render 정적 사이트 설정
```

## 로컬 확인

```powershell
python -m http.server 8000 --directory site
```

브라우저에서 `http://127.0.0.1:8000/`을 엽니다.

## 검사

```powershell
python verify_site.py
node --check site/script.js
```

## 배포

Render Static Site의 Publish Directory는 `site`입니다. `main` 브랜치에 반영한 뒤 운영 페이지와 하위 페이지를 직접 확인합니다.
