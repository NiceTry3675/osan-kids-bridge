# 발표 자료

1차 심사는 **발표 없이 읽히는 덱 + 2분 시연영상**입니다.

| 파일 | 내용 |
|---|---|
| `outline.md` | 슬라이드별 제목·본문·근거, 문체·색 원칙, 쓰면 안 되는 표현, 팀이 채울 것 |
| `demo-script.md` | 2분 시연 콘티(장면·내레이션 대본·화면·정직하게 밝히는 것), 녹화 전 준비 명령 |
| `osan-kids-bridge-deck.pptx` | 덱 20장 (커밋하지 않음) |
| `osan-kids-bridge-demo.mp4` | 시연영상(제출용), 1920×1080 약 1분 40초(99.8초, 장면 8개). 부모님 ↔ 기관 순환(못 찾은 질문 → 덧붙인 안내)으로 시작해, 베트남어 화면의 부모님 → 포스터 통번역 뒷이야기 → 상담 → 공고 보완 → 중국어 화면의 다른 가정 → 편성 순으로 실제 앱에서 하는 일을 따라감. 한 줄 소개 '부모님의 질문이 다음 프로그램이 되는 곳'. 내레이션은 gemini-3.8-flash-tts(`build/narrate.mts`), 화면 글자 최소. 소리 없는 원본은 `-silent.mp4` (커밋하지 않음) |
| `osan-kids-bridge-demo-prompter.mp4` | 같은 영상의 내레이션 녹음용(화면 아래 대본) (커밋하지 않음) |
| `build/` | 덱·그림을 다시 만드는 스크립트 |

## 덱 다시 만들기

실제 기관 포스터와 그 번역본, 화면 캡처가 들어가므로 `assets/`와 `.pptx`는 **공개 저장소에 올리지 않습니다**(`.gitignore`). 각자 로컬에서 만듭니다.

```bash
cd presentation/build
npm install
node prepare-assets.js   # 포스터 원본·번역본(apps/program-api/data/local) 축소, 검증 장면 조각, 조사 캡처 변환
node capture.js          # 화면 캡처 (API 8787, 보호자 웹 5173, 기관 대시보드 5174를 먼저 띄운다. Google Chrome 필요)
                         # journey: 보호자 여정(쉬운 한국어·베트남어), plan: AI 편성 제안(편성 도우미 결과를 render/plan-result.json에 저장해 영상과 같이 씀)
node prepare-assets.js   # 한 번 더: 기관 화면 캡처에서 덱에 쓸 부분을 잘라 dash-*-crop.png로 저장 (capture.js 다음에)
node build-deck.js       # → presentation/osan-kids-bridge-deck.pptx
node record-demo.js      # → presentation/osan-kids-bridge-demo.mp4 (ffmpeg 필요, 약 2분 걸림)
PROMPTER=1 node record-demo.js  # → 녹음용 osan-kids-bridge-demo-prompter.mp4
(cd ../../apps/program-api && npx tsx ../../presentation/build/narrate.mts)  # TTS 내레이션을 제출용 영상에 얹기
DECK_QA=1 node build-deck.js   # 맥 Quick Look 미리 보기용 사본(render/deck-qa.pptx, 글꼴만 바꿈)
```

- `record-demo.js`는 부모님 휴대폰(보호자 웹)·기관 화면·포스터 무대를 한 캔버스에 놓고 카메라를 움직이며(확대·이동, 커서와 누름 표시) headless Chrome 화면을 기록합니다. 시연영상이라 장면마다 부모님·기관 담당자의 행동(언어 고르기, 조건 넣기, 묻기, 기관에 알리기, 빈칸 채우기, 편성안 만들기)을 따라가고, 에이전트는 그 결과로 나옵니다. 언어는 제품이 내는 쉬운 한국어·베트남어·중국어만 보입니다(첫 가정은 베트남어 화면, 다른 가정은 중국어 화면). 내레이션·화면 글자는 나라·국적을 말하지 않고 '부모님'·'가정'이라고 합니다(앱 화면 글자는 그대로). 포스터 통번역 뒷이야기는 실제 실행 기록(`translated/osan-fc-sports-day.vi.json`은 `--demo-fault`로 일부러 날짜 오류를 넣어 만든 것, `.zh.json`은 오류 주입 없음)의 회차별 이미지를 시간을 줄여 다시 보여 주고, 상담 답(베트남어·중국어)·보완 초안·편성안은 녹화 전에 실제 API로 받은 결과를 0.9~1.3초 만에 돌려줍니다. 모두 화면 구석 표시로 밝혀 둡니다. 베트남어 포스터 승인은 녹화를 시작하기 전에 실제 API로 하고(부모님 장면이 포스터 장면보다 앞이라), 녹화 뒤 되돌립니다.
- 장면 길이는 `demo-script.md`의 내레이션 대본(스크립트의 `SCENES`, 약 98.7초)을 초당 4.6음절에 쉼표·마침표마다 0.3초를 더해 읽는 시간보다 짧아지지 않게 맞추고, 합계가 118초를 넘으면 인코딩 전에 멈춥니다. 화면의 중요한 순간은 그 말을 읽기 시작하는 시각에 맞추고 `build/render/video/timings.json`에 남깁니다. 소리는 없고, 팀이 녹음한 내레이션을 얹습니다.
- 녹화 전에 받은 실제 답(상담 2개: 베트남어·중국어, 공고 보완 초안)은 `build/render/prefetch.json`에, 편성안은 `build/render/plan-result.json`에 저장해 두고 다시 녹화할 때 재사용합니다(제출용과 녹음용 영상이 같은 답). 새로 받으려면 `FRESH=1 node record-demo.js`, 편성안은 그 파일을 지우고 `node capture.js plan`.

- 서버 띄우기는 `demo-script.md`의 '준비'를 따릅니다.
- 글꼴은 맑은 고딕(Malgun Gothic)입니다. 맥에서 글꼴이 없으면 PowerPoint가 다른 한글 글꼴로 바꿔 보여 줍니다.
- 수치는 `research/통계_1차출처_확인_2026-10-17.md`의 확정 수치만 씁니다. 10/19 아침에 행안부 2025.11.1 기준판이 나왔는지 다시 확인합니다.

## 검수 한계

- 2026-10-17 18장본을 **실제 PowerPoint(맥)에서 모두** 열어 읽기용 보기로 한 장씩 넘겨 보며 확인했습니다. 차트(2·3번), 표(12번), 카드 그림자, 맑은 고딕 글꼴, 한글 낱말 단위 줄바꿈이 의도대로 보였습니다. 그 뒤로 2~5번 머리말 색을 바꾸고(이전 파일과 XML로 대조), 10/18에 기술 구조 두 장(15·16번)을 넣었습니다. 이 두 장은 맑은 고딕 글자 넘침 검사와 Quick Look까지만 확인했습니다.
- 카드 그림자: pptxgenjs는 `shadow` 설정 객체의 값을 그 자리에서 바꿔 씁니다. 한 객체를 여러 카드에 넘기면 값이 계속 곱해져 PowerPoint가 '복구'를 묻는 파일이 되므로, `build-deck.js`는 카드마다 새 객체를 넘깁니다.
- 한글 줄바꿈: PowerPoint는 글자 언어가 `en-US`이면 `eaLnBrk="0"`이어도 한글 낱말을 중간에서 자릅니다. 그래서 `build-deck.js`가 글자 언어를 `ko-KR`로 바꿉니다.
- 빠른 미리 보기는 `DECK_QA=1` 사본(`build/render/deck-qa.pptx`)을 Quick Look(`qlmanage -t`)으로 그려 봅니다. Quick Look은 차트를 그리지 않고 한글을 글자마다 자르므로, 덱을 고친 뒤에는 PowerPoint로 한 번 더 확인합니다.
- 덱과 영상은 `research/`(추적하지 않음), `apps/program-api/data/local`(`.gitignore`), API 키가 모두 있는 컴퓨터에서만 다시 만들 수 있습니다.
