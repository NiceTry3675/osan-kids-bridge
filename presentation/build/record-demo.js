// 2분 시연영상 녹화 (headless Chrome 화면 기록 → ffmpeg로 mp4). 장면과 내레이션 대본은 ../demo-script.md와 같다.
// 먼저 API(8787)·보호자 웹(5173)·기관 대시보드(5174)를 띄우고, node prepare-assets.js를 실행해 둔다.
// node record-demo.js             → ../osan-kids-bridge-demo.mp4 (제출용, 화면 글자 최소)
// PROMPTER=1 node record-demo.js  → ../osan-kids-bridge-demo-prompter.mp4 (내레이션 녹음용, 아래에 대본이 뜬다)
// 실제 포스터가 들어가므로 영상은 커밋하지 않는다.
//
// 시연영상이다: 장면마다 부모님이나 기관 담당자가 실제 화면에서 하는 일을 따라가고, 에이전트는 그 행동의 결과로 나온다.
// 문제 정의는 발표자료가 맡는다. 중심 메시지는 '부모님이 몰랐던 것과 묻지 못했던 것이 기관에 닿아, 공고와 다음 프로그램이 바뀐다'.
// 그래서 표지는 부모님 ↔ 기관 순환(못 찾은 질문 → 덧붙인 안내)이고, 포스터 통번역은 부모님이 포스터를 본 뒤의 짧은 '뒷이야기'다.
// 언어: 제품이 실제로 내는 쉬운 한국어·베트남어·중국어만 보인다(첫 가정은 베트남어 화면, 다른 가정은 중국어 화면).
// 낱말: 나라·국적은 말하지 않는다. 사람은 '부모님', 가구·통계는 '가정'. 언어 이름은 화면이 필요할 때만(언어를 누를 때, 중국어 화면 장면). 앱 화면 글자는 그대로 둔다.
//
// 화면 구성: 부모님 휴대폰(보호자 웹)·기관 관리자 화면·포스터 무대를 한 장의 큰 캔버스(world)에 놓고, 카메라(transform)가 그 위를 움직인다.
// 앱 안의 버튼은 커서를 그 자리로 옮긴 뒤 DOM click으로 누른다(무대가 확대·축소되어 좌표 클릭이 어긋나므로).
//
// 정직하게 줄인 것: 포스터 통번역은 실제 실행 기록(translated/*.json과 회차별 이미지)을 다시 보여 주며 시간을 줄였고,
// 상담 답 두 번·공고 보완 초안·편성안은 녹화 직전(편성안은 capture.js plan)에 실제 API로 받은 결과를 녹화 중에 몇 초 만에 돌려준다(실제 응답 10~30초). 화면 구석 표시로 밝힌다.
// 두 번째 상담 답(중국어)은 영상에서 담당자가 덧붙일 것과 같은 추가 안내를 미리 저장해 받은 뒤 지운다(녹화는 추가 안내가 없는 상태에서 시작).
// 베트남어 포스터 승인은 녹화를 시작하기 전에 실제 API로 한다(부모님 장면이 포스터 장면보다 앞이라, 부모님이 보는 '담당자 확인' 줄이 녹화 안에서 사실이게).
// 승인 전 포스터 기록을 render/에 보관해 두고 녹화가 끝나면(실패해도) 되돌린다.
// API는 npm run demo로 새로 띄운 상태(관리자 API 켬)여야 한다.
const { chromium } = require('playwright-core')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const PROMPTER = process.env.PROMPTER === '1'
const WORK = path.resolve(__dirname, PROMPTER ? 'render/video-prompter' : 'render/video')
const OUT = path.resolve(__dirname, PROMPTER ? '../osan-kids-bridge-demo-prompter.mp4' : '../osan-kids-bridge-demo.mp4')
const API = 'http://127.0.0.1:8787'
const GUARDIAN = 'http://127.0.0.1:5173'
const DASHBOARD = 'http://127.0.0.1:5174'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROGRAM = 'osan-fc-sports-day'
const QUESTION = 'Con tôi 8 tuổi. Tôi và con đi được không? Có cần chuẩn bị gì không?'
const QUESTION_KO = '아이가 8살이에요. 저와 아이가 갈 수 있나요? 준비물이 있나요?'
/** 다시 묻기는 중국어가 편한 다른 가정 */
const QUESTION_AGAIN = '运动会要交参加费吗？需要带什么？'
const QUESTION_AGAIN_KO = '운동회 참가비가 있나요? 무엇을 가져가요?'
const REVIEWER = '담당자(시연)'
/** 영상에서 담당자가 빈칸에 넣는 값 (시연용 가정, 화면 구석에 밝힌다) */
const FILL = { other: '무료', materials: '운동하기 편한 옷과 운동화' }
/** 기관 대시보드의 시연용 예시 질문 중 이 공고의 것 (apps/institution-dashboard/src/data/questions.ts와 같게) */
const DEMO_QUESTIONS = [
  { question_ko: '참가비가 있나요?', topic: 'other', count: 9 },
  { question_ko: '준비물이나 복장 규정이 있나요?', topic: 'materials', count: 7 },
  { question_ko: '형제자매도 함께 참여할 수 있나요?', topic: 'companion', count: 5 },
  { question_ko: '오산시에 살지 않아도 참여할 수 있나요?', topic: 'family_eligibility', count: 3 },
]
const QUESTIONS_FILE = path.join(ROOT, 'apps/program-api/data/local/demo-session/questions/questions.jsonl')
const TRANSLATED = path.join(ROOT, 'apps/program-api/data/local/translated')
const REPORT = path.join(TRANSLATED, `${PROGRAM}.vi.json`)
/** 같은 포스터의 중국어 번역 기록 (포스터 장면에서 베트남어와 나란히) */
const REPORT_ZH = path.join(TRANSLATED, `${PROGRAM}.zh.json`)
/** 녹화 전에 실제로 승인하는 베트남어 포스터 기록의 승인 전 사본. 녹화가 끝나면(실패해도) 이것으로 되돌려 다음 녹화도 '담당자 확인 전'에서 시작한다 */
const REPORT_BACKUP = path.resolve(__dirname, 'render/poster-report-before-approval.json')
/** 편성 도우미의 실제 결과(capture.js plan이 받아 둔 것). 발표자료 캡처와 같은 편성안을 영상에서도 쓴다. 없으면 녹화 전에 받는다 */
const PLAN_FIXTURE = path.resolve(__dirname, 'render/plan-result.json')
/** 기관 대시보드의 시연용 예시 질문 전체 (편성 도우미가 읽는 질문, apps/institution-dashboard/src/data/questions.ts와 같게) */
const PLAN_QUESTIONS = [
  ...DEMO_QUESTIONS,
  { question_ko: 'A반과 B반을 모두 신청할 수 있나요?', topic: 'schedule', count: 6 },
  { question_ko: '한국어를 잘 못해도 참여할 수 있나요?', topic: 'korean_level', count: 4 },
  { question_ko: '중간에 하루 빠져도 되나요?', topic: 'schedule', count: 3 },
  { question_ko: '베트남어 통역이 있나요?', topic: 'korean_level', count: 8 },
  { question_ko: '아이와 함께 가야 하나요?', topic: 'companion', count: 4 },
]
const local = (file) => 'file://' + path.join(ROOT, 'apps/program-api/data/local', file)

/**
 * 장면별 내레이션. 장면 길이는 '읽는 데 드는 시간'(초당 4.6음절 + 쉼표·마침표마다 0.3초 + 여유 0.6초)보다 짧아지지 않는다.
 * chip은 장면 표시('누가 · 어떤 에이전트': 장면에 들어갈 때 왼쪽 위에 크게, 그 뒤 왼쪽 아래에 작게), 제출용 영상의 화면 글자는 이것과 구석의 '줄인 것' 표시, 한국어 풀이 몇 개뿐이다.
 * 화면의 중요한 순간은 그 말을 읽기 시작하는 시각(cue: 장면 시작부터 같은 속도로 셈)에 맞춰 at()으로 놓고, mark()로 timings.json에 남긴다.
 */
const SCENES = {
  // 표지: 부모님 ↔ 기관 순환(못 찾은 질문 → 덧붙인 안내). 포스터 변환은 표지에 쓰지 않는다
  opening: { chip: '', say: '부모님이 못 찾은 질문이 기관에 가면, 안내가 돼서 돌아와요.' },
  // 언어 이름은 화면이 필요할 때만(Tiếng Việt를 누를 때) 말한다. 나라·국적은 말하지 않는다
  guardian: { chip: '부모님 · 베트남어 화면', say: '언어는 아직 세 개예요. 베트남어로 해 볼게요. 여덟 살, 토요일 낮. 이렇게만 넣으면, 맞는 공고가 이유랑 같이 떠요. 포스터도 번역돼 있어요.' },
  // 부모님이 본 포스터의 뒷이야기. 업로드 화면은 없다: 기관 공고 수집함(inbox)에 들어온 포스터를 서버에서 번역한다
  poster: { chip: '뒷이야기 · 포스터 통번역 에이전트', say: '이 포스터는 글만 바꾸고, 다른 AI가 다시 읽어요. 빨간 건 일부러 넣은 날짜 오류예요. 고친 걸 담당자가 승인했어요.' },
  consult: { chip: '부모님 · 상담 에이전트', say: '여덟 살 아이랑 가도 되는지, 뭘 챙길지 물어볼게요. 공고를 읽더니, 준비물은 안 나와 있대요. 그래서 기관에 물어볼 말은 한국어로 써 줘요. 이건 이름 없이 알릴게요.' },
  improve: { chip: '기관 담당자 · 공고 보완 에이전트', say: '방금 그 질문이 들어왔어요. 초안은 AI가 쓰는데, 참가비처럼 기관만 아는 건 빈칸으로 둬요. 지어내면 코드가 막아요. 담당자가 채워서 덧붙이면, 질문에 답했다고 떠요.' },
  again: { chip: '다른 가정 · 중국어 화면', say: '중국어가 편한 다른 가정이에요. 아까 그 안내가 보여요. 참가비랑 준비물을 물으면, 이번엔 그 안내를 보고 답해요.' },
  plan: { chip: '기관 담당자 · 편성 에이전트', say: '통계는 가상 응답이에요. AI 편성안을 만들어 보면, 초등 한국어 교실 두 반이 나와요. 토요일 오전에 열 때보다, 맞는 가정이 거의 두 배예요.' },
  ending: { chip: '', say: '부모님의 질문이 다음 프로그램이 되는 곳. 잇다, 오산이었습니다.' },
}
/** 학생이 또박또박 읽는 속도 */
const SYLLABLES_PER_SECOND = 4.6
/** 쉼표·마침표에서 실제로 읽는 사람이 쉬는 시간(초) */
const PAUSE_SECONDS = 0.3
/** 제출 규정 2분. 녹음 앞뒤 여유를 두고 이보다 길면 인코딩 전에 멈춘다 */
const MAX_SECONDS = 118
const syllables = (text) => (text.match(/[가-힣A-Za-z0-9]/g) ?? []).length
const pauses = (text) => (text.match(/[,.]/g) ?? []).length
/** 대본 text를 읽는 데 드는 초 (쉼 포함, 앞뒤 여유 빼고) */
const readSeconds = (text) => syllables(text) / SYLLABLES_PER_SECOND + pauses(text) * PAUSE_SECONDS
const sayMs = (text) => Math.round((readSeconds(text) + 0.6) * 1000)
/** 장면 key의 대본에서 phrase를 읽기 시작하는 시각(장면 시작부터 초). 화면의 중요한 순간을 그 말에 맞출 때 쓴다 */
const cue = (key, phrase) => {
  const say = SCENES[key].say, index = say.indexOf(phrase)
  if (index < 0) throw new Error(`대본(${key})에 '${phrase}'가 없습니다.`)
  return Math.round(readSeconds(say.slice(0, index)) * 100) / 100
}

/** 상담 에이전트 도구 이름 → 보호자 웹의 쉬운 한국어 단계 이름 (apps/guardian-web/src/i18n/messages.ts의 step*와 같게) */
const TOOL_KO = {
  search_programs: (step) => `공고 찾기 (${step.count ?? 0}개)`,
  get_program: () => '공고 읽기',
  check_fit: () => '우리 아이 조건과 비교',
  flag_unanswered: () => '공고에 답이 없는 질문 표시',
  draft_inquiry: () => '기관에 물을 문장 만들기',
}
/** 보호자 웹 ChatSheet의 uniqueSteps와 같게: 같은 일을 연달아 한 단계는 한 번만 */
const uniqueSteps = (steps) => steps.filter((step, index) => index === 0 || step.tool !== steps[index - 1].tool || step.program_id !== steps[index - 1].program_id)
const railSteps = (reply) => uniqueSteps(JSON.parse(reply).steps ?? [])
  .map((step) => ({ label: step.ok ? (TOOL_KO[step.tool]?.(step) ?? step.tool) : '실패한 단계', tool: step.tool }))

// ---- 캔버스 배치 (world 좌표) ----
/** 부모님 휴대폰(보호자 웹): 375×812 앱을 0.82배로 */
const PHONE = { x: 486, y: 27, k: 0.82, w: 375, h: 812 }
/** 기관 관리자 화면: 1600×866 앱을 0.75배로 (창 머리 26px 아래) */
const DESK = { x: 1720, y: 46, k: 0.75, w: 1600, h: 866 }
/** 포스터 무대(표지·포스터 통번역·마무리): 휴대폰·기관 화면 위쪽 */
const SHOW = { x: 800, y: -1700 }
const SLOT_PHONE = { x: 0, y: 0, w: 1280, h: 720 }
/** 확대했을 때 테두리 밖이 비치지 않게 할 범위 */
const PHONE_FRAME = { x: 0, y: 18, w: 1280, h: 684 }
/** 기관 화면 창(창 머리 포함, y 20~696) 위로 20px까지: 화면 맨 위를 찍을 때도 위 띠(큰 장면 표시)가 앱 글자를 덮지 않게 */
const DESK_FRAME = { x: 1720, y: 0, w: 1200, h: 696 }
const SLOT_SHOW = { x: SHOW.x, y: SHOW.y, w: 1280, h: 720 }
/** 넓게 보기(휴대폰 ↔ 기관 화면과 두 화살표). 휴대폰 캔버스 이름(제공 언어 셋)이 왼쪽 끝에 잘리지 않게 조금 더 넓게 */
const OVERVIEW = { x: 370, y: -150, w: 2600, h: 950 }
/** 표지: 넓게 보기 위에 서비스 이름과 한 줄 소개(#loopTitle)까지 */
const OPENING = { x: 370, y: -600, w: 2600, h: 1440 }
const inShow = (r) => ({ x: SHOW.x + r.x, y: SHOW.y + r.y, w: r.w, h: r.h })
const toWorld = (box, r) => ({ x: box.x + r.x * box.k, y: box.y + r.y * box.k, w: r.w * box.k, h: r.h * box.k })
const union = (list) => {
  const x = Math.min(...list.map((r) => r.x)), y = Math.min(...list.map((r) => r.y))
  return { x, y, w: Math.max(...list.map((r) => r.x + r.w)) - x, h: Math.max(...list.map((r) => r.y + r.h)) - y }
}

const STAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  /* 앱의 scrollIntoView가 무대 문서까지 스크롤하지 못하게 (clip은 코드로 하는 스크롤도 막는다) */
  html, body { overflow: clip; }
  :root { --cream: #FBF6EE; --ink: #3A2F2A; --ink2: #6B5E57; --green: #1F7A5C; --green-soft: #E3F0E8; --coral: #E07A5F; --coral-soft: #FCE6DC; --red: #C2410C; }
  body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Apple SD Gothic Neo', sans-serif; color: var(--ink);
    background: var(--cream) radial-gradient(circle at 1px 1px, rgba(58,47,42,.08) 1px, transparent 0) 0 0 / 22px 22px; }
  #world { position: absolute; left: 0; top: 0; width: 1px; height: 1px; transform-origin: 0 0; }
  .slot-label { position: absolute; text-align: center; font-size: 54px; font-weight: 800; color: var(--green); }
  .slot-label small { display: block; font-size: 32px; font-weight: 600; color: var(--ink2); margin-top: 4px; }
  .slot-label small.langs { font-size: 30px; }
  /* 표지의 서비스 이름과 한 줄 소개 (world 좌표, 넓게 보기 위 빈 캔버스) */
  .loop-title { position: absolute; left: 670px; top: -560px; width: 2060px; text-align: center; transition: opacity .45s; }
  .loop-title.off { opacity: 0; }
  .loop-title h1 { font-size: 150px; line-height: 1.1; margin: 0; }
  .loop-title p { font-size: 62px; line-height: 1.35; font-weight: 700; color: var(--ink2); margin-top: 16px; }
  .loop-title p b { color: var(--coral); font-weight: 800; }
  .loop-title p em { font-style: normal; color: var(--green); font-weight: 800; }
  /* 포스터 장면: 액자 위 언어 이름 */
  .pf-cap { position: absolute; text-align: center; font-size: 20px; font-weight: 800; color: var(--ink2); }
  .pf-cap span { color: var(--green); }
  #phone { position: absolute; left: 477px; top: 18px; padding: 9px; border-radius: 42px; background: #2B2320; box-shadow: 0 24px 60px rgba(58,47,42,.28); }
  /* 휴대폰 화면·기관 화면 창은 clip: hidden이면 앱 안의 scrollIntoView·focus가 이 상자까지 몰래 스크롤해(iframe은 축소 전 크기로 놓여 상자보다 크다)
     앱 화면이 몇 px 밀려 그려지고, 잰 자리에 놓은 테두리가 어긋난다 */
  #phone .screen { width: 307.5px; height: 665.84px; overflow: clip; border-radius: 33px; background: #fff; }
  #phone iframe { width: 375px; height: 812px; border: 0; transform: scale(.82); transform-origin: 0 0; display: block; }
  #desk { position: absolute; left: 1720px; top: 20px; width: 1200px; height: 676px; border-radius: 16px; overflow: clip; background: #fff; box-shadow: 0 24px 60px rgba(58,47,42,.25); }
  #desk .bar { height: 26px; background: #EFE7DC; display: flex; align-items: center; gap: 7px; padding: 0 12px; font-size: 12px; color: var(--ink2); }
  #desk .bar i { width: 10px; height: 10px; border-radius: 50%; background: #D9CBBB; display: block; }
  /* 창 이름은 오른쪽 끝에: 카메라가 왼쪽 열을 빼고 찍어도 반쯤 잘리지 않게 */
  #desk .bar span { margin-left: auto; margin-right: 6px; }
  #desk iframe { width: 1600px; height: 866px; border: 0; transform: scale(.75); transform-origin: 0 0; display: block; }
  #links { position: absolute; left: 0; top: 0; overflow: visible; opacity: 0; transition: opacity .4s; }
  #links.show { opacity: 1; }
  #links path { fill: none; stroke: #D8C8B8; stroke-width: 9; stroke-dasharray: 20 14; stroke-linecap: round; }
  #links path.on { stroke: var(--coral); animation: flow .9s linear infinite; }
  #links text { font-size: 72px; font-weight: 800; fill: #B9A796; text-anchor: middle; font-family: 'Apple SD Gothic Neo', sans-serif; paint-order: stroke; stroke: #FBF6EE; stroke-width: 14px; stroke-linejoin: round; }
  #links text.on { fill: var(--coral); }
  #links circle { opacity: 0; transition: opacity .3s; }
  #links circle.on { opacity: 1; }
  @keyframes flow { to { stroke-dashoffset: -34; } }
  #show { position: absolute; left: ${SHOW.x}px; top: ${SHOW.y}px; width: 1280px; height: 720px; transition: opacity .35s; }
  .pf { position: absolute; border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 18px 44px rgba(58,47,42,.22); transition: left 1s cubic-bezier(.55,0,.2,1), top 1s cubic-bezier(.55,0,.2,1), opacity .5s, transform .7s cubic-bezier(.3,1.3,.5,1); }
  .pf img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
  .pf img.wipe { clip-path: inset(0 100% 0 0); }
  .pf img.wipe.go { clip-path: inset(0 0 0 0); }
  .sweep { position: absolute; top: 0; bottom: 0; left: 0; width: 6px; margin-left: -3px; background: #fff; box-shadow: 0 0 18px 7px rgba(255,255,255,.95); }
  .scan { position: absolute; left: 0; right: 0; height: 110px; top: -110px; background: linear-gradient(180deg, rgba(31,122,92,0), rgba(31,122,92,.22) 75%, rgba(31,122,92,.9)); }
  .scan.warm { background: linear-gradient(180deg, rgba(224,122,95,0), rgba(224,122,95,.22) 75%, rgba(224,122,95,.95)); }
  .ring { position: absolute; border: 3px solid var(--red); border-radius: 10px; box-shadow: 0 0 0 5px rgba(194,65,12,.14); transform: scale(1.25); opacity: 0; transition: transform .45s cubic-bezier(.3,1.5,.5,1), opacity .3s; pointer-events: none; }
  .ring.ok { border-color: var(--green); box-shadow: 0 0 0 5px rgba(31,122,92,.14); }
  .ring.warm { border-color: var(--coral); box-shadow: 0 0 0 5px rgba(224,122,95,.18); }
  .ring.on { transform: none; opacity: 1; }
  .ring b { position: absolute; left: -3px; top: calc(100% + 7px); white-space: nowrap; background: var(--red); color: #fff; font-size: 14px; font-weight: 800; padding: 4px 10px; border-radius: 999px; }
  .ring.ok b { background: var(--green); }
  .ring.warm b { background: var(--coral); }
  .ring.up b { top: auto; bottom: calc(100% + 7px); }
  .ring.in b { left: auto; top: 50%; transform: translateY(-50%); }
  .ring.intop b { left: auto; }
  .wring { z-index: 5; }
  .steps { position: absolute; left: 150px; right: 0; top: 26px; display: flex; justify-content: center; gap: 10px; }
  .steps span { padding: 8px 16px; border-radius: 999px; background: #fff; color: var(--ink2); font-size: 16px; font-weight: 700; box-shadow: 0 2px 10px rgba(58,47,42,.08); transition: background .3s, color .3s; }
  .steps span.now { background: var(--coral); color: #fff; }
  .steps span.done { background: var(--green-soft); color: var(--green); }
  .steps span.done::before { content: '✓ '; }
  .fade { opacity: 0; transform: translateY(14px); transition: opacity .7s, transform .7s; }
  .fade.on { opacity: 1; transform: none; }
  .kicker { font-size: 20px; font-weight: 800; color: var(--coral); }
  h1 { font-size: 64px; line-height: 1.15; font-weight: 900; letter-spacing: -.02em; margin: 10px 0 18px; }
  .lead { font-size: 26px; line-height: 1.5; color: var(--ink2); font-weight: 600; }
  .team { margin-top: 28px; font-size: 19px; color: var(--ink2); }
  .blob { position: absolute; border-radius: 50%; background: var(--coral-soft); }
  .cycle { position: absolute; left: 700px; top: 110px; width: 500px; height: 500px; }
  .cycle .spin { transform-origin: 250px 250px; animation: spin 6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .node { position: absolute; width: 150px; height: 150px; margin: -75px 0 0 -75px; border-radius: 50%; background: #fff; box-shadow: 0 12px 30px rgba(58,47,42,.14); display: grid; place-content: center; text-align: center; transition: transform .45s cubic-bezier(.3,1.6,.5,1), box-shadow .45s, background .45s; }
  .node strong { font-size: 30px; font-weight: 900; color: var(--green); transition: color .45s; }
  .node span { font-size: 15px; color: var(--ink2); font-weight: 700; margin-top: 2px; }
  .node.on { transform: scale(1.14); background: #FFF8F3; box-shadow: 0 0 0 7px var(--coral), 0 18px 38px rgba(224,122,95,.35); }
  .node.on strong { color: var(--coral); }
  /* 장면 표시: 장면에 들어갈 때 왼쪽 위에 크게(#chip), 2.2초 뒤 왼쪽 아래 작은 표시(#chipS)로 바뀐다. 작은 표시는 구석 표시(#badges, 오른쪽 아래)와 같은 아래 띠에 있어 앱 글자를 덮지 않는다 */
  .chip { position: absolute; display: flex; align-items: center; border-radius: 999px; background: rgba(251,246,238,.97); border: 1.5px solid #E2D3C2; color: var(--green); font-weight: 800; box-shadow: 0 6px 20px rgba(58,47,42,.14); opacity: 0; transition: opacity .35s; z-index: 10; white-space: nowrap; }
  .chip b { color: var(--coral); font-weight: 900; }
  .chip i { width: 2px; height: 1em; background: #D9CBBB; border-radius: 1px; }
  .chip.on { opacity: 1; }
  #chip { left: 28px; top: 16px; font-size: 22px; padding: 11px 22px; gap: 12px; transform-origin: 0 0; }
  #chipS { left: 22px; bottom: 14px; font-size: 15px; padding: 6px 14px; gap: 8px; }
  #badges { position: absolute; right: 24px; bottom: 16px; display: flex; flex-direction: row; justify-content: flex-end; gap: 6px; z-index: 10; transition: opacity .25s; }
  #badges.off { opacity: 0; }
  #badges span { padding: 6px 12px; border-radius: 999px; background: rgba(58,47,42,.82); color: #fff; font-size: 13px; font-weight: 600; }
  /* 기관 화면·포스터 확대 때 아래 띠: 카메라가 비워 둔 띠를 바탕과 같은 크림색(점무늬 포함)으로 완전히 덮어, 작은 장면 표시와 구석 표시 아래에 앱 글자가 비치지 않게.
     반투명 그라데이션이면 띠 아래 버튼·글자가 희미하게 비쳐서, 경계는 또렷하게 자른다 */
  #band { position: absolute; left: 0; right: 0; bottom: 0; height: 60px; background: var(--cream) radial-gradient(circle at 1px 1px, rgba(58,47,42,.08) 1px, transparent 0) 0 0 / 22px 22px fixed; border-top: 1px solid #EADFD2; opacity: 0; transition: opacity .2s; z-index: 9; pointer-events: none; }
  #band.on { opacity: 1; }
  /* 녹화에서만: 질문을 보낸 직후 빈 대화가 비치지 않게, 보내기 직전 화면을 잠시 그대로 덮어 둔다 */
  #freeze { position: absolute; left: 0; top: 0; width: 1280px; height: 720px; z-index: 40; opacity: 0; pointer-events: none; }
  #freeze.on { opacity: 1; }
  body.prompter #band { bottom: 116px; }
  /* 한국어 번역·풀이 말풍선: 낱말 중간에서 줄을 바꾸지 않는다. 너비는 띄울 때 휴대폰 테두리 왼쪽 빈 곳에 맞춘다(fitLeft) */
  .bubble-ko { position: absolute; left: 28px; top: 92px; width: 250px; padding: 12px 16px; border-radius: 18px 18px 18px 4px; background: #fff; box-shadow: 0 10px 26px rgba(58,47,42,.16); font-size: 18px; line-height: 1.45; font-weight: 600; word-break: keep-all; overflow-wrap: anywhere; opacity: 0; transform: translateY(8px); transition: opacity .35s, transform .35s; z-index: 10; }
  .bubble-ko small { display: block; font-size: 13px; color: var(--coral); font-weight: 800; margin-bottom: 2px; }
  .bubble-ko.on { opacity: 1; transform: none; }
  #rail { border-radius: 18px; padding: 12px 14px 6px; }
  #rail ol { list-style: none; padding: 0; }
  #rail li { display: grid; grid-template-columns: 24px 1fr; gap: 9px; align-items: start; padding: 7px 0; border-top: 1px solid #F1E8DD; opacity: .3; transition: opacity .3s; }
  #rail li.done { opacity: 1; }
  #rail li i { width: 24px; height: 24px; border-radius: 50%; background: #EFE7DC; color: var(--ink2); font-style: normal; font-size: 13px; font-weight: 800; display: grid; place-items: center; transition: background .3s, color .3s; }
  #rail li.done i { background: var(--green); color: #fff; }
  #rail li strong { display: block; font-size: 17px; line-height: 1.3; font-weight: 800; }
  #rail li code { display: block; font: 600 11.5px/1.3 Menlo, monospace; color: var(--ink2); margin-top: 2px; }
  body.prompter #badges { bottom: 132px; }
  body.prompter #chipS { bottom: 130px; }
  #cursor { position: absolute; left: 640px; top: 760px; width: 30px; height: 30px; z-index: 20; transition: left .75s cubic-bezier(.45,0,.2,1), top .75s cubic-bezier(.45,0,.2,1), opacity .3s; opacity: 0; pointer-events: none; filter: drop-shadow(0 3px 5px rgba(0,0,0,.3)); }
  #cursor.on { opacity: 1; }
  #ripple { position: absolute; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(224,122,95,.5); z-index: 19; opacity: 0; pointer-events: none; }
  #ripple.go { animation: rip .55s ease-out; }
  @keyframes rip { 0% { opacity: .9; transform: scale(.3); } 100% { opacity: 0; transform: scale(1.4); } }
  #prompter { display: none; position: absolute; left: 0; right: 0; bottom: 0; height: 120px; padding: 14px 40px; background: rgba(28,22,19,.88); color: #fff; font-size: 23px; line-height: 1.45; z-index: 30; word-break: keep-all; overflow-wrap: anywhere; }
  body.prompter #prompter { display: block; }
</style></head><body>
  <div id="world">
    <div id="loopTitle" class="loop-title"><h1>잇다, 오산</h1><p>부모님의 <b>질문</b>이 <em>다음 프로그램</em>이 되는 곳</p></div>
    <div class="slot-label" style="left:0;top:-120px;width:1280px">부모님 휴대폰<small class="langs">쉬운 한국어 · Tiếng Việt · 中文</small></div>
    <div id="phone"><div class="screen"><iframe id="app"></iframe></div></div>
    <div class="slot-label" style="left:1720px;top:-120px;width:1200px">기관 담당자<small>운영기관 화면</small></div>
    <div id="desk"><div class="bar"><i></i><i></i><i></i><span>잇다, 오산 · 운영기관 화면</span></div><iframe id="deskapp"></iframe></div>
    <svg id="links" width="3000" height="800">
      <defs>
        <marker id="head-off" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#D8C8B8" stroke="none"/></marker>
        <marker id="head-on" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#E07A5F" stroke="none"/></marker>
      </defs>
      <path id="link1" d="M 860 210 C 1100 10, 1440 10, 1680 210" marker-end="url(#head-off)"/>
      <text id="link1t" x="1270" y="-20">못 찾은 질문</text>
      <circle id="dot1" r="17" fill="#E07A5F"><animateMotion dur="1.5s" repeatCount="indefinite" rotate="auto"><mpath href="#link1"/></animateMotion></circle>
      <path id="link2" d="M 1680 520 C 1440 720, 1100 720, 860 520" marker-end="url(#head-off)"/>
      <text id="link2t" x="1270" y="800">덧붙인 안내</text>
      <circle id="dot2" r="17" fill="#E07A5F"><animateMotion dur="1.5s" repeatCount="indefinite" rotate="auto"><mpath href="#link2"/></animateMotion></circle>
    </svg>
    <div id="show"></div>
  </div>
  <div id="band"></div>
  <div id="chip" class="chip"></div>
  <div id="chipS" class="chip"></div>
  <div id="badges"></div>
  <div id="tr" class="bubble-ko"></div>
  <div id="rail" class="bubble-ko"></div>
  <div id="ripple"></div>
  <div id="cursor"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2 L3 19 L7.5 15 L10.5 22 L13.5 20.7 L10.6 14 L17 14 Z" fill="#fff" stroke="#2B2320" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
  <div id="prompter"></div>
  <img id="freeze" alt="">
<script>
  const world = document.getElementById('world')
  const $ = (id) => document.getElementById(id)
  addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0) })
  const pause = (ms) => new Promise((done) => setTimeout(done, ms))
  const make = (tag, props) => Object.assign(document.createElement(tag), props)
  window.cam = { s: 1, tx: 0, ty: 0 }
  /** 사각형 r(world 좌표)이 화면에 꽉 차게. 너무 크게 키우면 흐려지므로 max배까지 */
  window.camera = (r, ms, max, bounds, reserve, ease) => {
    // reserve: 화면 위·아래에 비워 둘 띠(px). 장면 표시와 구석 표시가 앱 글자를 덮지 않게 대상 사각형을 그 사이에 놓는다
    const top = reserve?.top ?? 0, bottom = reserve?.bottom ?? 0
    const s = Math.min(1280 / r.w, (720 - top - bottom) / r.h, max || 2.3)
    let cx = r.x + r.w / 2, cy = r.y + r.h / 2 + (bottom - top) / 2 / s
    // bounds(휴대폰·기관 화면 테두리) 밖의 빈 곳이 비치지 않게 중심을 안으로 당긴다
    if (bounds) {
      const vw = 1280 / s, vh = 720 / s
      if (vw < bounds.w) cx = Math.min(Math.max(cx, bounds.x + vw / 2), bounds.x + bounds.w - vw / 2)
      if (vh < bounds.h) cy = Math.min(Math.max(cy, bounds.y + vh / 2), bounds.y + bounds.h - vh / 2)
    }
    const tx = 640 - cx * s, ty = 360 - cy * s
    // ease: 빈 캔버스를 크게 지나가는 줌아웃(넓게 보기)은 부드러운 곡선으로 (기본 곡선은 가운데가 빨라 화면이 휙 쏠린다)
    world.style.transition = ms ? 'transform ' + ms + 'ms ' + (ease || 'cubic-bezier(.55,0,.2,1)') : 'none'
    world.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'
    window.cam = { s, tx, ty }
  }
  window.pointTo = (x, y) => {
    const c = window.cam, el = $('cursor')
    el.style.left = (x * c.s + c.tx - 3.75) + 'px'
    el.style.top = (y * c.s + c.ty - 2.5) + 'px'
    el.classList.add('on')
  }
  window.ripple = () => {
    const c = $('cursor'), r = $('ripple')
    r.style.left = (parseFloat(c.style.left) + 3.75) + 'px'
    r.style.top = (parseFloat(c.style.top) + 2.5) + 'px'
    r.classList.remove('go'); void r.offsetWidth; r.classList.add('go')
  }
  window.hideCursor = () => $('cursor').classList.remove('on')
  /** 커서와 누름 표시를 서서히가 아니라 바로 없앤다 (카메라가 옮겨 갈 때 그 자리에 흐린 커서가 남지 않게) */
  window.dropCursor = () => {
    const c = $('cursor'), r = $('ripple')
    c.style.transition = 'none'; c.classList.remove('on'); r.classList.remove('go')
    void c.offsetWidth; c.style.transition = ''
  }
  /** 휴대폰 테두리(베젤 포함) 왼쪽 끝의 화면 x (카메라가 가는 곳 기준). 휴대폰을 확대한 샷에서 왼쪽 위 표시가 베젤에 얹히지 않게 이보다 왼쪽에 둔다 */
  window.phoneLeft = () => ${PHONE.x - 9} * window.cam.s + window.cam.tx
  /** 말풍선(왼쪽 28px)의 너비를 휴대폰 왼쪽 빈 곳에 맞춘다 (넓으면 250px까지) */
  window.fitLeft = (el) => { el.style.width = Math.round(Math.max(170, Math.min(250, window.phoneLeft() - 28 - 18))) + 'px' }
  /** 장면 표시: '누가 · 무엇'. 장면 첫 hold ms(기본 2.2초)는 왼쪽 위에 크게, 그 뒤 왼쪽 아래(구석 표시와 같은 띠)에 작게 */
  window.setChip = (text, hold = 2200, fit = false) => {
    const big = $('chip'), small = $('chipS')
    clearTimeout(window.chipTimer)
    small.classList.remove('on')
    if (!text) { big.classList.remove('on'); return }
    const [who, ...rest] = text.split(' · ')
    const parts = () => [make('b', { textContent: who }), ...(rest.length ? [make('i'), make('span', { textContent: rest.join(' · ') })] : [])]
    big.replaceChildren(...parts())
    // fit: 휴대폰을 확대한 샷이면 큰 장면 표시를 휴대폰 베젤 왼쪽 빈 곳에 들어가게 줄인다
    big.style.transform = ''
    if (fit) {
      const room = window.phoneLeft() - 28 - 14
      if (big.offsetWidth > room) big.style.transform = 'scale(' + Math.max(0.6, room / big.offsetWidth).toFixed(3) + ')'
    }
    big.classList.add('on')
    window.chipTimer = setTimeout(() => { small.replaceChildren(...parts()); big.classList.remove('on'); small.classList.add('on') }, hold)
  }
  window.setBadges = (list) => $('badges').replaceChildren(...list.map((text) => make('span', { textContent: text })))
  /**
   * 새 장면으로 들어갈 때: 카메라가 움직이기 시작하면 앞 장면의 장면 표시와 구석 표시를 바로 내리고,
   * delay ms 뒤(카메라가 거의 도착해 큰 장면 표시 아래가 빈 곳일 때) 새 장면 표시와 구석 표시를 띄운다
   */
  window.enter = (chip, list, delay, hold, fit) => {
    clearTimeout(window.enterTimer)
    clearTimeout(window.chipTimer)
    $('chip').classList.remove('on')
    $('chipS').classList.remove('on')
    $('badges').classList.add('off')
    const go = () => { window.setChip(chip, hold, fit); window.setBadges(list); $('badges').classList.remove('off') }
    if (delay) window.enterTimer = setTimeout(go, delay)
    else go()
  }
  window.setTr = (label, text) => {
    const el = $('tr')
    if (!text) { el.classList.remove('on'); return }
    el.replaceChildren(make('small', { textContent: label }), text)
    window.fitLeft(el)
    el.classList.add('on')
  }
  /** 상담 에이전트가 실제로 한 단계(답의 steps)를 한국어로: 번호 · 쉬운 한국어 이름 · 도구 이름 */
  window.setRail = (title, steps) => {
    const el = $('rail')
    if (!steps) { el.classList.remove('on'); return }
    el.replaceChildren(make('small', { textContent: title }), make('ol', {}))
    steps.forEach((step, index) => {
      const li = make('li', {})
      li.append(make('i', { textContent: String(index + 1) }), Object.assign(make('div', {}), {}))
      li.lastChild.append(make('strong', { textContent: step.label }), make('code', { textContent: step.tool }))
      el.querySelector('ol').append(li)
    })
    window.fitLeft(el)
    el.classList.add('on')
  }
  /** 한국어 풀이의 앞 n단계를 ✓ (내레이션의 그 말에 맞춰 한 단계씩) */
  window.tickTo = (n) => $('rail').querySelectorAll('li').forEach((li, index) => li.classList.toggle('done', index < n))
  window.setPrompter = (text) => { $('prompter').textContent = text }
  /** 두 화살표: link(1) '못 찾은 질문'만, link(2) '덧붙인 안내'만, link(1, 2) 둘 다 켬, link(-1) 둘 다 회색으로만 보임, link(0) 숨김 */
  window.link = (...ns) => {
    $('links').classList.toggle('show', ns.some((n) => n !== 0))
    for (const k of [1, 2]) {
      const on = ns.includes(k)
      $('link' + k).classList.toggle('on', on); $('link' + k + 't').classList.toggle('on', on); $('dot' + k).classList.toggle('on', on)
      $('link' + k).setAttribute('marker-end', on ? 'url(#head-on)' : 'url(#head-off)')
    }
  }
  window.show = async (html) => {
    const el = $('show')
    el.style.opacity = 0; await pause(350)
    el.innerHTML = html
    await Promise.all([...el.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))
    el.style.opacity = 1
  }
  window.on = (selector) => document.querySelectorAll(selector).forEach((el) => el.classList.add('on'))
  window.place = (id, style) => Object.assign($(id).style, style)
  /** 액자 id에 새 이미지를 왼쪽에서 오른쪽으로 밀어 넣는다 */
  window.wipe = async (id, src, ms) => {
    const frame = $(id), img = new Image()
    img.src = src; img.className = 'wipe'; img.style.transition = 'clip-path ' + ms + 'ms cubic-bezier(.6,0,.3,1)'
    await img.decode().catch(() => {})
    const sweep = make('div', { className: 'sweep' })
    sweep.style.transition = 'left ' + ms + 'ms cubic-bezier(.6,0,.3,1)'
    frame.append(img, sweep); void frame.offsetWidth
    requestAnimationFrame(() => { img.classList.add('go'); sweep.style.left = '100%' })
    setTimeout(() => { sweep.remove(); [...frame.querySelectorAll('img')].slice(0, -1).forEach((old) => old.remove()) }, ms + 80)
  }
  /** 액자 id의 이미지를 새 이미지로 겹쳐 바꾼다 (확대한 채 회차를 바꿀 때: 두 회차의 글 배치가 달라 밀어 넣으면 반쪽씩 어긋나 보인다) */
  window.fadeTo = async (id, src, ms) => {
    const frame = $(id), img = new Image()
    img.src = src; img.style.opacity = '0'; img.style.transition = 'opacity ' + ms + 'ms ease'
    await img.decode().catch(() => {})
    frame.append(img); void frame.offsetWidth
    requestAnimationFrame(() => { img.style.opacity = '1' })
    setTimeout(() => [...frame.querySelectorAll('img')].slice(0, -1).forEach((old) => old.remove()), ms + 80)
  }
  window.scan = (id, ms, warm) => {
    const frame = $(id), bar = make('div', { className: warm ? 'scan warm' : 'scan' })
    bar.style.transition = 'top ' + ms + 'ms linear'
    frame.append(bar); void frame.offsetWidth
    requestAnimationFrame(() => { bar.style.top = frame.clientHeight + 'px' })
    setTimeout(() => bar.remove(), ms + 50)
  }
  /**
   * 앱 화면 위 테두리(world 좌표, 카메라와 함께 움직임). 선 굵기와 이름표 크기는 지금 카메라 배율로 나눠 화면에서 늘 같은 크기로 보인다.
   * tone: 'ok'(초록) | 'warm'(코랄) | ''(빨강)
   * at: 'below'(기본) | 'up' | 'in' | 'in-top' | 'left'(테두리 왼쪽 바깥, edge(world x)가 있으면 그보다 왼쪽: 휴대폰 옆 빈 캔버스에 두어 앱 글자를 덮지 않게)
   */
  window.ringAt = (id, r, tone, label, at, edge, size = 1, glowPx = 5) => {
    document.getElementById(id)?.remove()
    // size: 화면에서 보이는 굵기·이름표 크기 배수 (포스터 확대처럼 크게 보여 줄 때). glowPx: 바깥 번짐(화면 px, 바로 옆 글자에 닿을 때 줄인다)
    const k = size / window.cam.s
    const up = at === 'up', inside = at === 'in', insideTop = at === 'in-top', left = at === 'left'
    const el = make('div', { id, className: 'ring wring' + (tone ? ' ' + tone : '') + (up ? ' up' : '') + (inside ? ' in' : '') + (insideTop ? ' intop' : '') })
    const glow = tone === 'ok' ? 'rgba(31,122,92,.16)' : tone === 'warm' ? 'rgba(224,122,95,.2)' : 'rgba(194,65,12,.14)'
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', borderWidth: 3 * k + 'px', borderRadius: 10 * k + 'px', boxShadow: '0 0 0 ' + glowPx * k + 'px ' + glow })
    if (label) {
      const b = make('b', { textContent: label })
      Object.assign(b.style, { fontSize: 16 * k + 'px', padding: 4 * k + 'px ' + 11 * k + 'px' })
      // 줄바꿈 문자가 있으면 여러 줄 이름표 (휴대폰 옆 빈 캔버스가 좁을 때)
      if (label.includes('\\n')) Object.assign(b.style, { whiteSpace: 'pre-line', width: 'max-content', lineHeight: '1.4', borderRadius: 12 * k + 'px', textAlign: left ? 'right' : 'left', padding: 6 * k + 'px ' + 12 * k + 'px' })
      if (!inside && !insideTop && !left) b.style.left = -3 * k + 'px'
      if (left) {
        const gap = (edge == null ? 0 : Math.max(0, r.x - edge)) + 12 * k
        Object.assign(b.style, { left: 'auto', right: 'calc(100% + ' + gap + 'px)', top: '50%', transform: 'translateY(-50%)' })
      } else if (insideTop) { b.style.right = 12 * k + 'px'; b.style.top = 10 * k + 'px' }
      else if (inside) b.style.right = 12 * k + 'px'
      else if (up) b.style.bottom = 'calc(100% + ' + 7 * k + 'px)'
      else b.style.top = 'calc(100% + ' + 7 * k + 'px)'
      el.append(b)
    }
    world.append(el); void el.offsetWidth
    requestAnimationFrame(() => el.classList.add('on'))
  }
  window.unring = (id) => document.getElementById(id)?.remove()
  /** 테두리를 부드럽게 내린 뒤 지운다 (카메라가 움직이기 시작할 때) */
  window.fadeRing = (id) => { const el = document.getElementById(id); if (!el) return; el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300) }
  window.unringAll = () => document.querySelectorAll('.wring').forEach((el) => el.remove())
  window.step = (key) => {
    const chips = [...document.querySelectorAll('.steps span')]
    const at = key === 'all' ? chips.length : chips.findIndex((chip) => chip.dataset.k === key)
    chips.forEach((chip, index) => { chip.classList.toggle('done', index < at); chip.classList.toggle('now', index === at) })
  }
</script></body></html>`

const wait = (ms) => new Promise((done) => setTimeout(done, ms))

async function api(method, route, body) {
  const response = await fetch(`${API}${route}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new Error(`${method} ${route} 실패 ${response.status}: ${await response.text()}`)
  return response.text()
}
const chat = (text, locale) => api('POST', '/agent/chat', { messages: [{ role: 'user', text }], locale, program_id: PROGRAM })

/** 승인 전 포스터 기록을 보관한다. 지난 녹화가 승인된 채로 멈췄다면 보관본으로 먼저 되돌린다 */
function backupReport() {
  fs.mkdirSync(path.dirname(REPORT_BACKUP), { recursive: true })
  const text = fs.readFileSync(REPORT, 'utf8')
  if (JSON.parse(text).status !== 'approved') fs.writeFileSync(REPORT_BACKUP, text)
  else if (fs.existsSync(REPORT_BACKUP)) fs.writeFileSync(REPORT, fs.readFileSync(REPORT_BACKUP))
  else throw new Error(`${REPORT}가 이미 '담당자 승인' 상태이고 승인 전 사본이 없습니다. 포스터를 다시 만들거나 status를 machine_checked로 되돌린 뒤 실행하세요.`)
}
function restoreReport() {
  if (fs.existsSync(REPORT_BACKUP)) fs.writeFileSync(REPORT, fs.readFileSync(REPORT_BACKUP))
}

/** 추가 안내·부모님 질문·포스터 승인이 없는 처음 상태로 */
async function resetState() {
  const detail = JSON.parse(await api('GET', `/admin/programs/${PROGRAM}`))
  for (const addendum of detail.addenda) await api('DELETE', `/admin/programs/${PROGRAM}/addenda/${addendum.id}`)
  fs.rmSync(QUESTIONS_FILE, { force: true })
  restoreReport()
}

const fillBlanks = (draft, value) => draft.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, () => value)

/** 담당자가 영상에서 채워 덧붙일 안내 (고른 초안의 빈칸을 FILL 값으로) */
const filledItems = (improve, chosen) => chosen.map(({ index }) => {
  const item = improve.items[index]
  return { topic: item.topic, text: fillBlanks(item.draft, FILL[item.topic]).trim(), resolves_questions: item.questions, resolves_items: item.resolves_items, drafted_by_ai: true }
})

/**
 * 영상에서 덧붙일 안내를 미리 한 번 저장했다 지운다. 저장할 때 서버가 번역을 기억해 두므로(translate-addenda.ts),
 * 녹화 중의 '덧붙이기'가 번역을 기다리지 않고 바로 끝나 내레이션과 맞는다
 */
async function warmTranslations(items) {
  console.log('덧붙일 안내의 번역을 미리 받아 두는 중…')
  try {
    await api('POST', `/admin/programs/${PROGRAM}/addenda`, { author: REVIEWER, items })
  } finally {
    await resetState()
  }
}

/** 녹화 전에 받은 실제 결과를 저장해 두는 파일. 제출용과 녹음용 영상이 같은 답을 쓰고, 모델 호출 한도에 걸려도 다시 녹화할 수 있다 (FRESH=1이면 새로 받음) */
const PREFETCH_CACHE = path.resolve(__dirname, 'render/prefetch.json')

/** 녹화 중에 돌려줄 실제 결과: 상담 답(베트남어) → 공고 보완 초안 → (추가 안내를 잠시 저장하고) 두 번째 상담 답(중국어) */
async function prefetch() {
  // render/는 gitignore라 새로 받은 저장소에는 없다. 실제 API를 부르기 전에 만들어 둬야 받은 답을 버리지 않는다
  fs.mkdirSync(path.dirname(PREFETCH_CACHE), { recursive: true })
  await resetState()
  // FRESH=improve: 첫 상담 답(베트남어)은 저장해 둔 것을 쓰고, 공고 보완 초안과 두 번째 답(중국어)만 새로 받는다
  const freshImprove = process.env.FRESH === 'improve' && fs.existsSync(PREFETCH_CACHE)
  if (process.env.FRESH !== '1' && !freshImprove && fs.existsSync(PREFETCH_CACHE) && fs.existsSync(PLAN_FIXTURE)) {
    const cached = JSON.parse(fs.readFileSync(PREFETCH_CACHE, 'utf8'))
    if (cached.againLocale !== 'zh') throw new Error('render/prefetch.json의 두 번째 상담 답이 중국어가 아닙니다(지난 판). FRESH=1 node record-demo.js로 새로 받으세요.')
    console.log('저장해 둔 실제 결과(render/prefetch.json, render/plan-result.json)를 씁니다.')
    await warmTranslations(filledItems(JSON.parse(cached.improve), cached.chosen))
    return { ...cached, plan: fs.readFileSync(PLAN_FIXTURE, 'utf8') }
  }
  let reply
  if (freshImprove) {
    console.log('첫 상담 답은 저장해 둔 것(render/prefetch.json)을 쓰고, 보완 초안과 두 번째 답만 새로 받습니다.')
    reply = JSON.parse(fs.readFileSync(PREFETCH_CACHE, 'utf8')).reply
  } else {
    console.log('상담 API에서 실제 답을 받는 중…')
    reply = await chat(QUESTION, 'vi')
  }
  const parsed = JSON.parse(reply)
  if (!parsed.inquiry || !parsed.unanswered?.length || !parsed.steps?.length) throw new Error('첫 상담 답에 문의문·못 찾은 질문·단계가 모두 있어야 합니다. 다시 실행하세요.')
  // 대시보드가 보낼 질문 목록과 같게: 시연용 예시 + 영상에서 보호자가 알릴 질문 (같은 문장은 하나로)
  const questions = [...DEMO_QUESTIONS]
  for (const item of parsed.unanswered.filter((entry) => entry.program_id === PROGRAM)) {
    if (!questions.some((question) => question.question_ko === item.question_ko)) questions.push({ question_ko: item.question_ko, topic: item.topic, count: 1 })
  }
  console.log('공고 보완 도우미에서 실제 초안을 받는 중…')
  const improve = await api('POST', `/admin/programs/${PROGRAM}/improve`, { questions })
  const result = JSON.parse(improve)
  if (!result.passed) throw new Error('보완 초안이 코드 검사를 통과하지 못했습니다. 다시 실행하세요.')
  // 담당자가 채울 항목: 참가비(other)·준비물(materials) 중 빈칸이 하나인 add_notice
  const chosen = result.items.map((item, index) => ({ item, index }))
    .filter(({ item }) => item.kind === 'add_notice' && FILL[item.topic] && item.blanks.length === 1)
    .filter(({ item }, at, list) => list.findIndex((entry) => entry.item.topic === item.topic) === at)
  if (chosen.length !== 2) throw new Error(`채울 항목을 찾지 못했습니다: ${result.items.map((item) => `${item.topic}/${item.kind}/${item.blanks.length}`).join(', ')}`)
  const items = filledItems(result, chosen)
  let replyAgain
  try {
    await api('POST', `/admin/programs/${PROGRAM}/addenda`, { author: REVIEWER, items })
    // 영상의 이름표('중국어 답: 참가비 무료 · 운동하기 편한 옷과 운동화')가 사실이게: 첫 문장(화면의 굵은 결론)이 중국어로 무료와 운동화를 말하고,
    // 근거에 추가 안내가 있어야 한다. 모델 답은 매번 달라 맞지 않으면 세 번까지 다시 묻는다
    for (let attempt = 1; ; attempt++) {
      console.log(`추가 안내가 있는 상태의 두 번째 상담 답(중국어)을 받는 중… (${attempt}번째)`)
      const text = await chat(QUESTION_AGAIN, 'zh')
      const again = JSON.parse(text)
      const lead = again.reply.split('\n')[0]
      const problem = !again.citations.some((citation) => citation.source === 'addendum') ? '추가 안내를 인용하지 않음'
        : !/[\u4e00-\u9fff]/.test(lead) || !/免费|不收费|无需.{0,4}费|不需要.{0,4}费/.test(lead) || !/鞋/.test(lead) ? `첫 문장이 무료·운동화를 말하지 않음: ${lead}` : null
      if (!problem) { replyAgain = text; break }
      if (attempt >= 3) throw new Error(`두 번째 답이 영상에 맞지 않습니다 (${problem}). 다시 실행하세요.`)
      console.log(`    ${problem}`)
    }
  } finally {
    // 실패해도 추가 안내를 지워 처음 상태로
    await resetState()
  }
  if (!fs.existsSync(PLAN_FIXTURE)) {
    console.log('편성 도우미에서 실제 편성안을 받는 중…')
    const plan = await api('POST', '/admin/planning/propose', { questions: PLAN_QUESTIONS })
    if (!JSON.parse(plan).passed) throw new Error('편성안이 코드 검사를 통과하지 못했습니다. 다시 실행하세요.')
    fs.writeFileSync(PLAN_FIXTURE, plan)
  }
  const fetched = { reply, replyAgain, againLocale: 'zh', improve, chosen: chosen.map(({ item, index }) => ({ index, value: FILL[item.topic] })) }
  fs.writeFileSync(PREFETCH_CACHE, JSON.stringify(fetched))
  return { ...fetched, plan: fs.readFileSync(PLAN_FIXTURE, 'utf8') }
}

// ---- 포스터 무대에 올릴 장면 ----

/** 포스터 통번역 뒷이야기: 원본(한국어) · 베트남어 · 중국어 액자 390×390을 나란히 (두 언어를 같은 크기로) */
const FK = { x: 30, y: 128, w: 390, h: 390 }
const FV = { x: 445, y: 128, w: 390, h: 390 }
const FZ = { x: 860, y: 128, w: 390, h: 390 }
const posterPart = (frame, nx, ny, nw, nh) => ({ x: frame.x + frame.w * nx, y: frame.y + frame.h * ny, w: frame.w * nw, h: frame.h * nh })
const pad = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 })
function posterHtml() {
  const original = local(`inbox/${PROGRAM}/poster.jpg`)
  const cap = (f, html) => `<p class="pf-cap" style="left:${f.x}px;top:${f.y - 36}px;width:${f.w}px">${html}</p>`
  const frame = (id, f) => `<div class="pf" id="${id}" style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px"><img src="${original}"></div>`
  // 기관 공고에 들어온 원본 포스터에서 시작한다 (업로드 화면은 없으므로 올리는 듯한 움직임은 쓰지 않는다). 두 번역 액자도 처음에는 원본이고, 글만 바뀌며 밀려 들어온다
  return `<div class="steps"><span data-k="read">원본 판독</span><span data-k="table">번역표</span><span data-k="edit">글만 편집</span><span data-k="verify">다른 AI가 검증</span><span data-k="qr">QR 확인</span></div>
    ${cap(FK, '원본 · 한국어')}${cap(FV, '베트남어 · <span lang="vi">Tiếng Việt</span>')}${cap(FZ, '중국어 · <span lang="zh">中文</span>')}
    ${frame('pk', FK)}${frame('pv', FV)}${frame('pz', FZ)}`
}

function endingHtml() {
  const R = 175, C = 250
  const at = (deg) => ({ x: C + R * Math.cos((deg * Math.PI) / 180), y: C + R * Math.sin((deg * Math.PI) / 180) })
  const nodes = [['읽기', '포스터 통번역', -90], ['연결', '상담', 30], ['편성', '공고 보완·편성', 150]]
  return `<div class="blob" style="left:640px;top:40px;width:640px;height:640px"></div>
    <div class="fade" id="endText" style="position:absolute;left:90px;top:200px;width:560px">
      <p class="kicker">AX 라이프케어 · 읽기 · 연결 · 편성</p>
      <h1>잇다, 오산</h1>
      <p class="lead">부모님의 질문이<br>다음 프로그램이 되는 곳</p>
      <p class="team">팀 다담 · 임준현 · 이선우 · 김채현 · 박소영</p>
    </div>
    <div class="cycle">
      <svg width="500" height="500" style="position:absolute;left:0;top:0;overflow:visible">
        <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#E9D9C8" stroke-width="10" stroke-dasharray="4 18" stroke-linecap="round"/>
        <g class="spin"><circle cx="${C}" cy="${C - R}" r="13" fill="#E07A5F"/><circle cx="${C}" cy="${C - R}" r="24" fill="#E07A5F" opacity=".25"/></g>
      </svg>
      ${nodes.map(([title, sub, deg], index) => { const p = at(deg); return `<div class="node" id="n${index}" style="left:${p.x}px;top:${p.y}px"><strong>${title}</strong><span>${sub}</span></div>` }).join('')}
    </div>`
}

/** 녹화에서만: 시트를 열 때 닫기 버튼과 포스터 구역에 생기는 키보드 포커스 테두리를 숨긴다 (앱 코드는 그대로) */
const PHONE_CSS = 'dialog :focus-visible, #poster:focus, #poster:focus-visible { outline: none !important; box-shadow: none !important; }'

async function main() {
  const narration = Object.values(SCENES).reduce((sum, { say }) => sum + sayMs(say), 0) / 1000
  if (narration > MAX_SECONDS) throw new Error(`내레이션만 ${narration.toFixed(1)}초로 ${MAX_SECONDS}초를 넘습니다. SCENES 대본을 줄이세요.`)
  console.log(`내레이션 예상 ${narration.toFixed(1)}초 (초당 ${SYLLABLES_PER_SECOND}음절)`)
  backupReport()
  try {
    await record()
  } finally {
    restoreReport()
  }
}

async function record() {
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'))
  if (!report.injected_fault) console.warn('주의: 오류 주입 기록이 아닙니다. npm run poster -- osan-fc-sports-day --lang vi --force --demo-fault 로 다시 만드세요.')
  const zh = JSON.parse(fs.readFileSync(REPORT_ZH, 'utf8'))
  if (zh.chosen_attempt == null) throw new Error(`${REPORT_ZH}에 자동 검증을 통과한 회차가 없습니다.`)
  const { reply, replyAgain, improve, plan, chosen } = await prefetch()
  const a1 = report.attempts[0]
  const last = report.attempts[report.attempts.length - 1]
  const zhChosen = zh.attempts.find((attempt) => attempt.n === zh.chosen_attempt)
  // 베트남어 포스터 승인 (실제 API). 보호자 장면(승인된 포스터를 봄)이 포스터 장면보다 앞이라 녹화를 시작하기 전에 해 둔다.
  // 영상의 포스터 장면은 누르는 모습 대신 승인된 상태를 보여 준다. 녹화가 끝나면(실패해도) 승인 전 기록으로 되돌린다
  await api('POST', `/admin/posters/${PROGRAM}/vi/approve`, { reviewer: REVIEWER })

  fs.rmSync(WORK, { recursive: true, force: true })
  fs.mkdirSync(path.join(WORK, 'frames'), { recursive: true })
  fs.writeFileSync(path.join(WORK, 'stage.html'), STAGE)

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1280,807', '--force-device-scale-factor=1.5', '--allow-file-access-from-files'] })
  try {
    const context = await browser.newContext({ viewport: null })
    // 보호자 웹은 처음 온 사람처럼(첫 화면·쉬운 한국어) 시작한다. 기관 화면만 담당자 이름과 언어를 넣어 둔다
    await context.addInitScript(() => {
      try {
        localStorage.setItem('osan-dashboard-locale', 'ko-easy')
        localStorage.setItem('osan-dashboard-reviewer', '담당자(시연)')
      } catch { /* file:// 무대에는 저장소가 없다 */ }
    })
    // 녹화 중 상담 답·보완 초안·편성안: 방금(또는 저장해 둔) 실제 API 결과를 몇 초 뒤에 돌려준다
    const replies = [{ body: reply, ms: 900 }, { body: replyAgain, ms: 1100 }]
    await context.route(`${API}/agent/chat`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      const next = replies.shift() ?? { body: replyAgain, ms: 1000 }
      await wait(next.ms)
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': GUARDIAN }, body: next.body })
    })
    await context.route(`${API}/admin/planning/propose`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await wait(1300)
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': DASHBOARD }, body: plan })
    })
    await context.route(`${API}/admin/programs/${PROGRAM}/improve`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await wait(1300)
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': DASHBOARD }, body: improve })
    })
    // 대시보드(Vite 개발 서버)를 녹화 전에 한 번 열어 모듈을 데워 둔다
    const warm = await context.newPage()
    for (const view of [`#programs/${PROGRAM}`, `?v=questions#questions/${PROGRAM}`, '?v=plan#plan']) {
      await warm.goto(`${DASHBOARD}/${view}`)
      await warm.waitForLoadState('networkidle').catch(() => {})
    }
    await warm.close()

    const page = await context.newPage()
    await page.goto('file://' + path.join(WORK, 'stage.html'))
    const stage = (fn, arg) => page.evaluate(fn, arg)
    if (PROMPTER) await stage(() => document.body.classList.add('prompter'))
    // 보호자 휴대폰과 기관 화면은 처음부터 띄워 두고, 카메라가 그쪽으로 갈 때 보여 준다.
    // 표지의 기관 화면은 '보호자 질문' 탭(순환의 기관 쪽: 보호자가 못 찾은 질문이 모이는 곳). 포스터 검수 화면은 보호자 장면에서 카메라가 휴대폰에 있을 때 연다
    await stage(([app, desk]) => { document.getElementById('app').src = app; document.getElementById('deskapp').src = desk }, [`${GUARDIAN}/`, `${DASHBOARD}/?v=questions#questions/${PROGRAM}`])
    const frameOf = async (origin, part = '') => {
      for (let i = 0; i < 100; i++) {
        const found = page.frames().find((frame) => frame.url().startsWith(origin) && frame.url().includes(part))
        if (found) return found
        await wait(100)
      }
      throw new Error(`화면을 찾지 못했습니다: ${origin} ${part}`)
    }
    /** 이미지가 다 받아지고 그려질 준비가 될 때까지 (포스터 PNG가 커서 늦게 뜬다) */
    const imagesReady = (frame, selector) => frame.evaluate(async (sel) => {
      const images = [...document.querySelectorAll(sel)]
      images.forEach((image) => { image.loading = 'eager' })
      await Promise.all(images.map((image) => image.decode().catch(() => {})))
    }, selector)
    let phone = await frameOf(GUARDIAN)
    let desk = await frameOf(DASHBOARD, 'questions')
    await phone.waitForSelector('.intro-start', { timeout: 20_000 })
    await phone.addStyleTag({ content: PHONE_CSS })
    // 보호자 화면에 나올 번역 포스터(베트남어·중국어)를 미리 받아 둔다 (홈 띠·목록 썸네일·상세 포스터가 비지 않게).
    // 띠·썸네일은 폭을 줄인 webp(?w=128~512), 상세 포스터 구역은 원래 크기를 쓴다
    const posterUrls = fs.readdirSync(TRANSLATED).map((name) => name.match(/^([a-z0-9-]+)\.(vi|zh)\.json$/)).filter(Boolean)
      .flatMap(([, id, language]) => [`${API}/posters/${id}/${language}`, ...[128, 256, 384, 512].map((width) => `${API}/posters/${id}/${language}?w=${width}`)])
    await phone.evaluate((urls) => Promise.all(urls.map((url) => { const image = new Image(); image.src = url; return image.decode().catch(() => {}) })), posterUrls)
    await desk.waitForSelector('.question-list', { timeout: 20_000 })
    /**
     * 기관 화면을 포스터 검수 화면으로 새로 열고, 번역 포스터 칸을 아래 끝(담당자 승인 줄·검증 기록)까지 미리 내려 둔다.
     * 보호자 장면에서 카메라가 휴대폰에 있을 때 부르고, 포스터 장면은 칸을 재기 전에 끝나기를 기다린다 (포스터 장면에서는 카메라만 옮긴다)
     */
    const openReview = async () => {
      await stage((src) => { document.getElementById('deskapp').src = src }, `${DASHBOARD}/?v=review#programs/${PROGRAM}`)
      desk = await frameOf(DASHBOARD, 'v=review')
      await desk.waitForSelector('.review-grid .poster-img', { timeout: 20_000 })
      await imagesReady(desk, '.poster-img')
      await desk.waitForSelector('.poster-state--approved', { timeout: 10_000 })
      await desk.evaluate(() => { const body = document.querySelector('section[aria-labelledby="pane-poster"] .pane-body'); if (body) body.scrollTop = body.scrollHeight })
    }
    // 포스터 장면 무대는 미리 올려 둔다 (표지에서는 카메라 밖)
    await stage((html) => window.show(html), posterHtml())
    // 표지: 넓게 보기 + 서비스 이름. 두 화살표는 회색으로 보이게 두고, 내레이션에 맞춰 차례로 켠다
    await stage((r) => { window.camera(r, 0); window.link(-1) }, OPENING)
    await wait(600)

    const frames = []
    /** 가장 최근 화면 기록 프레임 (freeze가 지금 화면을 그대로 덮어 둘 때 쓴다) */
    let lastShot = null
    const cdp = await context.newCDPSession(page)
    cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      const file = path.join(WORK, 'frames', `f${String(frames.length).padStart(5, '0')}.jpg`)
      fs.writeFileSync(file, Buffer.from(data, 'base64'))
      lastShot = data
      frames.push({ file, t: metadata.timestamp })
      await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    })
    const started = Date.now()
    const timings = []
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })

    // ---- 도구 ----
    /** 카메라 이동. scrim이면 아래 띠를 크림색으로 덮는다 (기관 화면·포스터 확대: 아래 띠가 비워 둔 곳일 때만) */
    const camera = (rect, ms = 1100, max, bounds, reserve, scrim = false, ease) => stage(([r, m, x, b, v, c, e]) => {
      window.camera(r, m, x, b, v, e)
      document.getElementById('band').classList.toggle('on', c)
      return window.cam
    }, [rect, ms, max, bounds, reserve, scrim, ease ?? null])
    const badges = (list) => stage((l) => window.setBadges(l), list)
    const tr = (label, text) => stage(([l, t]) => window.setTr(l, t), [label, text])
    let sceneKey = '', sceneT0 = 0
    const marks = []
    /** 장면 안의 박자 기록 (장면 시작부터 초). timings.json에 남겨 내레이션과 맞는지 확인한다 */
    const mark = (label) => {
      const t = (Date.now() - sceneT0) / 1000
      marks.push({ scene: sceneKey, t: Math.round(t * 100) / 100, label })
      console.log(`    +${t.toFixed(2)}s ${label}`)
    }
    /** 장면 시작부터 sec초가 될 때까지 기다린다 (내레이션의 그 문장에 화면을 맞출 때) */
    const at = (sec) => until(sceneT0, sec * 1000)
    /** 지금 장면 대본에서 phrase를 읽기 시작하는 시각 + shift초까지 기다린다 */
    const atSay = (phrase, shift = 0) => at(cue(sceneKey, phrase) + shift)
    /**
     * 이 장면의 장면 표시와 구석 표시로 바꾼다. 카메라 이동을 시작한 직후에 불러, 앞 장면의 표시는 바로 내리고
     * delay ms 뒤(카메라가 거의 도착했을 때) 새 표시를 띄운다. hold: 큰 장면 표시를 띄워 둘 ms (그 뒤 작게)
     */
    const enter = (list = [], delay = 0, hold = 2200, fit = false) => stage(([c, l, d, h, f]) => window.enter(c, l, d, h, f), [SCENES[sceneKey].chip, list, delay, hold, fit])
    /** 장면: (녹음용이면) 대본을 바꾸고, 내레이션을 읽는 시간보다 짧게 끝나지 않게 한다. 장면 표시는 장면 안에서 enter()로 바꾼다 */
    async function scene(key, body) {
      const { say } = SCENES[key]
      sceneKey = key
      const t0 = sceneT0 = Date.now()
      console.log(`${((t0 - started) / 1000).toFixed(1)}s ${key}`)
      await stage((s) => window.setPrompter(s), PROMPTER ? say : '')
      await body()
      const acted = Date.now() - t0
      if (sayMs(say) > acted) await wait(sayMs(say) - acted)
      timings.push({ key, start: (t0 - started) / 1000, seconds: (Date.now() - t0) / 1000, acted: acted / 1000, narration: sayMs(say) / 1000, marks: marks.filter((entry) => entry.scene === key).map(({ t, label }) => ({ t, label })) })
    }
    /** 앱 안 요소의 사각형(그 앱의 CSS px) */
    const rectIn = (frame, selector) => frame.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const box = el.getBoundingClientRect()
      return { x: box.left, y: box.top, w: box.width, h: box.height }
    }, selector)
    /** 요소 안 글자·아이콘이 실제로 차지한 사각형 (한 줄짜리 문단에 테두리를 글 길이만큼만 그릴 때) */
    const contentRectIn = (frame, selector) => frame.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const range = document.createRange()
      range.selectNodeContents(el)
      const box = range.getBoundingClientRect()
      return { x: box.left, y: box.top, w: box.width, h: box.height }
    }, selector)
    const rectsIn = (frame, selector) => frame.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => {
      const box = el.getBoundingClientRect()
      return { x: box.left, y: box.top, w: box.width, h: box.height }
    }), selector)
    /**
     * 요소가 (스크롤 상자 또는 문서) 위에서 offset px 아래에 오도록 스크롤하고, 스크롤이 끝났을 때의 사각형을 미리 계산해 돌려준다.
     * 카메라를 스크롤과 동시에 움직이기 위해서다. instant면 바로 옮긴다(카메라가 다른 곳을 볼 때)
     */
    const scrollTo = (frame, selector, offset, container, instant) => frame.evaluate(([sel, off, boxSel, now]) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const box = boxSel ? document.querySelector(boxSel) : null
      const behavior = now ? 'instant' : 'smooth'
      let shift
      if (box) {
        const b = box.getBoundingClientRect()
        const target = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, box.scrollTop + r.top - b.top - off))
        shift = target - box.scrollTop
        box.scrollTo({ top: target, behavior })
      } else {
        const target = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, scrollY + r.top - off))
        shift = target - scrollY
        window.scrollTo({ top: target, behavior })
      }
      return { x: r.left, y: r.top - shift, w: r.width, h: r.height, shift }
    }, [selector, offset, container ?? null, !!instant])
    /** 휴대폰 화면의 세로 구간 [top, top+height](앱 px)을 화면에 꽉 차게 */
    const focusPhone = (top, height, ms = 1000) => {
      const y0 = Math.max(0, Math.min(PHONE.h - height, top))
      return camera({ x: PHONE.x - 30, y: PHONE.y + y0 * PHONE.k, w: PHONE.w * PHONE.k + 60, h: height * PHONE.k }, ms, 2.4, PHONE_FRAME)
    }
    /**
     * 기관 화면은 확대하면 화면을 꽉 채우므로, 위(장면에 들어갈 때의 큰 장면 표시)·아래(작은 장면 표시와 구석 표시) 띠를 비워 두고
     * 그 사이에 대상을 놓는다. 모든 기관 화면 장면이 같은 띠를 쓴다
     */
    const DESK_RESERVE = { top: 72, bottom: 54 }
    /** 넓게 보기로 크게 줌아웃할 때의 부드러운 곡선 */
    const SOFT = 'cubic-bezier(.4,0,.2,1)'
    /**
     * 기관 화면의 가로 구간 [left, right](앱 px)을 화면 너비에 꽉 차게, 세로 구간 [top, bottom]은 위아래 띠 사이 가운데에 놓는다.
     * 가로 구간을 열 사이 틈으로 정해 왼쪽 열(공고 목록·통계)이 반쯤 잘려 보이지 않게 한다. 높이가 넘치면 가로를 넓히지 않고 위에 맞춘다.
     * band: 위 띠(px). 큰 장면 표시가 떠 있을 때만 72, 그 뒤 장면 안의 샷은 16이면 된다 (작은 장면 표시는 아래 띠에 있다).
     * 위 띠가 작으면 창 머리가 반쯤 걸리지 않게 앱 맨 위보다 위는 찍지 않는다. 띠 사이 창(앱 px)을 돌려준다
     */
    const focusDeskSpan = async ([left, right], top, bottom, ms = 1000, { band = DESK_RESERVE.top, align = 'center', windowTop = null } = {}) => {
      const sApp = Math.min(1280 / ((right - left) * DESK.k), 2.2) * DESK.k
      const visW = 1280 / sApp, visH = 720 / sApp
      const bandTop = band / sApp, bandBottom = DESK_RESERVE.bottom / sApp
      const room = visH - bandTop - bandBottom
      const need = bottom - top + 24
      if (need > room + 0.5) console.warn(`    주의: 대상(높이 ${Math.round(need)}px)이 띠 사이(${Math.round(room)}px)에 다 들어가지 않아 위에 맞춥니다`)
      // align: 대상을 띠 사이 가운데(center), 위(top: 대상 위의 다른 글이 비치지 않게), 아래(bottom: 대상 아래의 다른 것이 띠 밖으로 밀리게)에
      const slack = Math.max(0, room - need)
      let visTop = top - 12 - bandTop - (align === 'top' ? 0 : align === 'bottom' ? slack : slack / 2)
      // windowTop: 창 맨 위를 이 앱 px에 (옆 열의 글 사이 빈 곳에 맞춰 반쯤 잘린 글이 없게)
      if (windowTop != null) visTop = windowTop
      if (band < DESK_RESERVE.top) visTop = Math.max(0, visTop)
      visTop = Math.max((DESK_FRAME.y - DESK.y) / DESK.k, Math.min(DESK.h - visH, visTop))
      const cx = (left + right) / 2
      await camera(toWorld(DESK, { x: cx - visW / 2, y: visTop, w: visW, h: visH }), ms, 2.2, DESK_FRAME, undefined, true)
      return { top: visTop + bandTop, bottom: visTop + visH - bandBottom }
    }
    /** 두 열 사이 틈의 가운데 (앱 px) */
    const gapX = (a, b) => Math.round((a.x + a.w + b.x) / 2)
    /**
     * 앱 안 사각형 r(그 앱 px)에 테두리. pad만큼 넓힌다(padX: 왼쪽·오른쪽, padTop·padBottom: 위·아래만 따로. 바로 옆 글자에 닿지 않게).
     * at 'left'면 이름표를 edge(world x, 예: 휴대폰 바깥 왼쪽 끝)보다 왼쪽 빈 캔버스에
     */
    const ringApp = (id, box, r, tone, label, { pad = 5, padX = pad, padTop = pad, padBottom = pad, at = 'below', edge = null } = {}) =>
      stage(([i, w, t, l, a, e]) => window.ringAt(i, w, t, l, a, e), [id, toWorld(box, { x: r.x - padX, y: r.y - padTop, w: r.w + padX * 2, h: r.h + padTop + padBottom }), tone, label, at, edge])
    /** 포스터 무대(#show) 안 사각형 r에 테두리. size는 화면에서 보이는 굵기·이름표 크기 배수, glow는 바깥 번짐(화면 px) */
    const ringShow = (id, r, tone, label, at = 'below', size = 1, glow = 5) =>
      stage(([i, w, t, l, a, z, g]) => window.ringAt(i, w, t, l, a, null, z, g), [id, inShow(r), tone, label, at, size, glow])
    const fadeRing = (id) => stage((i) => window.fadeRing(i), id)
    /** 휴대폰 테두리(베젤 포함)의 왼쪽 끝 (world x). 휴대폰 장면의 이름표는 이보다 왼쪽 빈 캔버스에 둔다 */
    const PHONE_EDGE = PHONE.x - 9
    /**
     * 녹화에서만: 지금 화면(가장 최근 화면 기록 프레임)을 그대로 덮어 둔다. 질문을 보내면 입력칸이 비고 대화가 잠시 빈 채로 보이는데,
     * 그 사이 카메라가 대기 화면으로 가면 질문이 사라진 듯 보인다. 덮어 둔 채 보내고, 대기 화면으로 바로 옮긴 뒤 unfreeze로 걷어 낸다
     */
    const freeze = async () => {
      await wait(120)
      await stage(async (src) => {
        const img = document.getElementById('freeze')
        img.src = src
        await img.decode().catch(() => {})
        img.style.transition = 'none'
        img.classList.add('on')
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      }, `data:image/jpeg;base64,${lastShot}`)
    }
    const unfreeze = (ms = 250) => stage(async (m) => {
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      const img = document.getElementById('freeze')
      img.style.transition = 'opacity ' + m + 'ms'
      img.classList.remove('on')
    }, ms)
    /**
     * 캔버스의 먼 곳(포스터 무대 ↔ 휴대폰·기관 화면)으로 옮길 때: 빈 캔버스를 오래 지나가지 않게, 지금 화면을 덮어 두고
     * move()에서 카메라를 바로(ms 0) 옮긴 뒤 ms 동안 겹쳐 바꾼다
     */
    const crossCut = async (move, ms = 320) => {
      await freeze()
      await move()
      await unfreeze(ms)
    }
    const unringAll = () => stage(() => window.unringAll())
    /** 앱 안 스크롤(문서·시트·검수 칸)이 멈출 때까지 기다린다. 사각형을 재기 전에 부른다 */
    const settled = (frame) => frame.evaluate(async () => {
      const sig = () => `${scrollY}|${[...document.querySelectorAll('dialog[open] .sheet-body, .pane-body')].map((el) => el.scrollTop).join(',')}`
      let last = sig(), same = 0
      for (let i = 0; i < 40 && same < 3; i++) {
        await new Promise((done) => setTimeout(done, 50))
        const now = sig()
        same = now === last ? same + 1 : 0
        last = now
      }
    })
    /** 커서를 앱 안 요소로 옮겨 누른다 (click=false면 가리키고 물결만) */
    async function tap(frame, box, selector, { click = true, settle = 750 } = {}) {
      await settled(frame)
      const r = await rectIn(frame, selector)
      if (!r) throw new Error(`누를 곳이 없습니다: ${selector}`)
      const at = toWorld(box, { x: r.x + Math.min(r.w / 2, 60), y: r.y + r.h / 2, w: 0, h: 0 })
      await stage(([x, y]) => window.pointTo(x, y), [at.x, at.y])
      await wait(settle)
      await stage(() => window.ripple())
      await wait(160)
      if (click) await frame.evaluate((sel) => document.querySelector(sel)?.click(), selector)
    }
    const hideCursor = () => stage(() => window.hideCursor())
    const SHEET = 'dialog[open] .sheet-body'
    const CARD = `a.item[href="/programs/${PROGRAM}"]`
    const POSTER_PANE = 'section[aria-labelledby="pane-poster"]'
    /** 질문을 보낸 뒤: 시트 제목부터 보낸 말풍선과 '확인 중' 표시까지 (말풍선이 그려진 뒤에 카메라를 옮긴다. freeze로 덮어 둔 동안이면 ms 0으로 바로) */
    const focusPending = async (ms = 600) => {
      await phone.waitForSelector('.bubble--user', { timeout: 5000 })
      await phone.waitForSelector('.bubble--pending', { timeout: 5000 }).catch(() => {})
      await settled(phone)
      const head = await rectIn(phone, 'dialog[open] .sheet-head')
      const user = await rectsIn(phone, '.bubble--user')
      const pending = await rectIn(phone, '.bubble--pending')
      const last = user[user.length - 1]
      if (!last || !pending || !head) return
      // 첫 질문이면 시트 제목까지 함께, 대화가 길면 보낸 질문부터
      const top = last.y - head.y < 300 ? head.y - 8 : last.y - 40
      await focusPhone(top, pending.y + pending.h + 22 - top, ms)
      mark('pending shot')
    }
    /** 앱이 다음 화면을 그리고 효과를 시작할 때까지 두 프레임 */
    const nextFrames = (frame) => frame.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
    /**
     * 녹화에서만: 상담 시트가 답을 받으면 대화 끝으로 부드럽게 내리는데(scrollIntoView), 그 사이 몇 프레임 동안 답 끝(근거·문의문)이
     * 먼저 비쳤다가 '한 일'로 돌아온다. 답을 기다리는 동안만 시트 안의 scrollIntoView를 건너뛰고, 카메라가 보여 줄 곳으로 직접 옮긴다 (앱 코드는 그대로)
     */
    const holdChatScroll = (frame, hold) => frame.evaluate((on) => {
      if (!window.__plainScrollIntoView) {
        window.__plainScrollIntoView = Element.prototype.scrollIntoView
        Element.prototype.scrollIntoView = function (...args) {
          if (window.__holdChatScroll && this.closest('dialog')) return
          return window.__plainScrollIntoView.apply(this, args)
        }
      }
      window.__holdChatScroll = on
    }, hold)
    /** 지금부터 ms가 지날 때까지 기다린다 (카메라 이동 + 머무는 시간을 한 번에) */
    const until = async (t0, ms) => { const left = ms - (Date.now() - t0); if (left > 0) await wait(left) }

    // 1. 표지: 부모님 휴대폰 ↔ 기관 화면(앱의 '보호자 질문' 탭) 순환과 서비스 이름 (포스터 변환은 표지에 쓰지 않는다)
    // 내레이션: '못 찾은 질문이'(약 0.9초~)에 '못 찾은 질문'(휴대폰 → 기관), '안내가 돼서 돌아와요'(약 3.6초~)에 '덧붙인 안내'(기관 → 휴대폰)도 켜진다
    await scene('opening', async () => {
      await atSay('못 찾은', -0.15)
      await stage(() => window.link(1))
      mark('못 찾은 질문')
      await atSay('안내가', -0.15)
      await stage(() => window.link(1, 2))
      mark('덧붙인 안내')
    })

    // 2. 부모님 휴대폰(베트남어 화면): 첫 화면의 세 언어 → 'Tiếng Việt' → 홈 → 아이 나이·시간 → 맞는 공고(포스터 썸네일·맞아요) → 상세 → 베트남어 포스터
    // 내레이션: '언어는 아직 세 개예요'(0~2.0초)에 세 언어 테두리, '베트남어로 해 볼게요'(약 2.3초~)에 Tiếng Việt 누르기, '여덟 살, 토요일 낮'(약 4.5초~)에 조건 시트,
    // '이렇게만 넣으면'(약 6.6초~)에 보기, '맞는 공고가 이유랑 같이 떠요'(약 8.5초~)에 맞는 공고 카드·상세의 맞아요 칸, '포스터도 번역돼 있어요'(약 11.4초~)에 번역 포스터.
    // 포스터는 녹화 전에 승인해 두어 '담당자 확인' 줄이 사실이다
    let reviewReady = null
    await scene('guardian', async () => {
      await stage(() => { window.link(0); document.getElementById('loopTitle').classList.add('off') })
      await camera(SLOT_PHONE, 1000)
      // 기관 화면이 카메라 밖으로 나간 뒤 포스터 검수 화면으로 새로 연다 (장면과 함께 돌고, 포스터 장면이 끝나기를 기다린다. 실패는 그때 던진다)
      reviewReady = wait(1200).then(openReview).then(() => null, (error) => error)
      await enter([], 650)
      await wait(950)
      // 첫 화면의 언어 셋(쉬운 한국어 · Tiếng Việt · 中文). 이름표는 휴대폰 왼쪽 빈 캔버스에
      await ringApp('langs', PHONE, await rectIn(phone, '.intro-langs'), 'ok', '고를 수 있는 언어 3개', { pad: 6, at: 'left', edge: PHONE_EDGE })
      mark('세 언어')
      // '베트남어로 해 볼게요': 커서를 옮기고, 누르기 바로 전에 테두리를 내린다 (누르면 첫 화면이 베트남어로 바뀌며 줄 위치가 달라져 테두리가 엉뚱한 줄을 감싸게 된다)
      await atSay('베트남어로', 0)
      await settled(phone)
      const vi = await rectIn(phone, '.intro-lang:has(> span[lang="vi"])')
      const viAt = toWorld(PHONE, { x: vi.x + Math.min(vi.w / 2, 60), y: vi.y + vi.h / 2, w: 0, h: 0 })
      await stage(([x, y]) => window.pointTo(x, y), [viAt.x, viAt.y])
      await wait(400)
      await unringAll()
      await stage(() => window.ripple())
      await wait(160)
      await phone.evaluate(() => document.querySelector('.intro-lang:has(> span[lang="vi"])')?.click())
      mark('베트남어 고름')
      await wait(350)
      await tap(phone, PHONE, '.intro-start', { settle: 300 })
      await phone.waitForSelector('.home-poster img', { timeout: 10_000 }).catch(() => {})
      await imagesReady(phone, '.home-poster img')
      await focusPhone(88, 450, 700)
      await wait(150)
      await atSay('여덟', -0.9)
      // 누름 표시까지 보인 뒤 화면을 덮어 두고 누른다: 시트가 반투명하게 열리는 중간(화면 기록이 가끔 멈추면 홈과 시트가 겹쳐 남는다)은 찍지 않고,
      // 다 열린 시트로 겹쳐 바꾼다. 커서·누름 표시는 덮인 동안 없앤다 (그 자리에 남으면 요일 칩(화)을 누르는 것처럼 보인다)
      await tap(phone, PHONE, '.fit-card', { settle: 300, click: false })
      await freeze()
      await phone.evaluate(() => document.querySelector('.fit-card')?.click())
      await stage(() => window.dropCursor())
      await phone.waitForSelector('dialog[open] .legend-link')
      await phone.evaluate(() => Promise.all(document.querySelector('dialog[open]').getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {}))))
      await focusPhone(150, 662, 0)
      await wait(80)
      await unfreeze(300)
      mark('조건 시트')
      await tap(phone, PHONE, 'dialog[open] .legend-link', { settle: 400 })
      await phone.locator('dialog[open] .input--short').pressSequentially('8', { delay: 50 })
      const times = phone.locator('dialog[open] .time-row input[type=time]')
      await times.nth(0).fill('09:00')
      await times.nth(1).fill('14:00')
      await phone.evaluate(() => document.activeElement?.blur())
      await tap(phone, PHONE, 'dialog[open] .time-row .btn--secondary', { settle: 350 })
      await wait(60)
      await tap(phone, PHONE, 'dialog[open] .sheet-foot button[type=submit]', { settle: 400 })
      mark('보기 누름')
      await phone.waitForSelector('.item-match', { timeout: 10_000 })
      await hideCursor()
      await imagesReady(phone, `${CARD} .item-poster img`)
      await atSay('맞는', -0.95)
      const card = await scrollTo(phone, CARD, 150)
      await focusPhone(card.y - 18, card.h + 36, 800)
      await settled(phone)
      await wait(100)
      await ringApp('pills', PHONE, union(await rectsIn(phone, `${CARD} .item-match > span`)), 'ok', '', { pad: 4 })
      mark('맞는 공고 카드')
      await wait(550)
      await tap(phone, PHONE, `${CARD} .item-title`, { settle: 400 })
      await unringAll()
      await phone.waitForSelector('.compare', { timeout: 10_000 })
      await hideCursor()
      await imagesReady(phone, '.poster-thumb img')
      const head = await rectIn(phone, '.detail-head')
      const compare = await rectIn(phone, '.compare')
      await focusPhone(head.y - 8, compare.y + compare.h + 10 - (head.y - 8), 700)
      await wait(350)
      await ringApp('thumb', PHONE, await rectIn(phone, '.poster-thumb'), 'ok', '', { pad: 3 })
      await ringApp('compare', PHONE, await rectIn(phone, '.compare-pills') ?? compare, 'ok', '', { pad: 4 })
      mark('상세 첫 화면')
      await wait(450)
      // 상세 포스터는 loading="lazy"라 화면 아래에 있으면 받지 않는다. 썸네일을 누르기 전에 받아 그려 둔다
      await phone.waitForSelector('#poster img', { state: 'attached', timeout: 10_000 })
      await imagesReady(phone, '#poster img')
      await phone.waitForSelector('#poster img', { timeout: 10_000 })
      await atSay('포스터도', -0.6)
      await tap(phone, PHONE, '.poster-thumb', { settle: 400 })
      mark('썸네일 누름')
      await unringAll()
      await hideCursor()
      // 썸네일을 누르면 앱이 포스터 구역(#poster)을 맨 위로 부드럽게 내린다
      await focusPhone(0, 540, 900)
      await wait(550)
      await settled(phone)
      const check = await rectIn(phone, '#poster .poster-check')
      // 이름표는 휴대폰 왼쪽 빈 캔버스에 (아래 포스터 띠를 덮지 않게), 테두리는 베트남어 성조 표시에 닿지 않게 넉넉히
      await ringApp('approved', PHONE, check, 'ok', '검증과 승인을 거친 포스터', { pad: 7, at: 'left', edge: PHONE_EDGE })
      mark('검증·승인 줄 테두리')
      await wait(1300)
    })

    // 3. 뒷이야기: 방금 본 포스터를 포스터 통번역 에이전트가 만든 과정(실제 실행 기록을 줄여서) → 기관 검수 화면의 담당자 승인(녹화 전에 실제 API로 승인)
    // 원본 · 베트남어 · 중국어 액자를 같은 크기로 나란히. 내레이션: '글만 바꾸고'(약 1.1초~)에 두 언어 1회차가 밀려 들어오고,
    // '다른 AI가 다시 읽어요'(약 2.5~4.6초)에 검증 스캔과 결과(베트남어 빨간 테두리 · 중국어 초록),
    // '빨간 건 일부러 넣은 날짜 오류예요'(약 5.0~8.0초)에 두 언어의 날짜 줄(베트남어 빨간 1회차 · 중국어 초록),
    // '고친 걸'(약 8.3초~) 직전에 베트남어 2회차로 겹쳐 바뀌며 초록, '담당자가 승인했어요'(약 8.9초~)에 검수 화면의 담당자 승인 줄
    // 날짜 칸(분홍 알약)은 1회차·중국어 0.568~0.606, 다음 '장소' 칸은 0.614부터, 베트남어 2회차는 0.539~0.575(다음 칸 0.583). 테두리는 알약 위 0.005·아래 0.002까지만
    const DATE_VI1 = posterPart(FV, 0.025, 0.563, 0.62, 0.045)
    const DATE_VI2 = posterPart(FV, 0.025, 0.534, 0.62, 0.043)
    const DATE_ZH = posterPart(FZ, 0.025, 0.563, 0.64, 0.045)
    /** 두 언어의 날짜 줄이 한 화면에 들어오게 (베트남어만 크게 보이지 않게). 가로는 두 테두리를 가운데에, 세로는 날짜 줄과 그 위 이름표 */
    const dateView = (margin) => {
      const left = DATE_VI1.x - margin, right = DATE_ZH.x + DATE_ZH.w + margin
      return { x: left, y: DATE_VI2.y - 62, w: right - left, h: DATE_VI1.y + DATE_VI1.h - DATE_VI2.y + 70 }
    }
    await scene('poster', async () => {
      // 휴대폰에서 포스터 무대까지 빈 캔버스를 지나가지 않게 겹쳐 바꾼다
      await crossCut(async () => {
        await unringAll()
        await hideCursor()
        await camera(SLOT_SHOW, 0)
        await enter(['실제 실행 기록 · 시간을 줄여 보여 줌'])
        await stage(() => window.step('edit'))
      })
      mark('원본과 두 언어 액자')
      await atSay('글만', -0.2)
      await stage(([v, z]) => { window.wipe('pv', v, 1100); setTimeout(() => window.wipe('pz', z, 1100), 160) }, [local(`translated/${a1.file}`), local(`translated/${zhChosen.file}`)])
      mark('두 언어 1회차')
      await atSay('다른', -0.15)
      await stage(() => { window.step('verify'); window.scan('pv', 900, true); window.scan('pz', 900) })
      mark('검증 스캔')
      await wait(950)
      await badges(['실제 실행 기록 · 시간을 줄여 보여 줌', `시연용 오류 주입: 베트남어 1회차 지시에 ${report.injected_fault ?? '날짜 순서'}`])
      await ringShow('vibad', pad(FV, 5), '', '✗ 1회차: 날짜 오류', 'below', 1.15)
      await ringShow('zhok', pad(FZ, 5), 'ok', `✓ ${zhChosen.n}회차 통과`, 'below', 1.15)
      mark('검증 결과 (중국어 통과 · 베트남어 날짜 오류)')
      // '빨간 건'에 날짜 줄의 빨간 테두리가 뜨게: 그 말보다 확대 시간만큼 먼저 다가간다
      await atSay('빨간', -0.8)
      // 아래 띠(장면 표시·구석 표시)를 비우고 두 언어의 날짜 줄을 그 위에 놓는다
      const reserve = { top: 0, bottom: 56 }
      await fadeRing('vibad')
      await fadeRing('zhok')
      await camera(inShow(dateView(46)), 900, 2.2, undefined, reserve, true)
      await wait(900)
      await ringShow('date', DATE_VI1, '', '✗ 베트남어 1회차: 날짜 순서가 바뀜 (10/31)', 'up', 1.35, 2)
      await ringShow('datezh', DATE_ZH, 'ok', `✓ 중국어 ${zhChosen.n}회차: 날짜 그대로 통과`, 'up', 1.35, 2)
      mark('날짜 줄 (베트남어 빨간 1회차 · 중국어 초록)')
      // 테두리가 머무는 동안 천천히 다가간다
      await camera(inShow(dateView(12)), 2300, 2.2, undefined, reserve, true)
      await atSay('고친', -0.75)
      // 확대한 채 회차를 바꾼다: 두 회차는 글 배치가 달라(2회차 날짜 줄이 조금 위) 밀어 넣지 않고 0.26초 동안 겹쳐 바꾼다
      await fadeRing('date')
      await stage(([src]) => window.fadeTo('pv', src, 260), [local(`translated/${last.file}`)])
      await wait(300)
      await ringShow('date', DATE_VI2, 'ok', `✓ 베트남어 ${last.n}회차: 31/10으로 고쳐 통과`, 'up', 1.35, 2)
      await stage(() => window.step('all'))
      mark('초록 2회차 테두리')
      // 기관 검수 화면: 'AI가 읽은 사실'과 번역 포스터 칸 (원본 공고 칸은 통째로 뺀다: 가로 구간을 칸 사이 틈에 맞춤)
      const failed = await reviewReady
      if (failed) throw failed
      const source = await rectIn(desk, 'section[aria-labelledby="pane-source"]')
      const facts = await rectIn(desk, 'section[aria-labelledby="pane-facts"]')
      const pane = await rectIn(desk, POSTER_PANE)
      // 창은 '시연용: 1회차 지시에 일부러 넣은 오류…' 안내에서 끝낸다 (그 아래 '담당자 승인' 버튼이 보이면 아직 승인 전처럼 읽힌다)
      const note = await rectIn(desk, `${POSTER_PANE} .timeline + p.muted`) ?? await rectIn(desk, `${POSTER_PANE} .timeline`)
      const noteBottom = note.y + note.h
      await atSay('담당자가', -0.05)
      await crossCut(async () => {
        await unringAll()
        await focusDeskSpan([gapX(source, facts), DESK.w], Math.max(pane.y, noteBottom - 400), noteBottom - 6, 0, { band: 16, align: 'bottom' })
        await badges(['실제 실행 기록 · 시간을 줄여 보여 줌'])
      })
      await wait(300)
      await ringApp('approved', DESK, await rectIn(desk, '.poster-state--approved'), 'ok', '', { pad: 7 })
      mark('담당자 승인 줄 테두리')
    })

    // 5. 상담 에이전트: 상세의 'AI에게 물어보기'(기관에 확인할 점 아래) → 베트남어 질문 → 에이전트가 한 일(한국어 풀이) → '기관에 물어볼 것'(준비물이 공고에 없음) → 기관에 물을 한국어 문장 → '기관에 알리기'
    // 내레이션: '물어볼게요'(약 2.9~4.6초)에 질문 입력·보내기, '공고를 읽더니'(약 5.0초~)에 답과 한 일, '준비물은 안 나와 있대요'(약 6.6~8.4초)에 답의 '기관에 물어볼 것' 줄과 풀이 3단계,
    // '그래서 기관에 물어볼 말은 한국어로 써 줘요'(약 9.0~12.9초)에 한국어 문의문 전체, '이건 이름 없이 알릴게요'(약 13.2초~)에 '기관에 알리기'
    await scene('consult', async () => {
      // 기관 화면에서 휴대폰까지 빈 캔버스를 지나가지 않게 겹쳐 바꾼다 (큰 장면 표시는 확대한 휴대폰 베젤 왼쪽 빈 곳에 맞춰 줄인다)
      await crossCut(async () => {
        await unringAll()
        const entry = await scrollTo(phone, '.ai-entry', 260, null, true)
        await settled(phone)
        await focusPhone(entry.y - 200, 360, 0)
        await enter([], 0, 2200, true)
      })
      await wait(350)
      await tap(phone, PHONE, '.ai-entry', { settle: 450 })
      // 시트가 열리기 시작한 뒤에 카메라를 옮긴다 (반투명한 시트가 찍히지 않게)
      await phone.waitForSelector('dialog[open] #chat-input', { timeout: 5000 }).catch(() => {})
      await wait(200)
      await phone.evaluate(() => document.activeElement?.blur())
      await focusPhone(470, 342, 700)
      await wait(250)
      await tap(phone, PHONE, '#chat-input', { click: false, settle: 350 })
      await tr('부모님의 질문 (한국어 번역)', QUESTION_KO)
      mark('질문 입력')
      await phone.locator('#chat-input').pressSequentially(QUESTION, { delay: 18 })
      await wait(150)
      await holdChatScroll(phone, true)
      // 다 쓴 질문 화면을 덮어 둔 채 보내고, 보낸 말풍선과 '확인 중'이 그려지면 대기 화면으로 바로 옮겨 걷어 낸다 (빈 대화가 비치지 않게)
      await freeze()
      await phone.locator('#chat-input').press('Enter')
      await hideCursor()
      await badges(['응답 대기 줄임 (실제 10~25초)'])
      await focusPending(0)
      await unfreeze()
      await phone.waitForSelector('.bot-turn', { timeout: 30_000 })
      // 답이 오면 대화 끝이 아니라 '한 일' 카드로 바로 옮긴다 (화면이 아래로 흘렀다 올라오지 않게)
      await nextFrames(phone)
      const steps = await scrollTo(phone, '.agent-steps', 16, SHEET, true)
      await holdChatScroll(phone, false)
      await focusPhone(steps.y - 12, 470, 800)
      // 질문 번역 말풍선이 다 사라진 뒤에 한국어 풀이를 띄운다 (두 말풍선이 겹쳐 보이지 않게)
      await tr('', '')
      mark('답 도착')
      await wait(400)
      await stage((list) => window.setRail('화면 속 ‘AI가 한 일’ · 한국어 풀이', list), railSteps(reply))
      await wait(250)
      await stage(() => window.tickTo(1))
      await wait(300)
      await stage(() => window.tickTo(2))
      // '준비물은 안 나와 있대요': 답의 결론과 목록으로 내려 '기관에 물어볼 것'(공고에 준비물이 없다는 줄)에 테두리, 풀이는 '공고에 답이 없는 질문 표시'까지 ✓
      await atSay('준비물은', -0.45)
      const askAt = await phone.evaluate(() => {
        const items = [...document.querySelectorAll('.bot-turn .bubble-text li')]
        const at = items.findIndex((li) => /^\s*(Cần hỏi|需向|需要向)/.test(li.textContent))
        return at >= 0 ? at : Math.min(1, items.length - 1)
      })
      const ASK = `.bot-turn .bubble-text li:nth-of-type(${askAt + 1})`
      const lead = await scrollTo(phone, '.bot-turn .bubble-text > :first-child', 16, SHEET)
      const askBefore = await rectIn(phone, ASK)
      const ask = { ...askBefore, y: askBefore.y - lead.shift }
      await focusPhone(lead.y - 12, ask.y + ask.h + 18 - (lead.y - 12), 700)
      await stage(() => window.tickTo(3))
      await settled(phone)
      await ringApp('ask', PHONE, await rectIn(phone, ASK), 'warm', '', { pad: 5, padX: 8 })
      mark('준비물: 공고에 없음 (기관에 물어볼 것)')
      await atSay('그래서', -0.3)
      await fadeRing('ask')
      const inquiry = await scrollTo(phone, '.chat-inquiry', 16, SHEET)
      await focusPhone(inquiry.y - 12, Math.min(inquiry.h + 30, 470), 800)
      await stage(() => window.tickTo(4))
      mark('한국어 문의문')
      await atSay('이건', -0.6)
      const unanswered = await scrollTo(phone, '.chat-unanswered', 16, SHEET)
      await focusPhone(unanswered.y - 12, Math.min(unanswered.h + 40, 420), 800)
      await settled(phone)
      const send = await rectIn(phone, '.chat-unanswered .btn')
      // 이름표는 휴대폰 왼쪽 빈 캔버스에 (버튼 바로 위 안내 문단의 글자에 닿지 않게)
      await ringApp('send', PHONE, send, 'warm', '기관에 알리기', { pad: 4, at: 'left', edge: PHONE_EDGE })
      await wait(200)
      await tap(phone, PHONE, '.chat-unanswered .btn', { settle: 400 })
      mark('기관에 알리기 누름')
      await phone.waitForSelector('.unanswered-sent', { timeout: 10_000 }).catch(() => {})
      await unringAll()
      await wait(600)
      await hideCursor()
      await stage(() => window.setRail('', null))
      // 기관 화면을 앱의 '보호자 질문' 화면으로 새로 연다 (카메라가 휴대폰에 있는 동안)
      await stage((src) => { document.getElementById('deskapp').src = src }, `${DASHBOARD}/?v=questions#questions/${PROGRAM}`)
    })

    // 6. 공고 보완 에이전트: 휴대폰 → 기관으로 질문이 넘어가는 모습을 넓게 본 뒤, 기관 화면 한 곳에 머물며(앱 안 스크롤만) 초안 → 빈칸·코드 검사 → 빈칸 채우기 → 덧붙이기
    // 내레이션: '방금 그 질문이 들어왔어요'(0~2.4초)에 넓게 보기 → 방금 알린 질문, '초안은 AI가 쓰는데'(약 2.7초~)에 '보완 초안 만들기',
    // '참가비처럼 기관만 아는 건 빈칸으로 둬요'(약 5.0~8.4초)에 초안과 참가비 빈칸, '지어내면 코드가 막아요'(약 8.9초~)에 코드 검사 줄,
    // '담당자가 채워서 덧붙이면'(약 11.4~13.9초)에 빈칸 채우기 → 덧붙이기, '질문에 답했다고 떠요'(약 14.1초~)에 '추가 안내로 답함'
    await scene('improve', async () => {
      await stage(() => window.link(1))
      await camera(OVERVIEW, 1150, undefined, undefined, undefined, false, SOFT)
      // 큰 장면 표시는 카메라가 거의 도착한 뒤에 (줌아웃 중에는 휴대폰 캔버스 이름이 그 자리를 지나간다), 기관 화면으로 확대하는 동안 작아진다
      await enter([], 600, 900)
      desk = await frameOf(DASHBOARD, 'questions')
      await desk.waitForSelector('.improve .btn--primary', { timeout: 20_000 })
      // 녹화에서만: 페이지 끝에 빈 곳을 두어 확정 버튼을 카메라가 보는 창 안으로 올릴 수 있게 (카메라를 옮기지 않고 앱 안에서만 스크롤)
      await desk.addStyleTag({ content: '.main-inner { padding-bottom: 420px !important; }' })
      // 질문 목록과 '보완 초안 만들기'가 한 화면에 들어오게 미리 내려 둔다 (카메라가 넓게 볼 때)
      await scrollTo(desk, '.question-list', 24, null, true)
      await wait(100)
      const list = await rectIn(desk, '.question-list')
      const start = await rectIn(desk, '.improve .btn--primary')
      // 왼쪽 공고 목록 열을 통째로 넣고(왼쪽 메뉴는 통째로 빼고), 그 아래 빈 곳에 작은 장면 표시가 온다
      const SPAN = [gapX(await rectIn(desk, '.side'), await rectIn(desk, '.list-pane')), DESK.w]
      // '못 찾은 질문' 화살표(휴대폰 → 기관)를 넓게 보여 준 뒤 기관 화면으로. 화살표는 카메라가 기관 화면에 닿은 뒤에 끈다 (확대하는 동안 화면 밖으로 나간다)
      await at(1.5)
      /** 이 장면 내내 카메라가 보는 띠 사이 창 (앱 px). 카메라는 여기 머물고 앱 안에서만 스크롤한다 */
      // 큰 장면 표시는 넓게 보는 동안 사라지므로 위 띠는 좁게 (창 머리는 찍지 않는다)
      const view = await focusDeskSpan(SPAN, list.y - 12, start.y + start.h + 14, 850, { band: 16 })
      await badges(['시연용 예시 질문 포함'])
      await at(2.1)
      const live = await rectIn(desk, '.question-list li:has(.live-mark)')
      // 왼쪽·오른쪽은 넉넉히 (테두리 선이 질문 첫 글자에 얹히지 않게)
      if (live) await ringApp('live', DESK, live, 'warm', '방금 부모님이 알린 질문', { pad: 3, padX: 14, at: 'in' })
      mark('방금 알린 질문')
      await at(2.45)
      await stage(() => window.link(0))
      await atSay('초안은', -0.25)
      await tap(desk, DESK, '.improve .btn--primary', { settle: 400 })
      await unringAll()
      await badges(['시연용 예시 질문 포함', '응답 대기 줄임 (실제 10~20초)'])
      await desk.waitForSelector('.draft', { timeout: 30_000 })
      await hideCursor()
      mark('보완 초안')
      // 영상에서는 참가비·준비물 두 항목만 확정한다
      await desk.evaluate((keep) => document.querySelectorAll('.draft-include input').forEach((box, index) => { if (!keep.includes(index) && box.checked) box.click() }), chosen.map((entry) => entry.index))
      // 에이전트가 한 일 칩 줄을 창 맨 위에 (칩도, 그 위 안내 문단의 마지막 줄도 반쯤 잘려 비치지 않게. 위 띠 16px는 비워 둔 곳일 뿐 가려지지 않는다),
      // 그 아래 코드 검사 줄과 첫 항목(참가비)의 초안·빈칸이 들어오게
      await scrollTo(desk, '.improve .agent-steps', view.top - 5)
      await wait(700)
      await settled(desk)
      await atSay('빈칸으로', -0.25)
      await ringApp('blank', DESK, await rectIn(desk, `.draft-list > li:nth-child(${chosen[0].index + 1}) .blank`), 'warm', '', { pad: 4 })
      mark('참가비 빈칸 테두리')
      await atSay('지어내면', -0.1)
      // 테두리는 줄 전체가 아니라 글 길이만큼
      await ringApp('check', DESK, await contentRectIn(desk, '.improve .check-line') ?? await rectIn(desk, '.improve .check-line'), 'ok', '', { pad: 5, padX: 12 })
      mark('코드 검사 줄 테두리')
      await atSay('담당자가', -1.4)
      await fadeRing('blank')
      await fadeRing('check')
      await badges(['시연용 예시 질문 포함', '빈칸에 넣는 값은 시연용'])
      for (const { index, value } of chosen) {
        const selector = `.draft-list > li:nth-child(${index + 1}) .blank input`
        await scrollTo(desk, `.draft-list > li:nth-child(${index + 1})`, view.top + 8)
        await wait(420)
        await tap(desk, DESK, selector, { click: false, settle: 250 })
        await desk.locator(selector).first().pressSequentially(value, { delay: 24 })
        await wait(100)
      }
      mark('빈칸 다 채움')
      await atSay('덧붙이면', -0.9)
      // 확정 버튼을 창 아래쪽으로 올리면서 커서도 그 자리로 (스크롤이 끝나기를 따로 기다리지 않는다)
      const confirm = '.improve-actions .btn--primary'
      const button = await scrollTo(desk, confirm, view.bottom - 90)
      const point = toWorld(DESK, { x: button.x + Math.min(button.w / 2, 60), y: button.y + button.h / 2, w: 0, h: 0 })
      await stage(([x, y]) => window.pointTo(x, y), [point.x, point.y])
      await wait(650)
      await settled(desk)
      await stage(() => window.ripple())
      await wait(160)
      await desk.evaluate((sel) => document.querySelector(sel)?.click(), confirm)
      mark('덧붙이기 누름')
      // 번역은 미리 받아 두지만(warmTranslations), 서버를 새로 띄웠으면 번역 시간 제한(20초)까지 걸릴 수 있다
      await desk.waitForSelector('.improve .notice--ok', { timeout: 25_000 })
      await hideCursor()
      // 확정하면 질문 목록에 '답함' 표시가 붙고, 패널 위에 덧붙였다는 알림이 뜬다
      await wait(150)
      const notice = await rectIn(desk, '.improve .notice--ok')
      const listNow = await rectIn(desk, '.question-list')
      // 답함 표시가 붙은 질문 목록과 덧붙였다는 알림이 함께 들어오게
      const shifted = await scrollTo(desk, '.question-list', Math.max(view.top + 4, view.bottom - (notice.y + notice.h - listNow.y) - 6))
      await wait(650)
      await settled(desk)
      await atSay('질문에', -0.1)
      const tags = await rectsIn(desk, '.question-list .answered-tag')
      for (const [index, tag] of tags.entries()) await ringApp(`answered${index}`, DESK, tag, 'ok', '', { pad: 3 })
      mark(`답함 표시 ${tags.length}개 (목록 ${Math.round(shifted.y)}px)`)
      await wait(1500)
      // 휴대폰을 중국어가 편한 다른 가정의 새 화면으로 (카메라가 기관 화면에 있는 동안). 화면 언어는 앱이 기억하는 값을 바꿔 둔 뒤 새로 연다
      await phone.evaluate(() => { try { localStorage.setItem('osan-guardian-locale', 'zh') } catch { /* 없으면 아래에서 멈춘다 */ } })
      await stage((src) => { document.getElementById('app').src = src }, `${GUARDIAN}/programs/${PROGRAM}?again=1`)
    })

    // 7. 다시 묻기: 기관 → 휴대폰으로 안내가 돌아간다. 이번에는 중국어가 편한 다른 가정 (중국어 화면, 중국어 질문, 중국어 답)
    // 내레이션: '중국어가 편한 다른 가정이에요'(0~2.9초)에 넓게 보기 → 중국어 화면, '아까 그 안내가 보여요'(약 3.1~4.9초)에 초록 추가 안내 카드,
    // '참가비랑 준비물을 물으면'(약 5.4~7.7초)에 질문, '이번엔 그 안내를 보고 답해요'(약 8.1초~)에 중국어 답 문장 → 근거
    // 추가 안내 카드부터 찍는다 (비용 줄도 이 안내를 보여 준다)
    await scene('again', async () => {
      await stage(() => window.link(2))
      await camera(OVERVIEW, 1150, undefined, undefined, undefined, false, SOFT)
      // 큰 장면 표시는 카메라가 거의 도착한 뒤에 띄우고, 휴대폰으로 확대하기(1.4초) 즈음 작아진다 (확대한 휴대폰 베젤 위에 얹히지 않게)
      await enter([], 600, 900)
      phone = await frameOf(GUARDIAN, 'again')
      await phone.waitForSelector('.addenda', { timeout: 20_000 })
      if (await phone.evaluate(() => document.documentElement.lang) !== 'zh') throw new Error('다른 가정의 화면이 중국어로 열리지 않았습니다.')
      await phone.addStyleTag({ content: PHONE_CSS })
      // 추가 안내 카드를 휴대폰 화면 맨 위에 둔다 (카메라가 넓게 볼 때)
      const addenda = await scrollTo(phone, '.addenda', 14, null, true)
      await wait(100)
      const entry = await rectIn(phone, '.ai-entry')
      // 카드 위 여백만 조금 (바로 위 공고 요약 칸은 넣지 않는다)
      const above = await phone.evaluate(() => { const el = document.querySelector('.addenda')?.previousElementSibling; if (!el) return null; const box = el.getBoundingClientRect(); return box.bottom })
      const top = Math.max(addenda.y - 10, (above ?? -Infinity) + 2)
      // '덧붙인 안내' 화살표(기관 → 휴대폰)를 넓게 보여 준 뒤, '다른 가정이에요'에 중국어 화면이 보이게 다가간다. 화살표는 휴대폰에 닿은 뒤에 끈다
      await at(1.6)
      await focusPhone(top, entry.y + entry.h + 12 - top, 800)
      await atSay('아까', -0.15)
      await stage(() => window.link(0))
      // 이름표는 휴대폰 왼쪽 빈 캔버스에 (아래 '기관에 확인할 점' 제목을 덮지 않게)
      await ringApp('addenda', PHONE, await rectIn(phone, '.addenda'), 'ok', '기관이 덧붙인 안내', { pad: 4, at: 'left', edge: PHONE_EDGE })
      // 안내 문장은 저장할 때 AI가 옮긴 중국어이고, 기관이 쓴 한국어 원문이 함께 보인다
      await badges(['AI 번역 · 기관이 쓴 한국어 원문 함께'])
      mark('추가 안내 카드')
      await atSay('참가비랑', -0.8)
      await tap(phone, PHONE, '.ai-entry', { settle: 300 })
      await unringAll()
      // 시트가 열리기 시작한 뒤에 카메라를 옮긴다 (반투명한 시트가 찍히지 않게). 번역 말풍선 너비는 옮긴 카메라 기준
      await phone.waitForSelector('dialog[open] #chat-input', { timeout: 5000 }).catch(() => {})
      await wait(150)
      await phone.evaluate(() => document.activeElement?.blur())
      await focusPhone(470, 342, 550)
      await tr('다른 가정의 질문 (한국어 번역)', QUESTION_AGAIN_KO)
      await phone.locator('#chat-input').pressSequentially(QUESTION_AGAIN, { delay: 6 })
      await holdChatScroll(phone, true)
      // 다 쓴 질문 화면을 덮어 둔 채 보내고, 대기 화면으로 바로 옮겨 걷어 낸다 (빈 대화가 비치지 않게)
      await freeze()
      await phone.locator('#chat-input').press('Enter')
      mark('질문 보냄')
      await hideCursor()
      await badges(['응답 대기 줄임'])
      // 기관 화면을 AI 편성 제안으로 새로 연다 (카메라가 휴대폰에 있는 동안)
      await stage((src) => { document.getElementById('deskapp').src = src }, `${DASHBOARD}/?v=plan#plan`)
      await focusPending(0)
      await unfreeze()
      await phone.waitForSelector('.bot-turn', { timeout: 30_000 })
      await nextFrames(phone)
      // 답 문장(참가비·준비물)이 시트 맨 위에 오게 바로 옮기고, 근거까지 한 화면에 들어오면 카메라를 한 번만 움직인다
      const answer = await scrollTo(phone, '.bot-turn .bubble--bot', 10, SHEET, true)
      await holdChatScroll(phone, false)
      const lead = await rectIn(phone, '.bot-turn .bubble-lead') ?? await rectIn(phone, '.bot-turn .bubble-text > :first-child')
      const sources = await rectIn(phone, '.chat-sources')
      const body = await rectIn(phone, SHEET)
      const oneShot = sources.y + sources.h <= body.y + body.h - 4 && sources.y + sources.h - answer.y <= 600
      await tr('', '')
      if (oneShot) await focusPhone(answer.y - 18, sources.y + sources.h + 10 - (answer.y - 18), 600)
      else await focusPhone(answer.y - 18, Math.min(lead.y + lead.h + 60 - answer.y, 360), 600)
      mark(`답 도착 (${oneShot ? '한 화면' : '두 화면'})`)
      // 두 화면이면 근거로 옮기는 데 시간이 더 들어, 답 이름표를 조금 일찍 띄워 충분히 보이게 한다
      await wait(oneShot ? 400 : 200)
      // 두 번째 답은 녹화 전에 같은 추가 안내(FILL)를 저장해 받은 실제 중국어 답이고, 첫 문장이 그 두 값을 말한다(prefetch가 확인)
      // 이름표는 그 문장의 한국어 뜻. 휴대폰 왼쪽 빈 캔버스에 두 줄로 (답 위는 화면 끝이라 잘리고, 아래는 다음 항목 글자).
      // 테두리는 위·옆은 넉넉히, 아래는 다음 줄(첫 항목) 위에서 멈춘다 (문장과 첫 항목 사이는 8px뿐)
      const gap = await phone.evaluate(() => {
        const el = document.querySelector('.bot-turn .bubble-lead') ?? document.querySelector('.bot-turn .bubble-text > :first-child')
        const next = el?.nextElementSibling
        return next ? next.getBoundingClientRect().top - el.getBoundingClientRect().bottom : null
      })
      const padBottom = gap == null ? 2 : Math.round(Math.max(1, Math.min(8, gap - 5)))
      await ringApp('answer', PHONE, lead, 'ok', `중국어 답: 참가비 ${FILL.other}\n${FILL.materials}`, { pad: 8, padBottom, at: 'left', edge: PHONE_EDGE })
      mark(`답 문장 테두리 (아래 ${padBottom}px)`)
      // 두 화면이면 근거로 옮기는 데 약 0.55초가 더 든다. 근거 테두리가 '그 안내를 보고'에 오게 그만큼 일찍 옮긴다 (답 이름표는 약 1.3초)
      await wait(oneShot ? 1600 : 1300)
      if (!oneShot) {
        const moved = await scrollTo(phone, '.chat-sources', 40, SHEET)
        await unringAll()
        await focusPhone(moved.y - 36, Math.min(moved.h + 64, 450), 400)
        await wait(50)
        await settled(phone)
      }
      const cited = await rectsIn(phone, '.chat-sources blockquote:has(.chat-source-note)')
      if (cited.length) await ringApp('cited', PHONE, union(cited), 'ok', '기관이 덧붙인 안내를 근거로', { pad: 3, at: 'in-top' })
      mark('근거 테두리')
      await wait(1300)
    })

    // 8. 편성 에이전트: 통계(시연은 가상 응답)·질문·지금 공고를 읽고 → 편성안(대상·반, 요일·장소는 코드 계산) → 지금처럼 토요일 오전과 견준 숫자
    // 내레이션: '통계는 가상 응답이에요'(0~2.2초)에 화면 제목과 통계 히트맵(구석 표시 '가상 응답 400가정'), 'AI 편성안을 만들어 보면'(약 2.5초~)에 'AI 편성안 만들기',
    // '초등 한국어 교실 두 반이 나와요'(약 5.2~8.0초)에 편성안 카드와 '언제·어디서' 두 줄, '토요일 오전에 열 때보다, 맞는 가정이 거의 두 배예요'(약 8.3초~)에 '지금처럼 모두 토요일 오전 22% > 이 편성안 41%' 줄
    await scene('plan', async () => {
      await unringAll()
      // 마무리 무대를 미리 올려 둔다 (포스터 무대는 지금 카메라 밖이다. 마무리는 겹쳐 바꾸며 바로 보인다). 끝나기를 기다리지 않는다
      await stage((html) => { window.show(html) }, endingHtml())
      desk = await frameOf(DASHBOARD, 'plan')
      await desk.waitForSelector('.plan-agent .btn--primary', { timeout: 20_000 })
      // 열 사이 틈: 왼쪽 메뉴 | 통계 열 | 편성 도우미 열. 카메라 가로 구간을 틈에 맞춰 반쯤 잘린 열이 없게
      const side = await rectIn(desk, '.side')
      const data0 = await rectIn(desk, '.plan-data')
      const agent0 = await rectIn(desk, '.plan-agent')
      const ALL = [gapX(side, data0), DESK.w]
      const RIGHT = [gapX(data0, agent0), DESK.w]
      // 화면 제목('AI 편성 제안'과 설명)부터 통계 히트맵·편성 도우미 버튼까지
      const head = await rectIn(desk, '.plan-view')
      const heat0 = await rectIn(desk, '.heatmap-figure')
      const button0 = await rectIn(desk, '.plan-agent .btn--primary')
      await focusDeskSpan(ALL, head.y, Math.max(heat0.y + heat0.h, button0.y + button0.h) + 8, 1100)
      await enter(['통계는 시연용 가상 응답 400가정'], 700)
      await atSay('AI', -0.5)
      await tap(desk, DESK, '.plan-agent .btn--primary', { settle: 400 })
      mark('편성안 만들기 누름')
      await badges(['통계는 시연용 가상 응답 400가정', '응답 대기 줄임 (실제 20~30초)'])
      await desk.waitForSelector('.plan-card', { timeout: 30_000 })
      await hideCursor()
      mark('편성안 도착')
      // 편성안이 오면 (한 일 칩·코드 검사 줄은 넓게 본 화면 오른쪽 열에 뜬다) '초등 한국어 교실'에 맞춰 카드로 바로 간다.
      // 큰 장면 표시가 사라진 뒤의 샷이라 위 띠는 좁게 (작은 장면 표시·구석 표시는 아래 띠)
      await atSay('초등', -0.55)
      // 편성안 카드: 제목·41%·'지금처럼 토요일 오전' 줄·'언제·어디서' 두 줄이 한 창에 들어오게
      const classes = await rectIn(desk, '.plan-classes')
      const tabs = await desk.evaluate(() => { const el = document.querySelector('.plan-card')?.previousElementSibling; return el ? el.getBoundingClientRect().bottom : null })
      const next = await rectIn(desk, '.plan-classes + .plan-sub')
      const card = await scrollTo(desk, '.plan-card', 420)
      const classesBottom = classes.y - card.shift + classes.h + 6
      // 창 맨 위는 카드 위 탭 줄과 카드 사이 빈 곳에 (탭 줄이 반쯤 잘려 비치지 않게). 그러면 '언제·어디서' 줄이 아래 띠에 걸리거나
      // 그 아래 다음 제목이 띠에 반쯤 잘리면 예전처럼 '언제·어디서' 줄을 띠 사이 맨 아래에 둔다
      const sApp = Math.min(1280 / ((RIGHT[1] - RIGHT[0]) * DESK.k), 2.2) * DESK.k
      const visibleH = (720 - DESK_RESERVE.bottom) / sApp
      let windowTop = tabs == null ? null : Math.round((tabs - card.shift + card.y) / 2)
      if (windowTop != null) {
        const bottom = windowTop + visibleH
        const nextTop = next ? next.y - card.shift : Infinity
        if (classesBottom + 6 > bottom || (nextTop < bottom && nextTop + (next?.h ?? 0) > bottom - 2)) windowTop = null
      }
      await focusDeskSpan(RIGHT, card.y, classesBottom, 900, { band: 16, align: 'bottom', windowTop })
      mark(`편성안 카드 (창 ${windowTop == null ? '언제·어디서 줄을 맨 아래에' : '탭 줄 아래부터'})`)
      await atSay('두 반이', -0.2)
      await settled(desk)
      await ringApp('classes', DESK, await rectIn(desk, '.plan-classes'), 'warm', '', { pad: 4 })
      mark('언제·어디서 두 줄 테두리')
      await atSay('토요일', -0.2)
      await fadeRing('classes')
      await ringApp('compare', DESK, await rectIn(desk, '.plan-card .plan-compare'), 'warm', '', { pad: 6, padX: 12 })
      mark('토요일 오전 22% > 이 편성안 41% 테두리')
      await wait(1500)
    })

    // 9. 마무리: 순환 그림과 '잇다, 오산', 한 줄 소개. 기관 화면에서 무대까지 빈 캔버스를 지나가지 않게 겹쳐 바꿔, 첫 말부터 무대가 보인다.
    // 마디는 내레이션 '부모님의 질문이 다음 프로그램이 되는 곳'에 맞춰 읽기(포스터) → 연결(상담, '질문이') → 편성(공고 보완·편성, '다음 프로그램이') 차례로 켜진다
    await scene('ending', async () => {
      await crossCut(async () => {
        await unringAll()
        await hideCursor()
        await camera(SLOT_SHOW, 0)
        await enter([])
        await stage(() => window.on('#endText'))
      })
      for (const [index, [phrase, shift, name]] of [['부모님의', 0.3, '읽기'], ['질문이', 0.1, '연결'], ['다음', 0.25, '편성']].entries()) {
        await atSay(phrase, shift)
        await stage((n) => window.on(`#n${n}`), index)
        mark(`마디 ${name} ('${phrase}')`)
      }
      await wait(2300)
    })
    const ended = Date.now()
    console.log(`${((ended - started) / 1000).toFixed(1)}s 끝`)
    await wait(300)
    await cdp.send('Page.stopScreencast')

    fs.writeFileSync(path.join(WORK, 'timings.json'), JSON.stringify(timings, null, 2))
    console.log(timings.map(({ key, seconds: s, acted, narration: n }) => `${key.padEnd(15)} ${s.toFixed(1)}s (화면 ${acted.toFixed(1)}s · 내레이션 ${n.toFixed(1)}s)`).join('\n'))
    // 2분 안전장치: 장면 합계나 실제 프레임 길이가 MAX_SECONDS를 넘으면 인코딩하지 않는다
    const planned = timings.reduce((sum, { seconds: s }) => sum + s, 0)
    // 화면 기록은 바뀐 화면만 보낸다. 마지막 프레임은 녹화를 멈춘 때까지 보이게 한다 (프레임 시각은 epoch 초)
    const lastFrame = frames[frames.length - 1]
    const tail = Math.abs(frames[0].t - started / 1000) < 10 ? Math.max(0.4, ended / 1000 - lastFrame.t) : 0.4
    const seconds = lastFrame.t - frames[0].t + tail
    if (planned > MAX_SECONDS || seconds > MAX_SECONDS) throw new Error(`영상이 ${Math.max(planned, seconds).toFixed(1)}초로 ${MAX_SECONDS}초를 넘습니다. 장면을 줄인 뒤 다시 녹화하세요.`)

    // 프레임 → 30fps mp4 (프레임마다 실제로 머문 시간만큼)
    const list = frames.map((frame, index) => {
      const next = frames[index + 1]
      const duration = next ? Math.max(0.001, next.t - frame.t) : tail
      return `file '${frame.file}'\nduration ${duration.toFixed(4)}`
    })
    list.push(`file '${frames[frames.length - 1].file}'`)
    fs.writeFileSync(path.join(WORK, 'frames.txt'), list.join('\n') + '\n')
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(WORK, 'frames.txt'),
      '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-movflags', '+faststart', OUT], { stdio: 'inherit' })
    console.log(`프레임 ${frames.length}개, 약 ${seconds.toFixed(1)}초 (장면 합계 ${planned.toFixed(1)}초) → ${OUT}`)
  } finally {
    await browser.close()
    // 녹화 중 저장한 추가 안내·보호자 질문을 지우고, 승인한 포스터 기록을 승인 전으로 되돌린다
    await resetState().catch((error) => console.warn('처음 상태로 되돌리지 못했습니다:', error.message))
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
