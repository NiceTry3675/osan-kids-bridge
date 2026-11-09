# 발표 자료

1차 심사는 **발표 없이 읽히는 덱 + 2분 시연영상**이었고, 그다음은 **7분 안팎의 구두 발표**입니다(아래 '구두 발표 덱').

| 파일 | 내용 |
|---|---|
| `osan-kids-bridge-talk.pptx` | 구두 발표 덱 13장 + 숨긴 예비 장 4장. 장마다 슬라이드 노트에 대본과 예상 시간. 같은 이름의 `.pdf`는 본편 13장(둘 다 커밋하지 않음) |
| `talk-qa.md` | 구두 발표 질의응답 대비: 예상 질문과 사실대로 된 답 |
| `osan-kids-bridge-poster-demo.mp4` | 포스터 발표 옆 노트북에 반복 재생할 무음 시연영상, 1920×1080 50초. 소리 없이 큰 글자로 읽히고 끝이 처음과 이어짐(커밋하지 않음) |
| `outline.md` | 슬라이드별 제목·본문·근거, 문체·색 원칙, 쓰면 안 되는 표현, 팀이 채울 것 |
| `demo-script.md` | 2분 시연 콘티(장면·내레이션 대본·화면·정직하게 밝히는 것), 녹화 전 준비 명령 |
| `overview.md` | 개요서: 양식에 맞춘 27줄 제출판과 출처를 함께 적은 자세한 판 |
| `osan-kids-bridge-deck.pptx` | 덱 20장 (커밋하지 않음) |
| `osan-kids-bridge-demo.mp4` | 시연영상(제출용), 1920×1080 약 1분 40초(99.8초, 장면 8개). 부모님 ↔ 기관 순환(못 찾은 질문 → 덧붙인 안내)으로 시작해, 베트남어 화면의 부모님 → 포스터 통번역 뒷이야기 → 상담 → 공고 보완 → 중국어 화면의 다른 가정 → 편성 순으로 실제 앱에서 하는 일을 따라감. 한 줄 소개 '부모님의 질문이 다음 프로그램이 되는 곳'. 내레이션은 gemini-3.8-flash-tts(`build/narrate.mts`), 화면 글자 최소. 소리 없는 원본은 `-silent.mp4` (커밋하지 않음) |
| `osan-kids-bridge-demo-prompter.mp4` | 같은 영상의 녹음용판(화면 아래에 대본). `narrate.mts prompter`로 같은 TTS를 얹을 수도 있음 (커밋하지 않음) |
| `build/` | 덱·그림·영상을 다시 만드는 스크립트 |

## 덱·영상 다시 만들기

실제 기관 포스터와 그 번역본, 화면 캡처가 들어가므로 `assets/`와 `.pptx`는 **공개 저장소에 올리지 않습니다**(`.gitignore`). 각자 로컬에서 만듭니다.

```bash
cd presentation/build
npm install
node prepare-assets.js   # 포스터 원본·번역본(apps/program-api/data/local) 축소, 검증 장면 조각, 조사 캡처 변환
node record-demo.js      # → presentation/osan-kids-bridge-demo.mp4 (소리 없음, ffmpeg 필요, 약 2분). 처음 실행 때 실제 답을 render/prefetch.json·plan-result.json에 저장
node capture.js          # 화면 캡처 (아래 '화면 캡처'). record-demo.js가 저장한 답을 같이 씀
node prepare-assets.js   # 한 번 더: 기관 화면 캡처에서 덱에 쓸 부분을 잘라 dash-*-crop.png로 저장
node build-deck.js       # → presentation/osan-kids-bridge-deck.pptx
(cd ../../apps/program-api && npx tsx ../../presentation/build/narrate.mts)  # 제출용 영상에 TTS 내레이션 얹기

PROMPTER=1 node record-demo.js  # 녹음용 osan-kids-bridge-demo-prompter.mp4 (화면 아래에 대본)
(cd ../../apps/program-api && npx tsx ../../presentation/build/narrate.mts prompter)  # 녹음용 영상에 같은 내레이션
DECK_QA=1 node build-deck.js    # 맥 Quick Look 미리 보기용 사본(render/deck-qa.pptx, 글꼴만 바꿈)
```

API(8787)·보호자 웹(5173)·기관 대시보드(5174)를 먼저 띄웁니다(`demo-script.md`의 '준비'). 화면은 Google Chrome으로 찍습니다. `record-demo.js`와 `capture.js`는 같은 시연 서버의 상태(포스터 승인, 덧붙인 안내, 알린 질문)를 바꿨다가 되돌리므로 **동시에 실행하지 않습니다**.

### 화면 캡처 (`capture.js`)

`node capture.js [모드] [언어...]`. 모드를 생략하면 `all`로 모두 찍습니다. 그림은 `presentation/assets/`에 저장됩니다.

| 모드 | 찍는 것 | 덱 | 서버에서 하는 일 |
|---|---|---|---|
| `journey [ko-easy\|vi\|zh…]` | 보호자 여정: 첫 화면 → 홈 → 조건 넣기 → 맞는 공고 → 상세 (`app-<ko\|vi\|zh>-*.png`). 언어를 생략하면 세 언어 모두 | 1·7번 | 공고 읽기만 |
| `chat [vi\|zh…]` | 상담 답과 기관에 물을 한국어 문장 (`app-chat-*.png`). 언어를 생략하면 베트남어·중국어 | 9번 | 상담 에이전트(Gemini). '기관에 알리기'는 누르지 않음 |
| `loop` | 질문 하나가 공고를 바꾸기까지 (`app-loop-*.png`, `dash-loop-*.png`) | 1·12번 | 질문 알리기·안내 덧붙이기를 실제로 저장하고, 중국어 상담 답(Gemini)을 받은 뒤 둘 다 지움. `render/prefetch.json`(record-demo.js)이 있어야 함 |
| `dashboard` | 공고 관리·검수 화면·공고 보완 도우미 (`dash-programs.png`, `dash-review.png`, `dash-improve*.png`) | 11·14번 | 공고 보완 도우미(Gemini). 저장하지 않음 |
| `plan` | AI 편성 제안 (`dash-plan*.png`) | 13번 | `render/plan-result.json`이 있으면 그 편성안을 쓰고, 없으면 편성 도우미(Gemini)를 불러 통과한 결과를 저장 |
| `home`, `detail` | 베트남어 홈·상세·포스터 (`app-home-vi.png`, `app-detail-top-vi.png`, `app-poster-vi.png`) | 쓰지 않음 | 공고 읽기만 |
| `all` | 위를 모두. `loop`는 맨 마지막에 찍고, `render/prefetch.json`이 없으면 알리고 건너뜀 | | |

- 상담 답은 매번 달라, 답에 기관에 물을 문장이 없으면 그 그림(`app-chat-inquiry-<언어>.png`)은 찍지 않고 알립니다. 그때는 `node capture.js chat zh`처럼 다시 찍습니다.
- `dashboard`는 승인·덧붙인 안내가 없는 처음 상태에서 찍습니다(API를 새로 켜면 처음 상태).

### 시연영상 (`record-demo.js`, `narrate.mts`)

- `record-demo.js`는 부모님 휴대폰(보호자 웹)·기관 화면·포스터 무대를 한 캔버스에 놓고 카메라를 움직이며(확대·이동, 커서와 누름 표시) headless Chrome 화면을 기록합니다. 시연영상이라 장면마다 부모님·기관 담당자의 행동(언어 고르기, 조건 넣기, 묻기, 기관에 알리기, 빈칸 채우기, 편성안 만들기)을 따라가고, 에이전트는 그 결과로 나옵니다. 언어는 제품이 내는 쉬운 한국어·베트남어·중국어만 보입니다(첫 가정은 베트남어 화면, 다른 가정은 중국어 화면). 내레이션·화면 글자는 나라·국적을 말하지 않고 '부모님'·'가정'이라고 합니다(앱 화면 글자는 그대로). 포스터 통번역 뒷이야기는 실제 실행 기록(`translated/osan-fc-sports-day.vi.json`은 `--demo-fault`로 일부러 날짜 오류를 넣어 만든 것, `.zh.json`은 오류 주입 없음)의 회차별 이미지를 시간을 줄여 다시 보여 주고, 상담 답(베트남어·중국어)·보완 초안·편성안은 녹화 전에 실제 API로 받은 결과를 0.9~1.3초 만에 돌려줍니다. 모두 화면 구석 표시로 밝혀 둡니다. 베트남어 포스터 승인은 녹화를 시작하기 전에 실제 API로 하고(부모님 장면이 포스터 장면보다 앞이라), 녹화 뒤 되돌립니다.
- 장면 길이는 `demo-script.md`의 내레이션 대본(스크립트의 `SCENES`, 약 98.7초)을 초당 4.6음절에 쉼표·마침표마다 0.3초를 더해 읽는 시간보다 짧아지지 않게 맞추고, 합계가 118초를 넘으면 인코딩 전에 멈춥니다. 화면의 중요한 순간은 그 말을 읽기 시작하는 시각에 맞추고 `build/render/video/timings.json`에 남깁니다.
- 녹화한 영상에는 소리가 없고, `narrate.mts`가 같은 대본을 장면마다 TTS(`gemini-3.8-flash-tts`, 목소리 Kore)로 읽혀 장면 시작 직후(최대 0.6초 뒤)에 얹습니다. 키는 program-api의 설정(`.env.local`)을 그대로 쓰고, 대본이 바뀐 장면만 다시 만듭니다(`build/render/narration/`). 소리 없는 원본은 `-silent.mp4`로 남고, 소리를 넣은 `.narrated.mp4`를 제출용 mp4에 덮어씁니다. 녹음용 영상은 `narrate.mts prompter`.
- 녹화 전에 받은 실제 답(상담 2개: 베트남어·중국어, 공고 보완 초안)은 `build/render/prefetch.json`에, 편성안은 `build/render/plan-result.json`에 저장해 두고 다시 녹화할 때 재사용합니다(제출용과 녹음용 영상이 같은 답). `capture.js`(loop·plan)와 `build-deck.js`(13·16번의 숫자)도 이 두 파일을 읽어 덱과 영상이 같은 실행을 보여 줍니다. 새로 받으려면 `FRESH=1 node record-demo.js`(첫 상담 답은 두고 공고 보완 초안과 두 번째 답만 새로 받으려면 `FRESH=improve`), 편성안은 그 파일을 지우고 `node capture.js plan`. 새로 받았으면 녹화·캡처·덱도 다시 만들어 같은 답으로 맞춥니다.

### 그 밖에

- 글꼴은 맑은 고딕(Malgun Gothic)입니다. 맥에서 글꼴이 없으면 PowerPoint가 다른 한글 글꼴로 바꿔 보여 줍니다.
- 수치는 `research/통계_1차출처_확인_2026-10-17.md`의 확정 수치만 씁니다. 10/19 아침에 행안부 2025.11.1 기준판이 나왔는지 다시 확인합니다.

## 구두 발표 덱

7분 안팎 발표용입니다. 운동회 포스터 한 장을 받은 부모님의 '뭘 챙겨 가요?' 질문 하나를 따라가며, 그 질문이 이름 없이 센터에 닿고(③ 공고 보완), 다음 가정이 바로 답을 받고, 모인 조건이 다음 반 편성(④)으로 이어지는 순서로 보여 줍니다. 대본은 장마다 슬라이드 노트에 있고(맨 위에 예상 시간·누적 시간), 합계 약 1,890음절로 초당 4.8음절이면 6분 30초 안팎입니다.

```bash
cd presentation/build
node capture-talk.js        # → ../assets/talk/*.png, marks.json (서버 셋을 먼저 띄움. 상담 답·보완 초안·편성안은 render/의 받아 둔 결과를 다시 씀)
node build-talk.js          # → ../osan-kids-bridge-talk.pptx (글·대본은 talk-text.js)
TALK_SHOW_ALL=1 TALK_OUT=render/talk/check.pptx node build-talk.js  # 예비 장까지 보이는 확인용 사본
```

- `capture-talk.js [intro|journey|age|detail|plan|loop]`: 11/5 이후 바뀐 보호자 웹(안쪽 영역 스크롤, 조건 시트, 신청·물어보기 시트)에 맞춘 캡처입니다. 휴대폰은 375×812를 3배로 찍습니다. `loop`는 '기관에 알리기'와 '공고에 덧붙이기'를 실제 시연 API에 저장했다가 끝나면 지웁니다. 캡처 속 강조할 자리는 `marks.json`에 비율로 남기고, `build-talk.js`가 그 위에 테두리를 그립니다.
- 4번(끊긴 두 방향)과 5번(순환)은 같은 이름(`!!loop-…`)의 도형을 쓰고, 5번에 모핑 전환을 넣었습니다(모핑을 모르는 프로그램은 페이드).
- 14~17번은 숨긴 예비 장입니다(포스터 통번역 검증, 시스템 구조, 신뢰와 개인정보, 기존 공공 챗봇과 다른 점). 슬라이드 쇼에서는 건너뛰고, 질의응답 때 그 장으로 바로 가서 보여 줍니다. PowerPoint로 내보낸 PDF에는 숨긴 장이 빠집니다.
- PowerPoint로 PDF를 만들 때는 앞 파일의 내보내기가 끝난 뒤 다음 파일을 엽니다. 겹쳐 열면 멀쩡한 파일에도 '복구'를 묻습니다.
- pptxgenjs의 `ROUND_2_SAME_RECTANGLE`은 조정값 이름을 잘못 적어 PowerPoint가 그 뒤 도형을 버리거나 복구를 묻습니다. 크기가 음수인 도형(왼쪽으로 그은 선)도 같습니다. `build-talk.js`는 둘 다 쓰지 않고, 음수 크기가 있으면 저장을 멈춥니다.

## 포스터 발표 시연영상

포스터 앞에서 말하는 동안 노트북에 반복 재생해 두는 50초짜리 무음 영상입니다. 첫 가정(베트남어 화면)이 포스터를 읽고 묻고 센터에 알리면, 센터가 빈칸을 채워 덧붙이고, 다음 가정(중국어 화면)이 그 안내로 답을 받고, 모인 조건으로 다음 반을 짜는 한 바퀴를 실제 앱 화면으로 보여 줍니다. 왼쪽 큰 글, 오른쪽 쪽지(화면 속 외국어의 뜻), 아래 단계 표시(포스터의 ①~④와 같은 순서)로 소리 없이 읽히게 했습니다. Remotion 프로젝트는 저장소 맨 위 `my-video/`입니다.

```bash
cd presentation/build
node capture-video.js       # → ../assets/video/ (서버 셋을 먼저 띄움. 누르기 전후는 PNG, 스크롤은 실제로 조금씩 내리며 찍은 JPEG 연속 장면, 자리는 shots.json)
cd ../../my-video
rm -rf public/shots && mkdir -p public/shots && cp -R ../presentation/assets/video/* public/shots/ && cp ../presentation/assets/poster-sports-ko.jpg public/shots/
npm run dev                 # Remotion Studio 미리보기 (http://localhost:3000/PosterDemo)
npx remotion render PosterDemo ../presentation/osan-kids-bridge-poster-demo.mp4 --codec=h264 --crf=16 --jpeg-quality=95
```

- `capture-video.js`도 '기관에 알리기'와 '공고에 덧붙이기'를 실제 시연 API에 저장했다가 끝나면 지우므로 다른 캡처 스크립트와 동시에 돌리지 않습니다. 상담 답·보완 초안·편성안은 `render/`에 받아 둔 실제 결과를 다시 씁니다.
- 기관 화면의 '시연용 가상' 문구와 시연 꼬리표는 포스터 캡처와 같은 규칙으로 캡처에서만 지웁니다(앱은 그대로).
- 글꼴은 맥의 Apple SD Gothic Neo입니다(웹 글꼴은 한글 조각 파일이 많아 렌더가 멈춤). 다른 컴퓨터에서는 맑은 고딕으로 나옵니다.

## 검수 한계

- 2026-10-18 20장본을 실제 PowerPoint에서 한 장씩 넘겨 보며 확인했습니다. 차트(2·3번)와 표(10·16번)가 제대로 그려집니다.
- 카드 그림자: pptxgenjs는 `shadow` 설정 객체의 값을 그 자리에서 바꿔 씁니다. 한 객체를 여러 카드에 넘기면 값이 계속 곱해져 PowerPoint가 '복구'를 묻는 파일이 되므로, `build-deck.js`는 카드마다 새 객체를 넘깁니다.
- 한글 줄바꿈: PowerPoint는 글자 언어가 `en-US`이면 `eaLnBrk="0"`이어도 한글 낱말을 중간에서 자릅니다. 그래서 `build-deck.js`가 글자 언어를 `ko-KR`로 바꿉니다.
- 빠른 미리 보기는 `DECK_QA=1` 사본(`build/render/deck-qa.pptx`)을 Quick Look(`qlmanage -t`)으로 그려 봅니다. Quick Look은 차트를 그리지 않고 한글을 글자마다 자르므로, 덱을 고친 뒤에는 PowerPoint로 한 번 더 확인합니다.
- 덱과 영상은 `research/`, `apps/program-api/data/local`(둘 다 `.gitignore`), API 키가 모두 있는 컴퓨터에서만 다시 만들 수 있습니다.
