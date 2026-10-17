// 2분 시연영상 녹화 (headless Chrome 화면 기록 → ffmpeg로 mp4). 장면과 내레이션 대본은 ../demo-script.md와 같다.
// 먼저 API(8787)·보호자 웹(5173)·기관 대시보드(5174)를 띄우고, node prepare-assets.js를 실행해 둔다.
// node record-demo.js             → ../osan-kids-bridge-demo.mp4 (제출용, 화면 글자 최소)
// PROMPTER=1 node record-demo.js  → ../osan-kids-bridge-demo-prompter.mp4 (내레이션 녹음용, 아래에 대본이 뜬다)
// 실제 포스터가 들어가므로 영상은 커밋하지 않는다.
//
// 화면 구성: 보호자 휴대폰·기관 관리자 화면·포스터 무대를 한 장의 큰 캔버스(world)에 놓고, 카메라(transform)가 그 위를 움직인다.
// 앱 안의 버튼은 커서를 그 자리로 옮긴 뒤 DOM click으로 누른다(무대가 확대·축소되어 좌표 클릭이 어긋나므로).
//
// 정직하게 줄인 것: 포스터 통번역은 실제 실행 기록(translated/*.json과 회차별 이미지)을 다시 보여 주며 시간을 줄였고,
// 상담 답 두 번·공고 보완 초안·편성안은 녹화 직전(편성안은 capture.js plan)에 실제 API로 받은 결과를 녹화 중에 2.5초 만에 돌려준다(실제 응답 10~30초). 화면 구석 표시로 밝힌다.
// 두 번째 상담 답은 영상에서 담당자가 덧붙일 것과 같은 추가 안내를 미리 저장해 받은 뒤 지운다(녹화는 추가 안내가 없는 상태에서 시작).
// API는 npm run demo로 새로 띄운 상태(관리자 API 켬)여야 한다.
const { chromium } = require('playwright-core')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const ASSETS = path.resolve(__dirname, '../assets')
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
const QUESTION_AGAIN = 'Hội thao có mất phí không? Cần mang gì?'
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
const REPORT = path.join(ROOT, `apps/program-api/data/local/translated/${PROGRAM}.vi.json`)
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
const asset = (name) => 'file://' + path.join(ASSETS, name)
const local = (file) => 'file://' + path.join(ROOT, 'apps/program-api/data/local', file)

/**
 * 장면별 내레이션. 장면 길이는 '읽는 데 드는 시간'(초당 5.2음절 + 여유 0.6초)보다 짧아지지 않는다.
 * chip은 화면 왼쪽 위의 작은 장면 표시, 제출용 영상의 화면 글자는 이것과 구석의 '줄인 것' 표시뿐이다.
 */
const SCENES = {
  opening: { chip: '', say: '한국어 포스터 한 장이 보호자의 언어로 바뀝니다. 오산 아이 프로그램입니다.' },
  problem: { chip: '문제', say: '오산은 주민 열한 명 중 한 명이 외국인주민입니다. 그런데 날짜와 대상, 신청 방법이 담긴 포스터는 한국어 그대로입니다.' },
  poster: { chip: '① 읽기 · 포스터 통번역 에이전트', say: '첫 번째, 포스터 통번역 에이전트입니다. 디자인은 그대로 두고 글만 베트남어로 바꾼 뒤, 다른 AI가 처음부터 다시 읽어 대조합니다. 시연용으로 일부러 넣은 날짜 오류를 잡아, 2회차에 그 부분만 고쳤습니다.' },
  review: { chip: '① 읽기 · 기관 검수 화면', say: '통과한 포스터는 담당자가 원문과 나란히 놓고 승인합니다.' },
  guardian: { chip: '보호자 화면 · 베트남어', say: '보호자는 아이 나이와 갈 수 있는 시간만 넣습니다. 이름은 묻지 않습니다. 맞는 공고만 이유와 함께 뜨고, 모르는 건 기관에 확인할 점으로 표시됩니다.' },
  consult: { chip: '② 연결 · 상담 에이전트', say: '두 번째, 상담 에이전트입니다. 여덟 살 아이와 갈 수 있는지, 준비물은 뭔지 베트남어로 묻습니다. 공고를 읽고 원문 근거와 함께 답하고, 공고에 없는 준비물은 지어내지 않고 기관에 물어볼 한국어 문장으로 바꿔 줍니다.' },
  improve: { chip: '③ 편성 · 공고 보완 에이전트', say: '세 번째, 공고 보완 에이전트입니다. 이름 없이 모인 질문으로 공고에 덧붙일 안내 초안을 쓰고, 기관만 아는 답은 빈칸으로 남깁니다. 담당자가 채워 확정하면 바로 게시됩니다.' },
  again: { chip: '다시 보호자 화면', say: '다른 보호자가 같은 걸 물으면, 이제 기관이 덧붙인 안내로 답합니다.' },
  plan: { chip: '③ 편성 · 편성 에이전트', say: '네 번째, 편성 에이전트입니다. 보호자들의 익명 통계와 질문, 지금 공고를 읽고, 다음 프로그램을 누구에게, 언제, 어디서 열지 제안합니다. 시간과 장소, 숫자는 코드가 계산하고 검사합니다.' },
  ending: { chip: '', say: '읽기, 연결, 편성. 아이가 자라는 동안 계속 도는, 오산의 AX 라이프케어입니다.' },
}
const SYLLABLES_PER_SECOND = 5.2
const sayMs = (text) => Math.round(((text.match(/[가-힣A-Za-z0-9]/g) ?? []).length / SYLLABLES_PER_SECOND + 0.6) * 1000)

// ---- 캔버스 배치 (world 좌표) ----
/** 보호자 휴대폰: 375×812 앱을 0.82배로 */
const PHONE = { x: 486, y: 27, k: 0.82, w: 375, h: 812 }
/** 기관 관리자 화면: 1600×866 앱을 0.75배로 (창 머리 26px 아래) */
const DESK = { x: 1720, y: 46, k: 0.75, w: 1600, h: 866 }
/** 포스터 무대(표지·문제·포스터 통번역·마무리): 보호자·기관 위쪽 */
const SHOW = { x: 800, y: -1700 }
const SLOT_PHONE = { x: 0, y: 0, w: 1280, h: 720 }
/** 확대했을 때 테두리 밖이 비치지 않게 할 범위 */
const PHONE_FRAME = { x: 0, y: 18, w: 1280, h: 684 }
const DESK_FRAME = { x: 1720, y: 20, w: 1200, h: 676 }
const SLOT_DESK = { x: 1700, y: 0, w: 1240, h: 716 }
const SLOT_SHOW = { x: SHOW.x, y: SHOW.y, w: 1280, h: 720 }
const OVERVIEW = { x: 400, y: -150, w: 2560, h: 950 }
const inShow = (r) => ({ x: SHOW.x + r.x, y: SHOW.y + r.y, w: r.w, h: r.h })
const toWorld = (box, r) => ({ x: box.x + r.x * box.k, y: box.y + r.y * box.k, w: r.w * box.k, h: r.h * box.k })

const STAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  :root { --cream: #FBF6EE; --ink: #3A2F2A; --ink2: #6B5E57; --green: #1F7A5C; --green-soft: #E3F0E8; --coral: #E07A5F; --coral-soft: #FCE6DC; --red: #C2410C; }
  body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Apple SD Gothic Neo', sans-serif; color: var(--ink);
    background: var(--cream) radial-gradient(circle at 1px 1px, rgba(58,47,42,.08) 1px, transparent 0) 0 0 / 22px 22px; }
  #world { position: absolute; left: 0; top: 0; width: 1px; height: 1px; transform-origin: 0 0; }
  .slot-label { position: absolute; text-align: center; font-size: 54px; font-weight: 800; color: var(--green); }
  .slot-label small { display: block; font-size: 32px; font-weight: 600; color: var(--ink2); margin-top: 4px; }
  #phone { position: absolute; left: 477px; top: 18px; padding: 9px; border-radius: 42px; background: #2B2320; box-shadow: 0 24px 60px rgba(58,47,42,.28); }
  #phone .screen { width: 307.5px; height: 665.84px; overflow: hidden; border-radius: 33px; background: #fff; }
  #phone iframe { width: 375px; height: 812px; border: 0; transform: scale(.82); transform-origin: 0 0; display: block; }
  #desk { position: absolute; left: 1720px; top: 20px; width: 1200px; height: 676px; border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 24px 60px rgba(58,47,42,.25); }
  #desk .bar { height: 26px; background: #EFE7DC; display: flex; align-items: center; gap: 7px; padding: 0 12px; font-size: 12px; color: var(--ink2); }
  #desk .bar i { width: 10px; height: 10px; border-radius: 50%; background: #D9CBBB; display: block; }
  #desk .bar span { margin-left: 8px; }
  #desk iframe { width: 1600px; height: 866px; border: 0; transform: scale(.75); transform-origin: 0 0; display: block; }
  #links { position: absolute; left: 0; top: 0; overflow: visible; opacity: 0; transition: opacity .4s; }
  #links.show { opacity: 1; }
  #links path { fill: none; stroke: #D8C8B8; stroke-width: 9; stroke-dasharray: 20 14; stroke-linecap: round; }
  #links path.on { stroke: var(--coral); animation: flow .9s linear infinite; }
  #links text { font-size: 54px; font-weight: 800; fill: #B9A796; text-anchor: middle; font-family: 'Apple SD Gothic Neo', sans-serif; }
  #links text.on { fill: var(--coral); }
  @keyframes flow { to { stroke-dashoffset: -34; } }
  #show { position: absolute; left: ${SHOW.x}px; top: ${SHOW.y}px; width: 1280px; height: 720px; transition: opacity .35s; }
  .pf { position: absolute; border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 18px 44px rgba(58,47,42,.22); transition: left 1s cubic-bezier(.55,0,.2,1), top 1s cubic-bezier(.55,0,.2,1), opacity .5s; }
  .pf img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
  .pf img.wipe { clip-path: inset(0 100% 0 0); }
  .pf img.wipe.go { clip-path: inset(0 0 0 0); }
  .sweep { position: absolute; top: 0; bottom: 0; left: 0; width: 6px; margin-left: -3px; background: #fff; box-shadow: 0 0 18px 7px rgba(255,255,255,.95); }
  .scan { position: absolute; left: 0; right: 0; height: 110px; top: -110px; background: linear-gradient(180deg, rgba(31,122,92,0), rgba(31,122,92,.22) 75%, rgba(31,122,92,.9)); }
  .scan.warm { background: linear-gradient(180deg, rgba(224,122,95,0), rgba(224,122,95,.22) 75%, rgba(224,122,95,.95)); }
  .ring { position: absolute; border: 3px solid var(--red); border-radius: 10px; box-shadow: 0 0 0 5px rgba(194,65,12,.14); transform: scale(1.25); opacity: 0; transition: transform .45s cubic-bezier(.3,1.5,.5,1), opacity .3s; }
  .ring.ok { border-color: var(--green); box-shadow: 0 0 0 5px rgba(31,122,92,.14); }
  .ring.on { transform: none; opacity: 1; }
  .ring b { position: absolute; left: -3px; top: calc(100% + 7px); white-space: nowrap; background: var(--red); color: #fff; font-size: 14px; font-weight: 800; padding: 4px 10px; border-radius: 999px; }
  .ring.ok b { background: var(--green); }
  .ring.up b { top: auto; bottom: calc(100% + 7px); }
  .steps { position: absolute; left: 0; right: 0; top: 26px; display: flex; justify-content: center; gap: 10px; }
  .steps span { padding: 8px 16px; border-radius: 999px; background: #fff; color: var(--ink2); font-size: 16px; font-weight: 700; box-shadow: 0 2px 10px rgba(58,47,42,.08); transition: background .3s, color .3s; }
  .steps span.now { background: var(--coral); color: #fff; }
  .steps span.done { background: var(--green-soft); color: var(--green); }
  .steps span.done::before { content: '✓ '; }
  .table-card { position: absolute; width: 340px; background: #fff; border-radius: 16px; padding: 14px 18px 8px; box-shadow: 0 14px 34px rgba(58,47,42,.16); opacity: 0; transform: translateY(10px); transition: opacity .4s, transform .4s; }
  .table-card.on { opacity: 1; transform: none; }
  .table-card h3 { font-size: 15px; color: var(--ink2); margin-bottom: 6px; }
  .table-card div { padding: 8px 0; border-top: 1px solid #F1E8DD; opacity: 0; transform: translateX(-8px); transition: opacity .3s, transform .3s; }
  .table-card div.on { opacity: 1; transform: none; }
  .table-card div span { display: block; font-size: 15px; color: var(--ink2); }
  .table-card div strong { display: block; font-size: 19px; color: var(--ink); }
  .table-card div em { font-style: normal; font-size: 13px; font-weight: 800; color: var(--green); margin-left: 6px; }
  .stamp { position: absolute; width: 124px; height: 124px; border-radius: 50%; border: 5px solid var(--green); color: var(--green); font-size: 30px; font-weight: 900; display: grid; place-items: center; background: rgba(255,255,255,.9); transform: rotate(-12deg) scale(1.7); opacity: 0; transition: transform .35s cubic-bezier(.3,1.6,.5,1), opacity .2s; }
  .stamp.on { transform: rotate(-12deg) scale(1); opacity: 1; }
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
  .node { position: absolute; width: 150px; height: 150px; margin: -75px 0 0 -75px; border-radius: 50%; background: #fff; box-shadow: 0 12px 30px rgba(58,47,42,.14); display: grid; place-content: center; text-align: center; }
  .node strong { font-size: 30px; font-weight: 900; color: var(--green); }
  .node span { font-size: 15px; color: var(--ink2); font-weight: 700; margin-top: 2px; }
  #chip { position: absolute; left: 28px; top: 24px; padding: 9px 18px; border-radius: 999px; background: rgba(255,255,255,.95); color: var(--green); font-size: 17px; font-weight: 800; box-shadow: 0 6px 20px rgba(58,47,42,.12); opacity: 0; transition: opacity .35s; z-index: 10; }
  #chip.on { opacity: 1; }
  #badges { position: absolute; right: 24px; bottom: 22px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; z-index: 10; }
  #badges span { padding: 6px 12px; border-radius: 999px; background: rgba(58,47,42,.8); color: #fff; font-size: 13px; font-weight: 600; }
  #tr { position: absolute; left: 28px; top: 74px; width: 236px; padding: 12px 16px; border-radius: 18px 18px 18px 4px; background: #fff; box-shadow: 0 10px 26px rgba(58,47,42,.16); font-size: 18px; line-height: 1.45; font-weight: 600; opacity: 0; transform: translateY(8px); transition: opacity .35s, transform .35s; z-index: 10; }
  #tr small { display: block; font-size: 13px; color: var(--coral); font-weight: 800; margin-bottom: 2px; }
  #tr.on { opacity: 1; transform: none; }
  body.prompter #badges { bottom: 132px; }
  #cursor { position: absolute; left: 640px; top: 760px; width: 30px; height: 30px; z-index: 20; transition: left .75s cubic-bezier(.45,0,.2,1), top .75s cubic-bezier(.45,0,.2,1), opacity .3s; opacity: 0; pointer-events: none; filter: drop-shadow(0 3px 5px rgba(0,0,0,.3)); }
  #cursor.on { opacity: 1; }
  #ripple { position: absolute; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(224,122,95,.5); z-index: 19; opacity: 0; pointer-events: none; }
  #ripple.go { animation: rip .55s ease-out; }
  @keyframes rip { 0% { opacity: .9; transform: scale(.3); } 100% { opacity: 0; transform: scale(1.4); } }
  #prompter { display: none; position: absolute; left: 0; right: 0; bottom: 0; height: 120px; padding: 14px 40px; background: rgba(28,22,19,.88); color: #fff; font-size: 23px; line-height: 1.45; z-index: 30; }
  body.prompter #prompter { display: block; }
</style></head><body>
  <div id="world">
    <div class="slot-label" style="left:0;top:-120px;width:1280px">보호자<small>베트남어 화면</small></div>
    <div id="phone"><div class="screen"><iframe id="app"></iframe></div></div>
    <div class="slot-label" style="left:1720px;top:-120px;width:1200px">기관 담당자<small>운영기관 화면</small></div>
    <div id="desk"><div class="bar"><i></i><i></i><i></i><span>오산 아이 프로그램 · 운영기관 화면</span></div><iframe id="deskapp"></iframe></div>
    <svg id="links" width="3000" height="800">
      <defs>
        <marker id="head-off" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#D8C8B8" stroke="none"/></marker>
        <marker id="head-on" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#E07A5F" stroke="none"/></marker>
      </defs>
      <path id="link1" d="M 860 210 C 1100 10, 1440 10, 1680 210" marker-end="url(#head-off)"/>
      <text id="link1t" x="1270" y="40">못 찾은 질문</text>
      <path id="link2" d="M 1680 520 C 1440 720, 1100 720, 860 520" marker-end="url(#head-off)"/>
      <text id="link2t" x="1270" y="745">덧붙인 안내</text>
    </svg>
    <div id="show"></div>
  </div>
  <div id="chip"></div>
  <div id="badges"></div>
  <div id="tr"></div>
  <div id="ripple"></div>
  <div id="cursor"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2 L3 19 L7.5 15 L10.5 22 L13.5 20.7 L10.6 14 L17 14 Z" fill="#fff" stroke="#2B2320" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
  <div id="prompter"></div>
<script>
  const world = document.getElementById('world')
  const $ = (id) => document.getElementById(id)
  const pause = (ms) => new Promise((done) => setTimeout(done, ms))
  window.cam = { s: 1, tx: 0, ty: 0 }
  /** 사각형 r(world 좌표)이 화면에 꽉 차게. 너무 크게 키우면 흐려지므로 max배까지 */
  window.camera = (r, ms, max, bounds) => {
    const s = Math.min(1280 / r.w, 720 / r.h, max || 2.3)
    let cx = r.x + r.w / 2, cy = r.y + r.h / 2
    // bounds(휴대폰·기관 화면 테두리) 밖의 빈 곳이 비치지 않게 중심을 안으로 당긴다
    if (bounds) {
      const vw = 1280 / s, vh = 720 / s
      if (vw < bounds.w) cx = Math.min(Math.max(cx, bounds.x + vw / 2), bounds.x + bounds.w - vw / 2)
      if (vh < bounds.h) cy = Math.min(Math.max(cy, bounds.y + vh / 2), bounds.y + bounds.h - vh / 2)
    }
    const tx = 640 - cx * s, ty = 360 - cy * s
    world.style.transition = ms ? 'transform ' + ms + 'ms cubic-bezier(.55,0,.2,1)' : 'none'
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
  window.setChip = (text) => { if (text) $('chip').textContent = text; $('chip').classList.toggle('on', !!text) }
  window.setBadges = (list) => { $('badges').replaceChildren(...list.map((text) => Object.assign(document.createElement('span'), { textContent: text }))) }
  window.setTr = (label, text) => {
    const el = $('tr')
    if (!text) { el.classList.remove('on'); return }
    el.replaceChildren(Object.assign(document.createElement('small'), { textContent: label }), text)
    el.classList.add('on')
  }
  window.setPrompter = (text) => { $('prompter').textContent = text }
  window.link = (n) => {
    $('links').classList.toggle('show', n > 0)
    for (const k of [1, 2]) {
      $('link' + k).classList.toggle('on', k === n); $('link' + k + 't').classList.toggle('on', k === n)
      $('link' + k).setAttribute('marker-end', k === n ? 'url(#head-on)' : 'url(#head-off)')
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
    const sweep = Object.assign(document.createElement('div'), { className: 'sweep' })
    sweep.style.transition = 'left ' + ms + 'ms cubic-bezier(.6,0,.3,1)'
    frame.append(img, sweep); void frame.offsetWidth
    requestAnimationFrame(() => { img.classList.add('go'); sweep.style.left = '100%' })
    setTimeout(() => { sweep.remove(); [...frame.querySelectorAll('img')].slice(0, -1).forEach((old) => old.remove()) }, ms + 80)
  }
  window.scan = (id, ms, warm) => {
    const frame = $(id), bar = Object.assign(document.createElement('div'), { className: warm ? 'scan warm' : 'scan' })
    bar.style.transition = 'top ' + ms + 'ms linear'
    frame.append(bar); void frame.offsetWidth
    requestAnimationFrame(() => { bar.style.top = frame.clientHeight + 'px' })
    setTimeout(() => bar.remove(), ms + 50)
  }
  window.ring = (id, r, ok, label, up) => {
    document.getElementById(id)?.remove()
    const el = Object.assign(document.createElement('div'), { id, className: 'ring' + (ok ? ' ok' : '') + (up ? ' up' : '') })
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' })
    if (label) el.append(Object.assign(document.createElement('b'), { textContent: label }))
    $('show').append(el); void el.offsetWidth
    requestAnimationFrame(() => el.classList.add('on'))
  }
  window.unring = (id) => document.getElementById(id)?.remove()
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
const chat = (text) => api('POST', '/agent/chat', { messages: [{ role: 'user', text }], locale: 'vi', program_id: PROGRAM })

/** 추가 안내·보호자 질문이 없는 처음 상태로 */
async function resetState() {
  const detail = JSON.parse(await api('GET', `/admin/programs/${PROGRAM}`))
  for (const addendum of detail.addenda) await api('DELETE', `/admin/programs/${PROGRAM}/addenda/${addendum.id}`)
  fs.rmSync(QUESTIONS_FILE, { force: true })
}

const fillBlanks = (draft, value) => draft.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, () => value)

/** 녹화 전에 받은 실제 결과를 저장해 두는 파일. 제출용과 녹음용 영상이 같은 답을 쓰고, 모델 호출 한도에 걸려도 다시 녹화할 수 있다 (FRESH=1이면 새로 받음) */
const PREFETCH_CACHE = path.resolve(__dirname, 'render/prefetch.json')

/** 녹화 중에 돌려줄 실제 결과: 상담 답 → 공고 보완 초안 → (추가 안내를 잠시 저장하고) 두 번째 상담 답 */
async function prefetch() {
  // render/는 gitignore라 새로 받은 저장소에는 없다. 실제 API를 부르기 전에 만들어 둬야 받은 답을 버리지 않는다
  fs.mkdirSync(path.dirname(PREFETCH_CACHE), { recursive: true })
  await resetState()
  if (process.env.FRESH !== '1' && fs.existsSync(PREFETCH_CACHE) && fs.existsSync(PLAN_FIXTURE)) {
    console.log('저장해 둔 실제 결과(render/prefetch.json, render/plan-result.json)를 씁니다.')
    return { ...JSON.parse(fs.readFileSync(PREFETCH_CACHE, 'utf8')), plan: fs.readFileSync(PLAN_FIXTURE, 'utf8') }
  }
  console.log('상담 API에서 실제 답을 받는 중…')
  const reply = await chat(QUESTION)
  // 대시보드가 보낼 질문 목록과 같게: 시연용 예시 + 영상에서 보호자가 알릴 질문 (같은 문장은 하나로)
  const questions = [...DEMO_QUESTIONS]
  for (const item of JSON.parse(reply).unanswered.filter((entry) => entry.program_id === PROGRAM)) {
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
  const items = chosen.map(({ item }) => ({ topic: item.topic, text: fillBlanks(item.draft, FILL[item.topic]), resolves_questions: item.questions, resolves_items: item.resolves_items, drafted_by_ai: true }))
  await api('POST', `/admin/programs/${PROGRAM}/addenda`, { author: REVIEWER, items })
  console.log('추가 안내가 있는 상태의 두 번째 상담 답을 받는 중…')
  const replyAgain = await chat(QUESTION_AGAIN)
  if (!JSON.parse(replyAgain).citations.some((citation) => citation.source === 'addendum')) console.warn('주의: 두 번째 답이 추가 안내를 인용하지 않았습니다.')
  await resetState()
  if (!fs.existsSync(PLAN_FIXTURE)) {
    console.log('편성 도우미에서 실제 편성안을 받는 중…')
    const plan = await api('POST', '/admin/planning/propose', { questions: PLAN_QUESTIONS })
    if (!JSON.parse(plan).passed) throw new Error('편성안이 코드 검사를 통과하지 못했습니다. 다시 실행하세요.')
    fs.writeFileSync(PLAN_FIXTURE, plan)
  }
  const fetched = { reply, replyAgain, improve, chosen: chosen.map(({ item, index }) => ({ index, value: FILL[item.topic] })) }
  fs.writeFileSync(PREFETCH_CACHE, JSON.stringify(fetched))
  return { ...fetched, plan: fs.readFileSync(PLAN_FIXTURE, 'utf8') }
}

// ---- 포스터 무대에 올릴 장면 ----

function openingHtml() {
  return `<div class="blob" style="left:620px;top:-60px;width:760px;height:760px"></div>
    <div class="fade" id="openText" style="position:absolute;left:90px;top:190px;width:560px">
      <p class="kicker">오산시 AX 라이프케어</p>
      <h1>오산 아이 프로그램</h1>
      <p class="lead">한국어 포스터에 갇힌<br>아이의 기회를 여는 AI 에이전트</p>
    </div>
    <div class="pf" id="op" style="left:760px;top:50px;width:438px;height:620px"><img src="${local('inbox/osan-fc-kpop-dance/poster.jpg')}"></div>`
}

/** 누리집 화면 캡처(583×923)를 높이 660에 맞춰 왼쪽에, 같은 센터의 한국어 포스터를 오른쪽에 */
const SITE = { x: 120, y: 30, w: 417, h: 660 }
const siteRect = (top, bottom) => ({ x: SITE.x - 6, y: SITE.y + SITE.h * (top / 923) - 6, w: SITE.w + 12, h: SITE.h * ((bottom - top) / 923) + 12 })
function problemHtml() {
  return `<div class="blob" style="left:-120px;top:380px;width:520px;height:520px"></div>
    <div class="pf" id="site" style="left:${SITE.x}px;top:${SITE.y}px;width:${SITE.w}px;height:${SITE.h}px"><img src="${asset('problem-translated-site.png')}"></div>
    <div class="pf" id="kpop" style="left:640px;top:60px;width:430px;height:608px;opacity:0;transform:rotate(2deg)"><img src="${local('inbox/osan-fc-kpop-dance/poster.jpg')}"></div>`
}

/** 포스터 통번역: 원본(왼쪽)과 결과(오른쪽) 액자 540×540 */
const PK = { x: 370, y: 90, w: 540, h: 540 }
const PR = { x: 650, y: 90, w: 540, h: 540 }
const posterPart = (frame, nx, ny, nw, nh) => ({ x: frame.x + frame.w * nx, y: frame.y + frame.h * ny, w: frame.w * nw, h: frame.h * nh })
function posterHtml(report) {
  const rows = ['일시', '2026.10.31.(토) 10:00~13:00', '모집인원', '200명']
    .map((ko) => report.table.find((row) => row.ko === ko)).filter(Boolean)
    .map((row) => `<div><span>${row.ko}</span><strong>${row.target}${/\d/.test(row.ko) ? '<em>숫자 대조 ✓</em>' : ''}</strong></div>`).join('')
  return `<div class="steps"><span data-k="read">원본 판독</span><span data-k="table">번역표</span><span data-k="edit">글만 편집</span><span data-k="verify">다른 AI가 검증</span><span data-k="qr">QR 확인</span></div>
    <div class="pf" id="pk" style="left:${PK.x}px;top:${PK.y}px;width:${PK.w}px;height:${PK.h}px"><img src="${local(`inbox/${PROGRAM}/poster.jpg`)}"></div>
    <div class="pf" id="pr" style="left:${PR.x}px;top:${PR.y}px;width:${PR.w}px;height:${PR.h}px;opacity:0"><img src="${local(`inbox/${PROGRAM}/poster.jpg`)}"></div>
    <div class="table-card" id="tc" style="left:930px;top:170px"><h3>문구별 번역표 · ${report.table.length}문구</h3>${rows}</div>
    <div class="stamp" id="stamp" style="left:1110px;top:70px">통과</div>`
}

function endingHtml() {
  const R = 175, C = 250
  const at = (deg) => ({ x: C + R * Math.cos((deg * Math.PI) / 180), y: C + R * Math.sin((deg * Math.PI) / 180) })
  const nodes = [['읽기', '포스터 통번역', -90], ['연결', '상담', 30], ['편성', '공고 보완·편성', 150]]
  return `<div class="blob" style="left:640px;top:40px;width:640px;height:640px"></div>
    <div class="fade" id="endText" style="position:absolute;left:90px;top:200px;width:560px">
      <p class="kicker">AX 라이프케어</p>
      <h1>읽기 · 연결 · 편성</h1>
      <p class="lead">아이가 자라는 동안<br>계속 도는 순환</p>
      <p class="team">오산 아이 프로그램 · 선우 · 채현 · 소영 · 준현</p>
    </div>
    <div class="cycle">
      <svg width="500" height="500" style="position:absolute;left:0;top:0;overflow:visible">
        <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#E9D9C8" stroke-width="10" stroke-dasharray="4 18" stroke-linecap="round"/>
        <g class="spin"><circle cx="${C}" cy="${C - R}" r="13" fill="#E07A5F"/><circle cx="${C}" cy="${C - R}" r="24" fill="#E07A5F" opacity=".25"/></g>
      </svg>
      ${nodes.map(([title, sub, deg]) => { const p = at(deg); return `<div class="node" style="left:${p.x}px;top:${p.y}px"><strong>${title}</strong><span>${sub}</span></div>` }).join('')}
    </div>`
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'))
  if (!report.injected_fault) console.warn('주의: 오류 주입 기록이 아닙니다. npm run poster -- osan-fc-sports-day --lang vi --force --demo-fault 로 다시 만드세요.')
  const { reply, replyAgain, improve, plan, chosen } = await prefetch()
  const a1 = report.attempts[0]
  const last = report.attempts[report.attempts.length - 1]

  fs.rmSync(WORK, { recursive: true, force: true })
  fs.mkdirSync(path.join(WORK, 'frames'), { recursive: true })
  fs.writeFileSync(path.join(WORK, 'stage.html'), STAGE)

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1280,807', '--force-device-scale-factor=1.5', '--allow-file-access-from-files'] })
  const context = await browser.newContext({ viewport: null })
  await context.addInitScript(() => {
    try {
      localStorage.setItem('osan-guardian-locale', 'vi')
      localStorage.setItem('osan-guardian-intro-seen', '1')
      localStorage.setItem('osan-dashboard-locale', 'ko-easy')
      localStorage.setItem('osan-dashboard-reviewer', '담당자(시연)')
    } catch { /* file:// 무대에는 저장소가 없다 */ }
  })
  // 녹화 중 상담 답·보완 초안: 방금 실제 API에서 받은 결과를 2.5초 뒤에 차례로 돌려준다
  const replies = [reply, replyAgain]
  await context.route(`${API}/agent/chat`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await wait(2500)
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': GUARDIAN }, body: replies.shift() ?? replyAgain })
  })
  await context.route(`${API}/admin/planning/propose`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await wait(2500)
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': DASHBOARD }, body: plan })
  })
  await context.route(`${API}/admin/programs/${PROGRAM}/improve`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await wait(2500)
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': DASHBOARD }, body: improve })
  })
  // 대시보드(Vite 개발 서버)를 녹화 전에 한 번 열어 모듈을 데워 둔다
  const warm = await context.newPage()
  await warm.goto(`${DASHBOARD}/#programs/${PROGRAM}`)
  await warm.waitForSelector('.review-grid', { timeout: 30_000 }).catch(() => {})
  await warm.close()

  const page = await context.newPage()
  await page.goto('file://' + path.join(WORK, 'stage.html'))
  const stage = (fn, arg) => page.evaluate(fn, arg)
  if (PROMPTER) await stage(() => document.body.classList.add('prompter'))
  // 보호자 휴대폰과 기관 화면은 처음부터 띄워 두고, 카메라가 그쪽으로 갈 때 보여 준다
  await stage(([app, desk]) => { document.getElementById('app').src = app; document.getElementById('deskapp').src = desk }, [`${GUARDIAN}/`, `${DASHBOARD}/#programs/${PROGRAM}`])
  const frameOf = async (origin, part = '') => {
    for (let i = 0; i < 100; i++) {
      const found = page.frames().find((frame) => frame.url().startsWith(origin) && frame.url().includes(part))
      if (found) return found
      await wait(100)
    }
    throw new Error(`화면을 찾지 못했습니다: ${origin} ${part}`)
  }
  let phone = await frameOf(GUARDIAN)
  let desk = await frameOf(DASHBOARD)
  await phone.waitForSelector('.fit-card', { timeout: 20_000 })
  await desk.waitForSelector('.review-grid .poster-img', { timeout: 20_000 }).catch(() => {})
  await stage((html) => window.show(html), openingHtml())
  await stage((r) => window.camera(r, 0, 3), inShow({ x: 760, y: 50, w: 438, h: 300 }))
  await wait(600)

  const frames = []
  const cdp = await context.newCDPSession(page)
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(WORK, 'frames', `f${String(frames.length).padStart(5, '0')}.jpg`)
    fs.writeFileSync(file, Buffer.from(data, 'base64'))
    frames.push({ file, t: metadata.timestamp })
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  const started = Date.now()
  const timings = []
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })

  // ---- 도구 ----
  const camera = (rect, ms = 1100, max, bounds) => stage(([r, m, x, b]) => window.camera(r, m, x, b), [rect, ms, max, bounds])
  const badges = (list) => stage((l) => window.setBadges(l), list)
  const tr = (label, text) => stage(([l, t]) => window.setTr(l, t), [label, text])
  /** 장면: 왼쪽 위 표시와 (녹음용이면) 대본을 바꾸고, 내레이션을 읽는 시간보다 짧게 끝나지 않게 한다 */
  async function scene(key, body) {
    const { chip, say } = SCENES[key]
    const t0 = Date.now()
    console.log(`${((t0 - started) / 1000).toFixed(1)}s ${key}`)
    await stage(([c, s]) => { window.setChip(c); window.setPrompter(s) }, [chip, PROMPTER ? say : ''])
    await body()
    const acted = Date.now() - t0
    if (sayMs(say) > acted) await wait(sayMs(say) - acted)
    timings.push({ key, seconds: (Date.now() - t0) / 1000, acted: acted / 1000, narration: sayMs(say) / 1000 })
  }
  /** 앱 안 요소의 사각형(그 앱의 CSS px) */
  const rectIn = (frame, selector) => frame.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const box = el.getBoundingClientRect()
    return { x: box.left, y: box.top, w: box.width, h: box.height }
  }, selector)
  /**
   * 요소가 (스크롤 상자 또는 문서) 위에서 offset px 아래에 오도록 부드럽게 스크롤하고, 스크롤이 끝났을 때의 사각형을 미리 계산해 돌려준다.
   * 카메라를 스크롤과 동시에 움직이기 위해서다
   */
  const scrollTo = (frame, selector, offset, container) => frame.evaluate(([sel, off, boxSel]) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const box = boxSel ? document.querySelector(boxSel) : null
    let shift
    if (box) {
      const b = box.getBoundingClientRect()
      const target = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, box.scrollTop + r.top - b.top - off))
      shift = target - box.scrollTop
      box.scrollTo({ top: target, behavior: 'smooth' })
    } else {
      const target = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, scrollY + r.top - off))
      shift = target - scrollY
      window.scrollTo({ top: target, behavior: 'smooth' })
    }
    return { x: r.left, y: r.top - shift, w: r.width, h: r.height }
  }, [selector, offset, container ?? null])
  /** 휴대폰 화면의 세로 구간 [top, top+height](앱 px)을 화면에 꽉 차게 */
  const focusPhone = (top, height, ms = 1000) => {
    const y0 = Math.max(0, Math.min(PHONE.h - height, top))
    return camera({ x: PHONE.x - 30, y: PHONE.y + y0 * PHONE.k, w: PHONE.w * PHONE.k + 60, h: height * PHONE.k }, ms, 2.4, PHONE_FRAME)
  }
  const focusDesk = (r, pad = 24, ms = 1100, max = 2.2) => camera(toWorld(DESK, { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }), ms, max, DESK_FRAME)
  /** 커서를 앱 안 요소로 옮겨 누른다 (click=false면 가리키고 물결만) */
  async function tap(frame, box, selector, { click = true, settle = 750 } = {}) {
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

  // 1. 표지: 한국어 포스터 → 베트남어로 밀려 바뀌고, 뒤로 물러나며 서비스 이름
  await scene('opening', async () => {
    await wait(900)
    await stage(([src]) => window.wipe('op', src, 1500), [local('translated/osan-fc-kpop-dance.vi.png')])
    await wait(1700)
    await camera(SLOT_SHOW, 1400)
    await wait(900)
    await stage(() => window.on('#openText'))
    await wait(1200)
  })

  // 2. 문제: 누리집은 영어로 번역되지만, 포스터는 한국어 그대로
  await scene('problem', async () => {
    await stage((html) => window.show(html), problemHtml())
    await camera(inShow(siteRect(0, 330)), 1100, 2.1)
    await wait(1200)
    await stage((r) => window.ring('r1', r, true, '메뉴·안내는 영어로'), siteRect(40, 300))
    await wait(2600)
    await camera(inShow(siteRect(320, 923)), 1200, 2.1)
    await wait(1100)
    await stage((r) => window.ring('r2', r, false, '포스터는 한국어 그대로', true), siteRect(325, 918))
    await wait(2700)
    await camera(SLOT_SHOW, 1200)
    await stage(() => window.place('kpop', { opacity: 1 }))
    await wait(2000)
  })

  // 3. 포스터 통번역 에이전트: 판독 → 번역표 → 글만 편집 → 다른 AI 검증(일부러 넣은 날짜 오류) → 2회차
  await scene('poster', async () => {
    await badges(['실제 실행 기록 · 시간을 줄여 보여 줌'])
    await stage((html) => window.show(html), posterHtml(report))
    await stage(() => window.step('read'))
    await stage(() => window.scan('pk', 1300))
    await wait(1400)
    await stage(() => window.step('table'))
    await stage(() => window.on('#tc'))
    for (let i = 1; i <= 4; i++) { await stage((n) => window.on(`#tc div:nth-of-type(${n})`), i); await wait(300) }
    await wait(700)
    await stage(() => window.step('edit'))
    await stage(() => { window.place('tc', { opacity: 0 }); window.place('pk', { left: '90px' }); window.place('pr', { opacity: 1 }) })
    await wait(800)
    await stage(([src]) => window.wipe('pr', src, 1300), [local(`translated/${a1.file}`)])
    await wait(1500)
    await stage(() => window.step('verify'))
    await stage(() => window.scan('pr', 1200, true))
    await wait(1200)
    await badges(['실제 실행 기록 · 시간을 줄여 보여 줌', `시연용 오류 주입: 1회차 지시에 ${report.injected_fault ?? '날짜 순서'}`])
    await camera(inShow(posterPart(PR, -0.02, 0.38, 0.8, 0.42)), 1100, 2.3)
    await wait(500)
    await stage((r) => window.ring('date', r, false, '✗ 날짜 순서가 바뀜 (10/31)'), posterPart(PR, 0.02, 0.565, 0.62, 0.062))
    await wait(2400)
    await stage(() => window.unring('date'))
    await stage(([src]) => window.wipe('pr', src, 1200), [local(`translated/${last.file}`)])
    await wait(1400)
    await stage(([r, label]) => window.ring('date', r, true, label), [posterPart(PR, 0.02, 0.533, 0.62, 0.062), `✓ ${last.n}회차: 31/10으로 고쳐 통과`])
    await wait(2000)
    await stage(() => { window.unring('date'); window.step('all') })
    await camera(SLOT_SHOW, 1100)
    await wait(600)
    await stage(() => window.on('#stamp'))
    await wait(900)
  })

  // 4. 기관 검수 화면: AI가 읽은 사실과 근거 · 번역 포스터 검증 기록을 원본과 나란히
  await scene('review', async () => {
    await badges([])
    await camera(SLOT_DESK, 1200)
    await wait(1300)
    const timeline = await rectIn(desk, '.timeline')
    await focusDesk({ x: timeline.x - 10, y: timeline.y - 60, w: timeline.w + 20, h: Math.min(timeline.h + 60, 400) }, 16, 1000)
    await wait(1900)
  })

  // 5. 보호자 화면: 아이 나이와 가능한 시간만 넣으면 맞는 공고만, 맞는 이유와 '기관에 확인할 점'과 함께
  await scene('guardian', async () => {
    await camera(SLOT_PHONE, 1200)
    await wait(700)
    await tap(phone, PHONE, '.fit-card', { settle: 600 })
    await phone.waitForSelector('dialog[open] .legend-link')
    await wait(300)
    await focusPhone(60, 560, 800)
    await tap(phone, PHONE, 'dialog[open] .legend-link', { settle: 500 })
    await wait(200)
    await phone.locator('dialog[open] .input--short').pressSequentially('8', { delay: 60 })
    const times = phone.locator('dialog[open] .time-row input[type=time]')
    await times.nth(0).fill('09:00')
    await times.nth(1).fill('14:00')
    await tap(phone, PHONE, 'dialog[open] .time-row .btn--secondary', { settle: 450 })
    await wait(300)
    await tap(phone, PHONE, 'dialog[open] .sheet-foot button[type=submit]', { settle: 500 })
    await phone.waitForSelector('.item-match', { timeout: 10_000 })
    await hideCursor()
    const card = await scrollTo(phone, `a.item[href="/programs/${PROGRAM}"]`, 150)
    await focusPhone(card.y - 150, Math.min(card.h + 170, 560), 900)
    await wait(1700)
    await tap(phone, PHONE, `a.item[href="/programs/${PROGRAM}"] .item-title`, { settle: 500 }).catch(() => tap(phone, PHONE, `a.item[href="/programs/${PROGRAM}"]`, { settle: 500 }))
    await phone.waitForSelector('.detail-title', { timeout: 10_000 })
    await hideCursor()
    await wait(200)
    const check = await scrollTo(phone, '.to-check', 12)
    await focusPhone(check.y - 10, 520, 900)
    await wait(1700)
  })

  // 6. 상담 에이전트
  await scene('consult', async () => {
    await phone.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
    await camera(SLOT_PHONE, 900)
    await wait(800)
    await tap(phone, PHONE, '.ai-entry', { settle: 600 })
    await wait(300)
    await phone.evaluate(() => document.activeElement?.blur())
    await wait(200)
    await focusPhone(470, 342, 800)
    await wait(400)
    await tap(phone, PHONE, '#chat-input', { click: false, settle: 400 })
    await tr('보호자의 질문 (한국어 번역)', QUESTION_KO)
    await phone.locator('#chat-input').pressSequentially(QUESTION, { delay: 18 })
    await wait(200)
    await phone.locator('#chat-input').press('Enter')
    await hideCursor()
    await badges(['응답 대기 줄임 (실제 10~25초)'])
    await camera(SLOT_PHONE, 900)
    await phone.waitForSelector('.bot-turn', { timeout: 30_000 })
    await wait(400)
    await tr('', '')
    const steps = await scrollTo(phone, '.agent-steps', 16, SHEET)
    await focusPhone(steps.y - 12, 470, 900)
    await wait(2700)
    const sources = await scrollTo(phone, '.chat-sources', 16, SHEET)
    await focusPhone(sources.y - 12, Math.min(sources.h + 40, 380), 900)
    await wait(2300)
    const inquiry = await scrollTo(phone, '.chat-inquiry', 16, SHEET)
    await focusPhone(inquiry.y - 12, Math.min(inquiry.h + 30, 480), 900)
    await wait(2500)
    const unanswered = await scrollTo(phone, '.chat-unanswered', 16, SHEET)
    await focusPhone(unanswered.y - 12, Math.min(unanswered.h + 40, 420), 900)
    await wait(700)
    await tap(phone, PHONE, '.chat-unanswered .btn', { settle: 600 })
    await phone.waitForSelector('.unanswered-sent', { timeout: 10_000 }).catch(() => {})
    await wait(900)
    await hideCursor()
    // 기관 화면을 보호자 질문 화면으로 새로 연다 (카메라가 휴대폰에 있는 동안)
    await stage((src) => { document.getElementById('deskapp').src = src }, `${DASHBOARD}/?v=questions#questions/${PROGRAM}`)
  })

  // 7. 공고 보완 에이전트: 보호자 → 기관으로 질문이 넘어가는 모습을 넓게 보여 준 뒤 기관 화면으로
  await scene('improve', async () => {
    await badges([])
    await stage(() => window.link(1))
    await camera(OVERVIEW, 1200)
    desk = await frameOf(DASHBOARD, 'questions')
    await desk.waitForSelector('.improve .btn--primary', { timeout: 20_000 })
    await wait(900)
    await camera(SLOT_DESK, 1100)
    await stage(() => window.link(0))
    await wait(300)
    await badges(['시연용 예시 질문 포함'])
    const list = await rectIn(desk, '.detail-pane')
    await focusDesk({ x: list.x, y: list.y, w: list.w, h: 560 }, 16, 1000)
    await wait(1300)
    const panel = await scrollTo(desk, '.improve', 90)
    await focusDesk({ x: panel.x, y: panel.y, w: panel.w, h: 300 }, 16, 900)
    await wait(600)
    await tap(desk, DESK, '.improve .btn--primary', { settle: 600 })
    await badges(['시연용 예시 질문 포함', '응답 대기 줄임 (실제 10~20초)'])
    await desk.waitForSelector('.draft', { timeout: 30_000 })
    await hideCursor()
    const steps = await scrollTo(desk, '.improve .agent-steps', 140)
    await focusDesk({ x: steps.x, y: steps.y - 20, w: Math.max(steps.w, 900), h: 400 }, 16, 900)
    await wait(1800)
    // 영상에서는 참가비·준비물 두 항목만 확정한다
    await desk.evaluate((keep) => document.querySelectorAll('.draft-include input').forEach((box, index) => { if (!keep.includes(index) && box.checked) box.click() }), chosen.map((entry) => entry.index))
    await badges(['시연용 예시 질문 포함', '빈칸에 넣는 값은 시연용'])
    for (const { index, value } of chosen) {
      const selector = `.draft-list > li:nth-child(${index + 1}) .blank input`
      const item = await scrollTo(desk, `.draft-list > li:nth-child(${index + 1})`, 120)
      await focusDesk({ x: item.x, y: item.y, w: item.w, h: Math.min(item.h, 430) }, 16, 900)
      await wait(800)
      await tap(desk, DESK, selector, { click: false, settle: 450 })
      await desk.locator(selector).first().pressSequentially(value, { delay: 55 })
      await wait(300)
    }
    const foot = await scrollTo(desk, '.improve-actions', 420)
    await focusDesk({ x: foot.x - 300, y: foot.y - 140, w: foot.w + 300, h: 260 }, 16, 900)
    await wait(800)
    await tap(desk, DESK, '.improve-actions .btn--primary', { settle: 600 })
    await desk.waitForSelector('.improve .notice--ok', { timeout: 10_000 }).catch(() => {})
    await hideCursor()
    const done = await scrollTo(desk, '.improve .notice--ok', 200)
    await focusDesk({ x: done.x, y: done.y - 20, w: done.w, h: Math.max(done.h + 40, 240) }, 16, 900)
    await wait(1300)
    // 보호자 휴대폰을 새 대화로 (카메라가 기관 화면에 있는 동안)
    await stage((src) => { document.getElementById('app').src = src }, `${GUARDIAN}/programs/${PROGRAM}?again=1`)
  })

  // 8. 다시 묻기: 기관 → 보호자로 안내가 돌아간다
  await scene('again', async () => {
    await badges([])
    await stage(() => window.link(2))
    await camera(OVERVIEW, 1100)
    phone = await frameOf(GUARDIAN, 'again')
    await phone.waitForSelector('.ai-entry', { timeout: 20_000 })
    await wait(300)
    await camera(SLOT_PHONE, 1000)
    await stage(() => window.link(0))
    await tap(phone, PHONE, '.ai-entry', { settle: 500 })
    await wait(200)
    await phone.evaluate(() => document.activeElement?.blur())
    await tr('다른 보호자의 질문 (한국어 번역)', QUESTION_AGAIN_KO)
    await focusPhone(470, 342, 700)
    await phone.locator('#chat-input').pressSequentially(QUESTION_AGAIN, { delay: 16 })
    await phone.locator('#chat-input').press('Enter')
    await hideCursor()
    await badges(['응답 대기 줄임'])
    await camera(SLOT_PHONE, 800)
    // 기관 화면을 AI 편성 제안으로 새로 연다 (카메라가 휴대폰에 있는 동안)
    await stage((src) => { document.getElementById('deskapp').src = src }, `${DASHBOARD}/?v=plan#plan`)
    await phone.waitForSelector('.bot-turn', { timeout: 30_000 })
    await wait(300)
    await tr('', '')
    const sources = await scrollTo(phone, '.chat-sources', 16, SHEET)
    await focusPhone(sources.y - 12, Math.min(sources.h + 40, 430), 900)
    await wait(2100)
  })

  // 9. 편성 에이전트: 보호자 익명 통계(시연은 가상 응답)·질문·지금 공고를 읽고, 편성 계산을 도구로 돌려 다음 프로그램 편성안
  await scene('plan', async () => {
    await badges(['통계는 시연용 가상 응답 400가정'])
    await stage(() => { document.getElementById('link1t').textContent = '익명 통계'; window.link(1) })
    await camera(SLOT_DESK, 1200)
    desk = await frameOf(DASHBOARD, 'plan')
    await desk.waitForSelector('.plan-agent .btn--primary', { timeout: 20_000 })
    await stage(() => window.link(0))
    const data = await rectIn(desk, '.plan-data')
    await focusDesk({ x: data.x, y: data.y, w: data.w, h: Math.min(data.h, 560) }, 16, 900)
    await wait(1500)
    const agentCard = await rectIn(desk, '.plan-agent')
    await focusDesk({ x: agentCard.x, y: agentCard.y, w: agentCard.w, h: 330 }, 16, 900)
    await wait(300)
    await tap(desk, DESK, '.plan-agent .btn--primary', { settle: 600 })
    await badges(['통계는 시연용 가상 응답 400가정', '응답 대기 줄임 (실제 20~30초)'])
    await desk.waitForSelector('.plan-card', { timeout: 30_000 })
    await hideCursor()
    const steps = await rectIn(desk, '.plan-agent .agent-steps')
    await focusDesk({ x: steps.x, y: steps.y - 10, w: steps.w, h: 420 }, 16, 900)
    await wait(1800)
    const metric = await scrollTo(desk, '.plan-card', 70)
    await focusDesk({ x: metric.x, y: metric.y, w: metric.w, h: 470 }, 16, 900)
    await wait(2200)
    const reasons = await scrollTo(desk, '.plan-reasons', 140)
    await focusDesk({ x: reasons.x - 20, y: reasons.y - 50, w: reasons.w + 40, h: Math.min(reasons.h + 70, 470) }, 16, 900)
    await wait(2200)
  })

  // 10. 마무리
  await scene('ending', async () => {
    await badges([])
    await stage((html) => window.show(html), endingHtml())
    await camera(SLOT_SHOW, 1400)
    await wait(1000)
    await stage(() => window.on('#endText'))
    await wait(2400)
  })
  console.log(`${((Date.now() - started) / 1000).toFixed(1)}s 끝`)

  await cdp.send('Page.stopScreencast')
  await browser.close()

  // 프레임 → 30fps mp4 (프레임마다 실제로 머문 시간만큼)
  const list = frames.map((frame, index) => {
    const next = frames[index + 1]
    const duration = next ? Math.max(0.001, next.t - frame.t) : 0.4
    return `file '${frame.file}'\nduration ${duration.toFixed(4)}`
  })
  list.push(`file '${frames[frames.length - 1].file}'`)
  fs.writeFileSync(path.join(WORK, 'frames.txt'), list.join('\n') + '\n')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(WORK, 'frames.txt'),
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-movflags', '+faststart', OUT], { stdio: 'inherit' })
  const seconds = frames[frames.length - 1].t - frames[0].t + 0.4
  fs.writeFileSync(path.join(WORK, 'timings.json'), JSON.stringify(timings, null, 2))
  console.log(timings.map(({ key, seconds: s, acted, narration }) => `${key.padEnd(15)} ${s.toFixed(1)}s (화면 ${acted.toFixed(1)}s · 내레이션 ${narration.toFixed(1)}s)`).join('\n'))
  console.log(`프레임 ${frames.length}개, 약 ${seconds.toFixed(1)}초 → ${OUT}`)
}

main().catch((error) => { console.error(error); process.exit(1) })
