# 발표 자료

1차 심사는 **발표 없이 읽히는 덱 + 2분 시연영상**입니다.

| 파일 | 내용 |
|---|---|
| `outline.md` | 슬라이드별 제목(주장)·본문·근거, 쓰면 안 되는 표현, 팀이 채울 것 |
| `demo-script.md` | 2분 시연 콘티(장면·자막), 녹화 전 준비 명령 |
| `osan-kids-bridge-deck.pptx` | 덱 초안 (커밋하지 않음) |
| `build/` | 덱·그림을 다시 만드는 스크립트 |

## 덱 다시 만들기

실제 기관 포스터와 그 번역본, 화면 캡처가 들어가므로 `assets/`와 `.pptx`는 **공개 저장소에 올리지 않습니다**(`.gitignore`). 각자 로컬에서 만듭니다.

```bash
cd presentation/build
npm install
node prepare-assets.js   # 포스터 원본·번역본(apps/program-api/data/local) 축소, 검증 장면 조각, 조사 캡처 변환
node capture.js          # 화면 캡처 (API 8787, 보호자 웹 5173, 기관 대시보드 5174를 먼저 띄운다. Google Chrome 필요)
node build-deck.js       # → presentation/osan-kids-bridge-deck.pptx
```

- 서버 띄우기는 `demo-script.md`의 '준비'를 따릅니다.
- 글꼴은 맑은 고딕(Malgun Gothic)입니다. 맥에서 글꼴이 없으면 PowerPoint가 다른 한글 글꼴로 바꿔 보여 줍니다.
- 수치는 `research/통계_1차출처_확인_2026-10-17.md`의 확정 수치만 씁니다. 10/19 아침에 행안부 2025.11.1 기준판이 나왔는지 다시 확인합니다.
