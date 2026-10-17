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

모델은 Vertex AI의 `gemini-3.8-flash`입니다. 그 밖의 설정: `PROGRAM_DATA_DIR`(기본 `data/local`), `PORT`(기본 8787), `HOST`(기본 127.0.0.1), `CORS_ORIGINS`(기본 `http://127.0.0.1:5173,http://localhost:5173`와 기관 대시보드의 `5174`, `*`는 모두 허용), `PROGRAM_API_NOW`(판정 기준 시각을 ISO로 고정, 시연·시험용), `SHOW_MACHINE_CHECKED_SUMMARIES=1`(아래 요약 설명 참고), `ADMIN_API=1`(기관용 관리자 API, 아래 참고).

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

요약은 쉬운 한국어·베트남어·중국어 3줄이고, 베트남어·중국어는 보호자 웹 머리에 쓸 그 언어의 제목·운영 기관·대상(`heading`)도 함께 만들어 같은 방식(결정적 검사 + 모델 대조)으로 확인합니다. 머리글이 생기기 전에 만든 요약에는 `npm run headings -- [ID ...] [--language vi|zh] [--force]`로 머리글만 채웁니다. 머리글이 없거나 머리글 검사에 걸린 검수 전 요약만 다시 만들고, 승인된 요약은 `--force`일 때만 다시 만듭니다(다시 승인해야 내보냅니다. 다른 언어의 승인을 건드리지 않으려면 `--language`로 한 언어만). `review` 목록과 `show`는 머리글 없이 승인된 베트남어·중국어 요약을 '머리글 없음'(내보내지 않음)으로 보여 줍니다. 안내 문장이 요일마다 따로 운영하는 반('A반(월요일)')을 밝히면 2줄은 반마다 기간·횟수를 따로 쓰고, 확인할 점에 신청 기간이 공고 안에서 다르게 적혔다는 항목이 있으면 3줄에 그 사실을 알리며(사실에 없는 다른 쪽 날짜는 쓰지 않음), 둘 다 코드 검사로 확인합니다.

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
  시연처럼 언어별 검수자가 아직 없을 때는 `SHOW_MACHINE_CHECKED_SUMMARIES=1`로 자동 대조를 통과한 요약도 내보낼 수 있습니다. 이때 `status`가 `machine_checked`로 그대로 가고, 보호자 웹은 그 언어 글을 보여 주되 '원문과 대조한 안내' 표시는 하지 않습니다. `machine_draft`는 이 설정에서도 내보내지 않습니다.
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

## 포스터 통번역 (원본 디자인 유지 + 검증 루프)

기관 담당자가 만든 한국어 포스터를 **디자인은 그대로 두고 글만** 베트남어·중국어로 옮깁니다. 이미지 생성 모델이 만든 결과를 다른 모델과 코드가 다시 읽어 검증하고, 틀린 곳만 짚어 다시 만들게 합니다.

```text
① 원본 판독(Gemini) → ② 번역표(문구마다 한국어 ↔ 번역, 코드 검사) → ③ 이미지 편집(OpenAI, 원본 + 번역표)
→ ④ QR 원본 이식·재스캔 → ⑤ 검증(Gemini가 결과를 처음부터 다시 읽음 + 코드 대조) → 틀리면 ③으로 (최대 3회) → ⑥ 통과한 것만 내보냄
```

- **번역표 코드 검사**: 문구마다 전화번호·시각·날짜·숫자·주소가 그대로인지 확인합니다(`src/poster/tokens.ts`). 한국어 `10/19`(월/일)와 베트남어 `19/10`(일/월)을 같은 날로 보고, 베트남어에서 월/일 순서로 쓰면 다른 날로 잡습니다. 걸린 문구는 이유를 알려 모델이 다시 고칩니다.
- **QR**: 이미지 모델은 QR을 '비슷한 무늬'로 다시 그립니다. 원본 QR을 읽고, 번역본에서 QR 자리를 찾아 원본 픽셀을 옮긴 뒤 다시 스캔해 주소가 같은지 확인합니다(`src/poster/qr.ts`). 납작하게 늘어난 QR도 비율을 지켜 옮깁니다.
- **검증**: 생성(OpenAI)과 다른 모델(Gemini)이 결과를 다시 읽고, ⓐ 번역표의 값이 모두 있는지·없던 값이 생기지 않았는지(코드) ⓑ 옮겨야 할 한국어가 남았는지(코드, 로고 글자는 제외) ⓒ QR 주소가 같은지(코드) ⓓ 문구가 뜻이 맞게·글자가 깨지지 않고 들어갔는지(모델)를 봅니다. 문제가 있으면 '직전 결과 + 원본 + 지적 목록'으로 다시 편집합니다.
- 3회 안에 통과하지 못하면 내보내지 않고, 보호자 화면은 원본 포스터와 검수된 다국어 안내를 보여 줍니다. 자동 검증을 통과한 결과는 `machine_checked`이고, 사람이 확인하면 `approved`로 바꿉니다.
- 실제 기관 포스터와 번역본은 이용 조건 확인 전까지 커밋하지 않습니다. 원본은 `data/local/inbox/<ID>/poster.*`, 결과는 `data/local/translated/`(`<ID>.<언어>.png`, 검증 기록 `<ID>.<언어>.json`, 시도별 이미지 `<ID>.<언어>.attempt-N.png`)에 둡니다. 시연 데이터(`demo/`)로 서버를 띄워도 포스터는 이 폴더(`POSTER_DATA_DIR`, 기본 `data/local`)에서 읽습니다.
- OpenAI 키는 `OPENAI_API_KEY`(저장소 맨 위 `.env` 또는 이 폴더의 `.env.local`), 모델은 `OPENAI_IMAGE_MODEL`(기본 `gpt-image-2.5-sunburst`)입니다. 한 장 한 언어에 1회차로 통과하면 1분 30초쯤 걸립니다.

```bash
npm run poster -- [ID ...] [--lang vi,zh] [--attempts 3] [--force]   # inbox에 포스터가 있는 공고를 옮긴다
npm run poster -- <ID> --lang vi --force --demo-fault                 # 시연용: 1회차 지시에 일부러 오류를 넣어 루프가 잡아 고치는 장면
npm run poster -- list                                                # 공고·언어별 상태
npm run poster -- approve <ID> --lang vi --reviewer 이름               # 사람이 확인한 번역 포스터 승인
```

## AI 상담 에이전트

보호자 웹의 'AI에게 물어보기'가 부르는 상담 에이전트입니다(`src/agent/`). Gemini가 도구를 골라 쓰고, 도구는 **검수·게시된 공고와 기존 판정 로직만** 씁니다.

| 도구 | 하는 일 |
|---|---|
| `search_programs` | 학년·나이·가능 시간·분야로 공고 찾기 (명세 5.1 판정 그대로) |
| `get_program` | 공고 한 건의 사실 전부와 원문 근거 인용. 미상은 '공고에 없음'으로 |
| `check_fit` | 아이 조건과 비교 (명세 4장 판정). 자격은 확정하지 않음 |
| `draft_inquiry` | 공고에 답이 없는 질문을 기관에 보낼 한국어 문의문으로. 연락처는 공고에서 확인된 것만 |
| `flag_unanswered` | 공고에 답이 없던 질문 표시 (저장하지 않음) |
| `respond` | 보호자 언어로 답하고 근거 인용을 붙여 끝냄 |

- 공고에 없는 것은 추측하지 않고 "공고에는 없어요"라고 말한 뒤 문의문을 만듭니다. 참여 자격을 단정하지 않고 확인된 것과 확인할 것을 나눕니다. 이름·국적·연락처는 묻지 않습니다.
- 모델이 낸 원문 인용은 코드가 그 공고의 검증된 근거·안내 문장·기관 추가 안내에서 다시 찾아, 없으면 버립니다(`verifiedCitations`). 인용마다 공고 원문(`notice`)인지 기관 추가 안내(`addendum`)인지 붙여 보호자 화면이 구별해 보여 줍니다.
- 보호자가 '기관에 이름 없이 알리기'를 누를 때만 `{공고, 주제, 일반화한 질문, 날짜}`를 `<데이터 폴더>/questions/questions.jsonl`에 남깁니다. 기관 대시보드의 '보호자 질문' 화면이 이것을 공고별·주제별로 모으고, 아래 공고 보완 도우미가 추가 안내 초안을 씁니다.

| 요청 | 동작 |
|---|---|
| `POST /agent/chat` | `{messages: [{role, text}], locale, program_id?}` → `{reply, citations, follow_ups, steps, programs, inquiry, unanswered}`. 모델 오류는 503 |
| `POST /agent/questions` | `{program_id, topic, question_ko}` 저장 (게시된 공고만) |
| `GET /agent/questions` | 공고별·주제별 집계 |
| `GET /posters/{id}` | 원본 포스터 유무와 내보낼 수 있는 번역 포스터의 검증 요약 |
| `GET /posters/{id}/original` · `/vi` · `/zh` | 포스터 이미지. 번역본은 승인됐거나 시연 설정(`SHOW_MACHINE_CHECKED_SUMMARIES=1`)에서 자동 검증을 통과한 것만, 원본이 바뀌면 내림 |

## 기관용 관리자 API와 공고 보완 도우미

기관 대시보드(`apps/institution-dashboard`)가 쓰는 API입니다(`src/admin/`). **로그인이 없으므로** `ADMIN_API=1`일 때만 열리고(`npm run demo`는 켬), 시연이나 기관 내부망에서만 씁니다. 다른 사이트의 페이지가 보낸 요청을 막으려고 `CORS_ORIGINS`에 없는 출처(Origin)는 403, JSON이 아닌 POST 본문은 415로 거절합니다(`CORS_ORIGINS=*`이면 이 보호가 꺼집니다). 게시 여부와 상관없이 모든 공고를 보고, 사람 검수 CLI(`npm run review`, `npm run poster approve`)와 같은 규칙으로 저장합니다.

| 요청 | 동작 |
|---|---|
| `GET /admin/programs` | 모든 공고의 검수 상태, 근거 미확인 사실 수, 언어별 요약·번역 포스터 상태, 확인할 점 수, 기관 추가 안내 |
| `GET /admin/programs/{id}` | 검수 화면: 사실마다 값·원문 근거 인용·확인 상태, 원문 글·포스터 판독문, 언어별 요약, 번역 포스터의 회차별 검증 기록 |
| `POST /admin/programs/{id}/review` | `{action: approve\|reject\|reset, reviewer, summaries?, language_reviewer?, note?, force?}`. 근거가 확인되지 않은 핵심 사실이 있으면 `force`(담당자가 원문과 직접 대조했다는 표시) 없이는 409 |
| `GET /admin/posters/{id}/original` · `/vi` · `/zh` · `/vi-2` | 원본·내보내는 번역본·n회차 시도 이미지 |
| `POST /admin/posters/{id}/{vi\|zh}/approve` | `{reviewer}`. 자동 검증을 통과했고 원본이 그대로인 번역 포스터만 |
| `POST /admin/programs/{id}/improve` | `{questions: [{question_ko, topic, count}]}` → 공고 보완 도우미의 초안·검사 기록. 모델 오류는 503 |
| `POST /admin/programs/{id}/addenda` | `{author, items: [{topic, text, resolves_questions, resolves_items, drafted_by_ai}]}` 기관 추가 안내 저장 |
| `DELETE /admin/programs/{id}/addenda/{addendumId}` | 추가 안내 지우기 |
| `POST /admin/planning/propose` | `{questions: [{question_ko, topic, count}]}` → 편성 도우미의 편성안·검사 기록. 언제·어디서·닿는 가정 수는 `@osan-kids-bridge/planning`의 `recommend()`(합성 데이터)가 계산하고, 근거 문장의 숫자는 코드가 도구 결과와 대조한다. 검사한 편성안 없이 모델 호출이 실패하면 503 (아래 '편성 도우미') |

**공고 보완 도우미**(`src/admin/improve.ts`)는 보호자가 공고에서 답을 찾지 못한 질문으로 '기관 추가 안내' 초안을 쓰는 에이전트입니다.

```text
read_notice(공고 사실·원문 인용·확인할 점) → read_questions(질문·알린 사람 수) → 초안 → check_draft(코드 검사) → 고쳐 쓰기 → submit(같은 검사를 다시 통과해야 받음)
```

- 항목마다 `already_in_notice`(공고에 답이 이미 있음: 원문 인용을 코드가 다시 찾아 확인) 또는 `add_notice`(공고에 덧붙일 안내)로 나눕니다.
- 기관만 아는 값(금액, 가능 여부, 준비물 등)은 AI가 정하지 않고 `{{빈칸}}`으로 남깁니다. 코드 검사(`src/admin/check.ts`, 포스터 루프의 고정값 추출을 다시 씀):
  - `add_notice`: 빈칸 밖에 답을 단정하는 말('무료', '가능합니다', '할 수 있어요', '없어요', '제공해요' 등)을 쓸 수 없고, 숫자·날짜·시각·전화·인터넷 주소와 단위가 붙은 수량('3명')은 공고에서 확인된 글에 있는 것만 다시 쓸 수 있습니다.
  - `already_in_notice`: 다시 쓴 문장의 고정값·수량·단정은 **인용한 원문 문장**에 있어야 하고, 단정의 대상 낱말('참가비는 무료')도 그 문장에 있어야 합니다. 공고 다른 곳의 '주차는 무료'를 근거로 '참가비는 무료'라고 쓰지 못합니다.
  - 낱말 단위의 규칙이라 모든 지어냄을 막지는 못합니다. 그래서 공고에 이미 있는 답은 담당자가 골라야 덧붙이고, 빈칸은 담당자가 채워야 저장됩니다.
- 담당자가 빈칸을 채우고 고른 항목만 저장합니다. 저장할 때 빈칸이 남았거나, '기관에 확인할 점' 목록에 없는 문구를 풀겠다고 하면 400입니다.
- 추가 안내(`addenda`)는 원문이 아니라 담당자가 이름을 걸고 확정한 문장이라 사실 해시에 넣지 않습니다(덧붙여도 원문 검수가 풀리지 않음). 저장하면 바로 ① 상담 에이전트의 `get_program`에 `institution_addenda`로 들어가 인용할 수 있고 ② 고른 '기관에 확인할 점'이 보호자 화면에서 빠집니다.

### 편성 도우미 (`POST /admin/planning/propose`)

**편성 도우미**(`src/admin/planner.ts`)는 보호자 익명 통계·못 찾은 질문·지금 공고를 보고 다음 프로그램을 **무엇을·누구에게·언제·어디서** 열지 편성안을 쓰는 에이전트입니다. 통계는 `@osan-kids-bridge/planning`의 합성 응답 400가정(시연용)이고, 기관 대시보드 화면과 같은 데이터·같은 계산을 씁니다.

```text
read_demand(학년대·분야별 익명 통계) · read_questions(질문·주제별 건수) · read_programs(운영 중인 초등 아이 대상 공고)
→ simulate_plan(대상·반 수·정원 → recommend()가 요일·시간·장소 조합을 모두 비교해 1~3안, '지금처럼 모두 토요일 오전'과 비교, 최대 4번)
→ check_plan(코드 검사) → 고쳐 쓰기 → submit_plan(같은 검사를 다시 통과해야 받음)
```

- 모델은 대상(분야·학년)과 근거 문장만 고릅니다. 언제·어디서·닿는 가정 수는 계산 결과에서 오고, 편성안 카드의 숫자는 서버가 계산 결과로 다시 만듭니다.
- 도구가 내보낸 숫자는 모두 `{fact, value}`로 기록합니다(`FactLedger`). 1~4가정인 칸은 가려서 fact로 남기지 않고, 그 칸에서 계산되는 비율·차이도 내지 않습니다.
- 코드 검사(`src/admin/plan-check.ts`):
  - 근거 문장의 숫자는 인용한 fact와 값·단위(가정·%·개·건·명)가 같아야 합니다. 같은 뜻의 단위('가구', '프로')도 읽습니다.
  - 숫자를 한글로 쓰면('네 가정', '삼십 프로') 받지 않습니다. 학년·반·안 번호('1~4학년', '2개 반', '1안')만 fact 없이 씁니다.
  - 적어도 한 근거는 이 안의 계산 결과(닿는 가정·비율·차이)를 인용해야 하고, 차이의 방향('더·덜')도 인용한 fact와 맞아야 합니다.
  - 제목은 이 안의 대상 학년·반 수 말고는 숫자를 쓰지 않습니다. 단정('보장', '반드시')과 받지 않는 개인 정보('국적', '체류', '비자')는 띄어 쓰거나 기호를 섞어도 받지 않습니다.
  - 낱말 단위의 규칙이라 모든 표현을 막지는 못합니다. 그래서 숫자 칩(도구 결과에서 확인한 값)을 카드에 함께 보이고, 결정은 담당자가 합니다.
- 전체 마감은 120초입니다. 마감이 지나면 새 턴을 시작하지 않고, 한 번의 시도는 45초와 남은 시간 중 짧은 쪽(최소 10초)만 기다리며, 마감 안에 끝낼 수 없는 재시도는 하지 않습니다. 그래서 한 요청은 보통 길어도 약 130초 안에 끝납니다(Gemini SDK 안의 인증 토큰 갱신처럼 이 시간 제한 밖에서 기다리는 일은 드물게 더 걸릴 수 있음).
- 통과한 제출본 없이 끝나면 마지막으로 검사한 편성안을 검사 문제와 함께 돌려줍니다(`passed: false`). 검사한 편성안 없이 모델 호출이 실패하면 503이고, 오류 없이 검사까지 가지 못하고 끝나면(턴·시간 한도, 도구 없이 두 번 답함) 빈 편성안(`proposals: []`)을 200으로 돌려줍니다. `AGENT_DEBUG=1`이면 턴마다 걸린 시간을 서버 기록에 남깁니다.

## 시연 데이터 (`demo/`)

MVP 시연용 공고 25건이 `demo/`에 들어 있습니다. 서비스 계정 키 없이도 바로 띄울 수 있도록 추출·요약이 끝난 결과(`demo/programs`)까지 커밋되어 있습니다.

- 오산시가족센터 신청 목록 19건: 실제 목록의 제목·운영 기간·접수 기간·장소에 시연에 필요한 대상·시간·비용·신청 방법을 채운 원문입니다. 채운 내용은 실제 공고와 다를 수 있습니다. 그중 K-pop 방송댄스·우리 zip. 운동회는 실제 포스터(2026-10-17 확인)의 내용을 신청·모집 기간까지 옮겨 적어 대상·일정·장소·문의처가 번역 포스터와 같습니다(K-pop의 A반·B반 구성은 포스터의 반별 날짜·정원을 ※ 한 줄로 풀어 적음). 신청 기간은 목록의 접수 기간을 쓰고, 포스터의 기간과 다른 점(K-pop: 목록 10/1~10/17, 포스터 9/28~10/14)은 확인할 점으로 남깁니다.
- 보호자 화면 흐름(v4) 시나리오 6건: 토요일 오전만 되는 초등 2학년 보호자가 찾는 장면을 재현합니다. 그중 `demo-saturday-craft`, `demo-korean-play`는 원문 없이 포스터 이미지만 있어 Gemini 포스터 판독 경로를 보여 줍니다.
- 각 공고의 `source.json` `note`에 시연용 원문임을 적어 두었습니다. 화면에는 표시하지 않습니다. 시나리오 6건은 실제로 없는 공고라 `"demo": true`도 적어 두었고, 오산시가족센터 19건은 원문 목록 페이지로 연결됩니다.
- 베트남어·중국어 요약은 자동 대조를 통과한 `machine_checked`이며 제목·기관·대상 머리글까지 채워져 있습니다(언어별 검수자 승인 전).

```bash
npm run demo                      # 시연 데이터로 API 실행 (기준 시각 2026-10-15 10:00 고정, 자동 대조를 통과한 요약도 표시, 관리자 API 켬)
npm run demo:ingest -- <ID ...>   # demo/inbox의 공고를 Gemini로 다시 추출·요약하고 바로 승인 (현장 시연, 키 필요)
npm run demo:approve              # 근거가 확인된 시연 공고를 '시연 데이터' 검수자로 승인
npm run demo:headings -- [ID ...] [--force]  # 머리글(제목·기관·대상)이 없거나 검사에 걸린 베트남어·중국어 요약에 머리글만 채움 (키 필요, --force면 모두 다시)
```

`npm run demo`는 켤 때마다 `demo/programs`·`demo/inbox`를 `data/local/demo-session/`(gitignore)에 새로 복사해 그 사본으로 띄웁니다. 기관 대시보드에서 공고를 승인·반려하거나 추가 안내를 덧붙여도 커밋된 `demo/`는 바뀌지 않고, 서버를 다시 켜면 공고는 처음 상태로 돌아갑니다(이어 쓰려면 `DEMO_KEEP_SESSION=1`). 보호자가 보낸 질문은 사본 폴더의 `questions/`에, 번역 포스터 승인은 포스터 폴더(`data/local/translated`)에 그대로 남습니다.

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
