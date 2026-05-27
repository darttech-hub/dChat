# Gemini Chat Rooms

Gemini API key로 여러 채팅방을 만들고, 각 방마다 모델을 선택해 대화하는 정적 웹앱입니다.

## 실행

의존성이 없어서 `index.html`을 브라우저로 열면 됩니다. 로컬 서버로 확인하려면 아래처럼 실행할 수 있습니다.

```bash
python3 -m http.server 4173
```

그리고 `http://127.0.0.1:4173`으로 접속합니다.

## 기능

- 여러 채팅방 생성, 전환, 이름 변경, 삭제
- 채팅방별 Gemini 모델 선택
- API 키로 사용 가능한 모델 목록 불러오기
- temperature, max output tokens 조정
- 대화와 설정을 브라우저 `IndexedDB`에 저장, 미지원 환경에서는 `localStorage`로 자동 fallback
- PC 3열 레이아웃, 태블릿/모바일 드로어 레이아웃

## 주의

이 구현은 프론트엔드에서 Gemini API를 직접 호출하는 로컬 프로토타입입니다. 배포용 서비스에서는 API 키가 브라우저에 노출되지 않도록 서버 프록시나 백엔드 API를 두는 구성이 필요합니다.
