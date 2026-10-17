# 발표 자료

1차 심사는 **발표 없이 읽히는 덱 + 2분 시연영상**입니다.

| 파일 | 내용 |
|---|---|
| `outline.md` | 슬라이드별 제목(주장)·본문·근거, 쓰면 안 되는 표현, 팀이 채울 것 |
| `demo-script.md` | 2분 시연 콘티(장면·자막), 녹화 전 준비 명령 |
| `osan-kids-bridge-deck.pptx` | 덱 초안 (커밋하지 않음) |
| `osan-kids-bridge-demo.mp4` | 2분 시연영상 초안, 1920×1080 약 1분 41초, 한국어 자막 (커밋하지 않음) |
| `build/` | 덱·그림을 다시 만드는 스크립트 |

## 덱 다시 만들기

실제 기관 포스터와 그 번역본, 화면 캡처가 들어가므로 `assets/`와 `.pptx`는 **공개 저장소에 올리지 않습니다**(`.gitignore`). 각자 로컬에서 만듭니다.

```bash
cd presentation/build
npm install
node prepare-assets.js   # 포스터 원본·번역본(apps/program-api/data/local) 축소, 검증 장면 조각, 조사 캡처 변환
node capture.js          # 화면 캡처 (API 8787, 보호자 웹 5173, 기관 대시보드 5174를 먼저 띄운다. Google Chrome 필요)
node build-deck.js       # → presentation/osan-kids-bridge-deck.pptx
node record-demo.js      # → presentation/osan-kids-bridge-demo.mp4 (ffmpeg 필요, 약 2분 걸림)
DECK_QA=1 node build-deck.js   # 맥 Quick Look 미리 보기용 사본(render/deck-qa.pptx, 글꼴만 바꿈)
```

- `record-demo.js`는 무대 페이지에 보호자 웹·기관 대시보드를 휴대폰 틀로 띄우고 장면·자막을 자동으로 넘기며 headless Chrome 화면을 기록합니다. 포스터 통번역 장면은 실제 실행 기록(`translated/osan-fc-sports-day.vi.json`, `--demo-fault`로 만든 것)을 시간을 줄여 다시 보여 주고, 상담 답은 녹화 직전에 실제 API로 받은 답을 2.5초 만에 돌려줍니다. 두 가지 모두 자막에 밝혀 두었습니다.
- 녹화 전에 `apps/program-api/demo/questions/`를 지우면 기관 화면에 '보호자 웹에서 들어온 질문 1건'만 보입니다.
- 소리는 없습니다. 내레이션이나 배경음은 편집 프로그램에서 덧입힙니다.

- 서버 띄우기는 `demo-script.md`의 '준비'를 따릅니다.
- 글꼴은 맑은 고딕(Malgun Gothic)입니다. 맥에서 글꼴이 없으면 PowerPoint가 다른 한글 글꼴로 바꿔 보여 줍니다.
- 수치는 `research/통계_1차출처_확인_2026-10-17.md`의 확정 수치만 씁니다. 10/19 아침에 행안부 2025.11.1 기준판이 나왔는지 다시 확인합니다.

## 검수 한계

- 이 맥에서는 macOS 권한 때문에 PowerPoint·Keynote 자동화가 막혀 있었습니다. 그래서 `DECK_QA=1` 사본(`build/render/deck-qa.pptx`)을 슬라이드별로 나눠 Quick Look(`qlmanage -t`)으로 그린 그림을 보고 검수했습니다.
- Quick Look은 네이티브 차트(2·3번 슬라이드)를 그리지 않습니다. 표 행 높이(10번)와 한글 줄바꿈 위치도 PowerPoint와 다를 수 있습니다. **제출 전에 PowerPoint로 열어** 차트·표·줄바꿈을 한 번 확인합니다.
- 덱과 영상은 `research/`(추적하지 않음), `apps/program-api/data/local`(`.gitignore`), API 키가 모두 있는 컴퓨터에서만 다시 만들 수 있습니다.
