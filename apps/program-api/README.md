# 프로그램 API

기관 공고(웹 글·포스터 이미지)를 Gemini로 구조화하고, 사람이 검수해 승인한 공고만 보호자 웹(`apps/guardian-web`)에 내보내는 서버입니다. 판정 규칙은 보호자 서비스 명세 v2.2의 3~8장을 따릅니다.

```text
공고 저장 → Gemini 판독·추출 → 원문 근거 대조 → 3개 언어 요약·자동 대조 → 사람 검수 → API
(inbox)     (포스터 판독문,     (인용이 원문에 있고   (쉬운 한국어·베트남어·   (review     (승인 + 사실 해시
             구조화 JSON)        값과 맞는 사실만)      중국어, 코드·모델 대조)   approve)    일치한 공고만)
```

- 모델은 사실마다 원문 인용을 함께 내고, 코드가 인용이 원문에 실제로 있는지와 값이 인용과 맞는지 확인합니다. 근거가 없는 날짜·시각·비용·신청 정보는 비워 둡니다.
- 언어별 3줄 요약은 원문이 아니라 구조화된 사실에서 만들고, 코드 검사와 모델 대조를 모두 통과해야 `machine_checked`가 됩니다. `approved`는 사람만 기록합니다.
- 승인할 때 사실 해시(`review.facts_hash`)를 남깁니다. 그 뒤 원문이나 사실이 바뀌면 승인이 풀린 것(stale)으로 보고 API에서 내립니다.
- 신청 상태·시간 일치 같은 판정은 저장하지 않고 요청 시점(`Asia/Seoul`)에 계산합니다.

## 준비

의존성은 저장소 맨 위에서 `npm install`로 한 번에 설치합니다(npm workspaces). 그다음 이 폴더에서:

```bash
cp .env.example .env.local
```

`.env.local`에 Vertex AI 서비스 계정 키 파일 경로를 적습니다. 키 파일은 저장소 밖이나 `.gitignore`된 위치에 두고 커밋하지 않습니다.

```bash
GOOGLE_APPLICATION_CREDENTIALS=../../<서비스-계정-키>.json
# 선택: GOOGLE_CLOUD_PROJECT (기본은 키의 project_id), GEMINI_LOCATION=global, GEMINI_MODEL=gemini-3.8-flash
```

모델은 Vertex AI의 `gemini-3.8-flash`입니다. 그 밖의 설정: `PROGRAM_DATA_DIR`(기본 `data/local`), `PORT`(기본 8787), `HOST`(기본 127.0.0.1), `CORS_ORIGINS`(기본 `http://127.0.0.1:5173,http://localhost:5173`, `*`는 모두 허용), `PROGRAM_API_NOW`(판정 기준 시각을 ISO로 고정, 시연·시험용), `SHOW_MACHINE_CHECKED_SUMMARIES=1`(아래 요약 설명 참고).

## 실제 공고 자료의 보관

실제 공고 원문·포스터·추출 결과는 이용 조건을 확인하기 전까지 **`data/local/` 아래에만** 두며 이 폴더는 git에 올리지 않습니다(명세 7장). 오산시가족센터 누리집은 robots.txt로 자동 수집을 막고 있으므로 크롤러를 쓰지 않고 사람이 공고를 열어 저장합니다. 시험용 가상 공고는 `test/fixtures/inbox/`에 있으며 `source.json`에 가상임을 적어 둡니다.

## inbox 형식

공고 하나가 폴더 하나이고, 폴더 이름이 프로그램 ID입니다(영문 소문자·숫자·하이픈, 2~64자).

```text
data/local/inbox/osan-fc-kpop-dance/
  source.json   {"url": "https://…", "retrieved_at": "2026-10-15", "institution_hint": "오산시가족센터", "note": "…"}
  page.txt      게시글 본문 (.txt .md .html .htm)
  poster.png    포스터 (.png .jpg .jpeg .webp, 15MB 이하)
  _memo.txt     밑줄(_)이나 점(.)으로 시작하는 파일은 읽지 않음
```

처리 결과는 `data/local/programs/<ID>.json`, 포스터 판독문은 `<ID>.transcripts.json`에 저장됩니다. 판독문은 이미지 해시와 함께 저장되어 같은 이미지는 다시 판독하지 않습니다(다시 판독하려면 이 파일을 지웁니다).

## 명령

```bash
npm run ingest -- [ID ...] [--force] [--no-summary] [--inbox <폴더>]
```

ID를 생략하면 inbox 전체를 차례로 처리합니다. 원문(글 + 포스터 판독문) 해시가 저장된 공고와 같으면 건너뛰고, `--force`로 다시 추출·요약합니다. 다시 추출한 사실이 승인 때와 같으면 승인을 유지하고, 다르면 검수 대기로 되돌립니다. 한 건이 실패해도 나머지를 계속 처리하고 마지막에 표와 오류를 보여 줍니다. Gemini 호출 때문에 공고 한 건에 30초~1분 30초쯤 걸립니다.

요약은 쉬운 한국어·베트남어·중국어 3줄이고, 베트남어·중국어는 보호자 웹 머리에 쓸 그 언어의 제목·운영 기관·대상(`heading`)도 함께 만들어 같은 방식(결정적 검사 + 모델 대조)으로 확인합니다. 머리글이 생기기 전에 만든 요약에는 `npm run headings -- [ID ...] [--force]`로 머리글만 채웁니다(승인된 요약은 `--force`일 때만 다시 만들고, 다시 승인해야 내보냅니다).

```bash
npm run review                                    # 목록: 검수 상태(stale 포함)·대상·경고 수·요약 상태
npm run review -- show <ID>                       # 사실별 근거 인용(✓/✗), 경고, 확인 필요 사항, 언어별 요약·문제, 판독문
npm run review -- approve <ID> --reviewer 이름 [--summaries ko-easy,vi,zh] [--language-reviewer 이름] [--note "메모"] [--force]
npm run review -- reject <ID> --reviewer 이름 --note "사유"
npm run review -- reset <ID>                      # 검수 대기로 되돌림
```

- `approve`·`reject`는 `--reviewer`(원문 사실 대조자)가 꼭 있어야 합니다.
- `approve`는 값이 있는데 원문 근거가 없거나, 지금 값이 근거 인용과 맞지 않는 핵심 사실(대상·참여하는 사람·학년·참여 자격·동반·회차·참석 방식·비용·신청 기간·신청 방법 등)이 있으면 거절합니다. `show`로 원문과 대조한 뒤 맞으면 `--force`로 승인합니다.
- `--summaries`에 승인할 언어를 쉼표로 적습니다. 그 언어의 `machine_checked` 요약을 지금 사실로 다시 검사해 문제가 없을 때만 승인하고, 걸리면 `machine_draft`로 내립니다. `machine_draft`는 승인하지 않습니다.
- 베트남어·중국어 요약은 그 언어의 최종 검수자가 승인해야 하므로 `--language-reviewer`가 없으면 거절합니다(다국어 게시 기준). 머리글이 없거나 머리글 검사에 걸리면 승인하지 않습니다. 언어별 검수자·승인 시각은 요약에 기록됩니다.
- 요약 승인은 그때의 사실과 문구에 묶입니다(`approved_hash`). 승인 뒤 사실이나 문구가 바뀌면(파일을 직접 고친 경우, 사실을 고쳐 공고만 다시 승인한 경우) 그 요약은 내보내지 않고, 다음 `approve`에서 승인이 풀립니다. `reject`·`reset`도 요약 승인을 거둡니다.

그 밖에 `npm test`(네트워크 없이 실행), `npm run typecheck`, `npm start`(서버), `npm run dev`(파일 변경 시 재시작).

## API

게시된 공고(`review.status === 'approved'`이고 `facts_hash`가 지금 사실과 같은 공고)만 보입니다. 응답 형식은 `src/types.ts`의 `ProgramResponse`·`SearchResponse`이고, 보호자 웹의 데이터 계약(`apps/guardian-web/src/data/types.ts`의 `Program`·`SearchResponse`)에 그대로 들어갑니다. `test/contract.test.ts`가 이를 타입으로 확인하므로 한쪽 계약이 바뀌면 `npm run typecheck`가 실패합니다.

| 요청 | 동작 |
|---|---|
| `POST /programs/search` | 본문은 `SearchFilters` JSON. `{}`와 빈 본문은 조건 없는 탐색. 신청 마감·운영 종료·보호자 대상 공고는 빼고 `results`와 `needs_confirmation`(시간 조건을 넣었고 시간 미상)을 돌려줌 |
| `GET /programs/{id}` | 공유 링크용. 검색 조건 없이 판정(`not_applied`). 마감·종료된 공고도 200과 상태(운영이 끝났으면 신청 마감 전이어도 `closed`) |
| `POST /programs/{id}/evaluate` | 검색과 같은 조건·같은 판정으로 상세와 `matched_sessions` |
| `GET /health` | 저장된 공고 수와 게시 수 |

- 상태 코드: 잘못된 조건·JSON·해석할 수 없는 요청 주소는 400(`{error, errors[]}`, 한국어), 없는 공고 404, 있지만 게시되지 않은 공고(검수 대기·반려·승인 뒤 변경) 410, 본문 64KB 초과 413. 내부 오류 내용은 응답에 싣지 않습니다.
- `summaries_by_language`에는 사람이 승인했고 승인 뒤 사실·문구가 바뀌지 않은 요약만 담깁니다. 언어마다 보호자 웹 머리에 쓰는 `title`·`institution`·`target`, 3줄을 이은 `description`, `reviewed_at`(승인 시각, 승인 전이면 생성 시각), `status`, `lines`를 보냅니다. 쉬운 한국어는 원문 제목·기관·대상을 쓰고, 베트남어·중국어는 요약과 함께 만든 그 언어의 머리글(`heading`)을 씁니다. 머리글이 없는 베트남어·중국어 요약은 내보내지 않습니다.
  시연처럼 언어별 검수자가 아직 없을 때는 `SHOW_MACHINE_CHECKED_SUMMARIES=1`로 자동 대조를 통과한 요약도 내보낼 수 있습니다. 이때 `status`가 `machine_checked`로 그대로 가므로 화면에서 검수 전 번역으로 표시해야 합니다. `machine_draft`는 이 설정에서도 내보내지 않습니다.
- `source_evidence`는 원문에서 찾은 근거 인용(`{field, quote}`)입니다. 보호자 화면에서 사실의 원문 표현을 함께 보여 줄 때 씁니다. 기관의 실제 지원 언어(`support_languages`)와 신청 페이지 언어(`application_languages`)는 ISO 639-1 코드(`vi`, `zh` 등)이며 `null`은 미상, `[]`는 확인 결과 없음입니다.
- `application_start`·`application_end`는 보호자 웹 호환을 위해 날짜(`YYYY-MM-DD`)만 보내고, 원문에 시각이 있으면 `application_start_at`·`application_end_at`에 `YYYY-MM-DDTHH:MM`으로 담습니다. 마감이 새벽(`06:00` 전, 예: `00:00`·`01:00`)이면 `application_end`는 전날(신청할 수 있는 마지막 날)이고, 3줄 요약도 같은 날짜로 씁니다.
- 회차 없이 기간만 있는 공고는 원문의 공통 장소를 `venue`(`place_name`·`address`·`dong`·`online`)로 보냅니다. 보호자 웹은 회차가 없을 때 이 장소를 보여 줍니다.
- 회차도 기간도 없이 일정을 대략만 밝힌 공고('11월 중 운영 예정')는 그 원문 표현을 `schedule_note`로 보냅니다. 신청 기간 없이 신청을 대략만 밝힌 표현('일정 확정 후 별도 안내')은 `application_note`로 보냅니다.
- `support_interpretation`은 원문이 기관의 언어 지원을 '통역'이라고 밝혔는지입니다(`true`면 수업 언어가 아니라 통역 지원 언어).
- `notices`는 보호자에게 알리는 안내 문장(보호자 대기 장소, 준비물 등)을 원문 그대로 담습니다. 원문에 글자 그대로 있는 문장만 남깁니다.
- 자녀가 참여하지 않는 공고(성인·보호자만)와 학년·나이 제한이 없는 '누구나' 공고는 학년·나이를 입력해도 `age_grade_match_status`가 `not_applied`입니다.
- `display_language`는 검증만 하고 판정에는 쓰지 않습니다. `matched_reasons`는 한국어입니다.
- `uncertain_items`는 확인할 점을 보호자 웹의 주제(`topic`: 가족 자격·동반·한국어·일정·학년 나이·준비물·기타)로 묶고, 원문 근거가 있으면 그 표현을 `note_ko`로 붙입니다. 비용·신청 기간·신청 방법처럼 보호자 웹이 다른 자리에 보여 주는 항목은 빼고, 한국어 확인 문장 전체는 `uncertain_items_ko`에 그대로 둡니다.
- `application_methods`는 신청을 받는 방법만, 문의만 받는 연락처는 `inquiry_methods`로 보냅니다. 주소가 없는 온라인 신청·문의는 원문 페이지로 연결합니다.
- `next_session`은 대표 회차입니다. 시간이 맞는 첫 회차, 없으면 앞으로 시작할 첫 회차, 운영이 끝났으면 마지막 회차이고, 날짜를 모르면 장소만 있는 회차나 원문의 공통 장소(`venue`)를 날짜 없이 보냅니다.
- `is_demo`는 시연용으로 만든 공고(inbox `source.json`의 `"demo": true`)만 `true`입니다. 보호자 웹은 이 공고의 링크·전화를 실제로 연결하지 않습니다.
- 공고 파일이 바뀌면(수정 시각·크기 확인) 다음 요청부터 다시 읽습니다. 서버를 다시 켤 필요가 없습니다.
- CORS는 `CORS_ORIGINS`의 출처만 허용합니다.

## 시연 데이터 (`demo/`)

MVP 시연용 공고 25건이 `demo/`에 들어 있습니다. 서비스 계정 키 없이도 바로 띄울 수 있도록 추출·요약이 끝난 결과(`demo/programs`)까지 커밋되어 있습니다.

- 오산시가족센터 신청 목록 19건: 실제 목록의 제목·운영 기간·접수 기간·장소에 시연에 필요한 대상·시간·비용·신청 방법을 채운 원문입니다. 채운 내용은 실제 공고와 다를 수 있습니다.
- 보호자 화면 흐름(v4) 시나리오 6건: 토요일 오전만 되는 초등 2학년 보호자가 찾는 장면을 재현합니다. 그중 `demo-saturday-craft`, `demo-korean-play`는 원문 없이 포스터 이미지만 있어 Gemini 포스터 판독 경로를 보여 줍니다.
- 각 공고의 `source.json` `note`에 시연용 원문임을 적어 두었습니다. 화면에는 표시하지 않습니다. 시나리오 6건은 실제로 없는 공고라 `"demo": true`도 적어 두었고, 오산시가족센터 19건은 원문 목록 페이지로 연결됩니다.
- 베트남어·중국어 요약은 자동 대조를 통과한 `machine_checked`이며 제목·기관·대상 머리글까지 채워져 있습니다(언어별 검수자 승인 전).

```bash
npm run demo                      # 시연 데이터로 API 실행 (기준 시각 2026-10-15 10:00 고정, 자동 대조를 통과한 요약도 표시)
npm run demo:ingest -- <ID ...>   # demo/inbox의 공고를 Gemini로 다시 추출·요약하고 바로 승인 (현장 시연, 키 필요)
npm run demo:approve              # 근거가 확인된 시연 공고를 '시연 데이터' 검수자로 승인
npm run demo:headings -- [ID ...] [--force]  # 베트남어·중국어 머리글(제목·기관·대상)만 다시 만듦 (키 필요)
```

현장에서 포스터를 새로 넣어 보여 주려면 `demo/inbox/<새-ID>/`에 `poster.png`와 `source.json`을 넣고 `npm run demo:ingest -- <새-ID>`를 실행한 뒤 보호자 웹을 새로고침합니다. 한 건에 30초~1분 정도 걸립니다.

시나리오 검색(초등 2학년, 토요일 10:05~12:10)의 기대 결과: `results`에 토요 만들기 체험(11월 7일 10:10~12:00)·주말 한국어 놀이교실(11월 14일 10:30~12:00), `needs_confirmation`에 주말 미술 4회 과정(1회차가 지나 중도 참여 확인 필요)이 나오고, 마감된 가족 김밥 만들기 체험과 보호자 대상 공고는 나오지 않습니다.

## 보호자 웹과 함께 실행

```bash
# 터미널 1 (apps/program-api)
npm run demo        # 시연 데이터. 실제 공고(data/local)는 npm start
# 터미널 2 (apps/guardian-web)
VITE_DATA_MODE=api VITE_API_BASE_URL=http://127.0.0.1:8787 npm run dev
```

보호자 웹의 `.env.development`가 `VITE_DATA_MODE=demo`(보호자 웹 안의 가상 공고)라서, API에 붙이려면 `VITE_DATA_MODE=api`를 꼭 같이 줍니다. 시연 날짜를 고정하려면 `PROGRAM_API_NOW=2026-10-15T03:00:00Z npm start`처럼 실행합니다. 승인된 공고가 없으면 목록이 비어 있습니다.
