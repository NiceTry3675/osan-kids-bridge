// 2분 시연영상 녹화 (headless Chrome 화면 기록 → ffmpeg로 mp4). 장면과 자막은 ../demo-script.md를 따른다.
// 먼저 API(8787)·보호자 웹(5173)·기관 대시보드(5174)를 띄우고, node prepare-assets.js를 실행해 둔다.
// node record-demo.js  → ../osan-kids-bridge-demo.mp4 (실제 포스터가 들어가므로 커밋하지 않음)
//
// 정직하게 줄인 것: 포스터 통번역 로그는 실제 실행 기록(translated/*.json)을 다시 보여 주며 시간을 줄였고,
// 상담 답 두 번과 공고 보완 초안은 녹화 직전에 실제 API로 받은 결과를 녹화 중에 2.5초 만에 돌려준다(실제 응답 10~25초). 자막에 밝힌다.
// 두 번째 상담 답은 영상에서 담당자가 덧붙일 것과 같은 추가 안내를 미리 저장해 받은 뒤 지운다(녹화는 추가 안내가 없는 상태에서 시작).
// API는 npm run demo로 새로 띄운 상태(관리자 API 켬)여야 한다.
const { chromium } = require('playwright-core')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const ASSETS = path.resolve(__dirname, '../assets')
const WORK = path.resolve(__dirname, 'render/video')
const OUT = path.resolve(__dirname, '../osan-kids-bridge-demo.mp4')
const API = 'http://127.0.0.1:8787'
const GUARDIAN = 'http://127.0.0.1:5173'
const DASHBOARD = 'http://127.0.0.1:5174'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROGRAM = 'osan-fc-sports-day'
const QUESTION = 'Con tôi 8 tuổi. Tôi và con đi được không? Có cần chuẩn bị gì không?'
const QUESTION_AGAIN = 'Hội thao có mất phí không? Cần mang gì?'
const REVIEWER = '담당자(시연)'
/** 영상에서 담당자가 빈칸에 넣는 값 (시연용 가정, 자막에 밝힌다) */
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
const asset = (name) => 'file://' + path.join(ASSETS, name)
const local = (file) => 'file://' + path.join(ROOT, 'apps/program-api/data/local/translated', file)

const STAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; background: #F3F4EF; color: #1D2A24; transition: background .5s; }
  body.dark { background: #12382B; color: #fff; }
  #brand { position: absolute; left: 56px; top: 34px; font-size: 15px; font-weight: 700; color: #1F7A5C; letter-spacing: .02em; }
  body.dark #brand { color: #A6D3BD; }
  #left { position: absolute; left: 56px; top: 78px; width: 560px; }
  #kicker { font-size: 18px; font-weight: 800; color: #1F7A5C; margin-bottom: 10px; min-height: 22px; }
  body.dark #kicker { color: #A6D3BD; }
  #title { font-size: 38px; line-height: 1.25; font-weight: 800; letter-spacing: -.02em; white-space: pre-line; }
  #body { margin-top: 18px; font-size: 20px; line-height: 1.6; color: #2c3a33; white-space: pre-line; }
  body.dark #body { color: #E4F2EC; }
  #log { margin-top: 18px; background: #1D2A24; color: #E4F2EC; border-radius: 16px; padding: 16px 20px; font-size: 15px; line-height: 1.6; min-height: 280px; display: none; }
  #log div { opacity: 0; transform: translateY(6px); transition: opacity .35s, transform .35s; }
  #log div.on { opacity: 1; transform: none; }
  #log .bad { color: #FFD84D; } #log .ok { color: #7EE0B0; } #log .dim { color: #A6D3BD; }
  #caption { position: absolute; left: 56px; bottom: 34px; width: 740px; background: rgba(18,56,43,.95); color: #fff; font-size: 21px; line-height: 1.5; padding: 14px 20px; border-radius: 14px; opacity: 0; transition: opacity .35s; }
  #caption.on { opacity: 1; }
  #caption small { display: block; font-size: 15px; color: #A6D3BD; margin-top: 2px; }
  #media { position: absolute; right: 56px; top: 70px; width: 560px; height: 600px; display: flex; gap: 18px; align-items: flex-start; justify-content: flex-end; }
  #media figure { position: relative; flex: none; }
  #media img { display: block; border-radius: 12px; box-shadow: 0 8px 26px rgba(0,0,0,.18); }
  #media figcaption { margin-top: 10px; font-size: 16px; font-weight: 700; color: #4a554f; text-align: center; }
  #zoom { position: absolute; left: 0; top: 330px; width: 558px; display: none; }
  #zoom img { width: 558px; border: 4px solid #B42318; border-radius: 10px; box-shadow: none; }
  #zoom.ok img { border-color: #1F9E6E; }
  #zoom p { font-size: 18px; font-weight: 800; color: #B42318; margin-bottom: 8px; }
  #zoom.ok p { color: #1F7A5C; }
  #phone { position: absolute; right: 120px; top: 30px; width: 316px; height: 666px; border-radius: 34px; background: #1D2A24; padding: 8px; box-shadow: 0 14px 40px rgba(0,0,0,.25); display: none; }
  #phone iframe { width: 375px; height: 812px; border: 0; border-radius: 26px; transform: scale(.8); transform-origin: 0 0; background: #fff; }
  #desk { position: absolute; left: 40px; top: 58px; width: 1200px; height: 540px; border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 14px 40px rgba(0,0,0,.22); display: none; }
  #desk iframe { width: 1600px; height: 720px; border: 0; transform: scale(.75); transform-origin: 0 0; }
  #desklabel { position: absolute; left: 40px; top: 20px; font-size: 18px; font-weight: 800; color: #1F7A5C; display: none; }
  body.desk #left, body.desk #brand { display: none; }
  body.desk #desk, body.desk #desklabel { display: block; }
  #cycle { display: none; margin-top: 34px; gap: 14px; }
  #cycle span { display: inline-block; padding: 14px 22px; border-radius: 16px; background: #1F4D3D; font-size: 24px; font-weight: 800; margin-right: 10px; }
</style></head><body>
  <div id="brand">오산 아이 프로그램 · 오산시 AX 라이프케어</div>
  <div id="left"><div id="kicker"></div><div id="title"></div><div id="body"></div><div id="log"></div><div id="cycle"><span>① 읽기</span><span>② 연결</span><span>③ 편성</span></div></div>
  <div id="media"></div>
  <div id="phone"><iframe id="app"></iframe></div>
  <div id="desklabel"></div>
  <div id="desk"><iframe id="deskapp"></iframe></div>
  <div id="caption"></div>
<script>
  window.scene = ({ dark = false, kicker = '', title = '', body = '', media = '', phone = null, log = false, cycle = false, desk = null }) => {
    document.body.classList.toggle('dark', dark)
    document.body.classList.toggle('desk', !!desk)
    document.getElementById('desklabel').textContent = desk ? kicker : ''
    if (desk && document.getElementById('deskapp').getAttribute('src') !== desk) document.getElementById('deskapp').setAttribute('src', desk)
    document.getElementById('kicker').textContent = kicker
    document.getElementById('title').textContent = title
    document.getElementById('body').textContent = body
    document.getElementById('media').innerHTML = media
    document.getElementById('log').style.display = log ? 'block' : 'none'
    if (!log) document.getElementById('log').innerHTML = ''
    document.getElementById('cycle').style.display = cycle ? 'block' : 'none'
    const box = document.getElementById('phone')
    box.style.display = phone ? 'block' : 'none'
    if (phone && document.getElementById('app').getAttribute('src') !== phone) document.getElementById('app').setAttribute('src', phone)
  }
  window.caption = (text, note) => {
    const el = document.getElementById('caption')
    if (!text) { el.classList.remove('on'); return }
    el.innerHTML = ''
    el.append(text)
    if (note) { const small = document.createElement('small'); small.textContent = note; el.append(small) }
    el.classList.add('on')
  }
  window.logLine = (text, tone = '') => {
    const div = document.createElement('div'); div.textContent = text; div.className = tone
    document.getElementById('log').append(div)
    requestAnimationFrame(() => requestAnimationFrame(() => div.classList.add('on')))
  }
  window.zoom = (src, label, ok) => { const el = document.getElementById('zoom'); if (!el) return; el.querySelector('img').src = src; el.querySelector('p').textContent = label; el.classList.toggle('ok', !!ok); el.style.display = 'block' }
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

/** 녹화 중에 돌려줄 실제 결과: 상담 답 → 공고 보완 초안 → (추가 안내를 잠시 저장하고) 두 번째 상담 답 */
async function prefetch() {
  await resetState()
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
  return { reply, replyAgain, improve, chosen: chosen.map(({ item, index }) => ({ index, value: FILL[item.topic] })) }
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'))
  if (!report.injected_fault) console.warn('주의: 오류 주입 기록이 아닙니다. npm run poster -- osan-fc-sports-day --lang vi --force --demo-fault 로 다시 만드세요.')
  const { reply, replyAgain, improve, chosen } = await prefetch()

  fs.rmSync(WORK, { recursive: true, force: true })
  fs.mkdirSync(path.join(WORK, 'frames'), { recursive: true })
  fs.writeFileSync(path.join(WORK, 'stage.html'), STAGE)

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1280,807', '--force-device-scale-factor=1.5'] })
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

  const frames = []
  const cdp = await context.newCDPSession(page)
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(WORK, 'frames', `f${String(frames.length).padStart(5, '0')}.jpg`)
    fs.writeFileSync(file, Buffer.from(data, 'base64'))
    frames.push({ file, t: metadata.timestamp })
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  const started = Date.now()
  const mark = (label) => console.log(`${((Date.now() - started) / 1000).toFixed(1)}s ${label}`)
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })

  const scene = (options) => page.evaluate((o) => window.scene(o), options)
  const caption = (text, note) => page.evaluate(([a, b]) => window.caption(a, b), [text, note])
  const log = (text, tone) => page.evaluate(([a, b]) => window.logLine(a, b), [text, tone])
  // 무대의 iframe은 축소(transform)되어 있어 좌표 클릭이 어긋나므로, 앱 안은 DOM click으로 누른다
  const press = (target, selector) => target.evaluate((sel) => document.querySelector(sel)?.click(), selector)
  const app = () => page.frames().find((frame) => frame.url().startsWith(GUARDIAN))
  const desk = () => page.frames().find((frame) => frame.url().startsWith(DASHBOARD))

  // 1. 표지 (0:00–0:05)
  mark('표지')
  await scene({ dark: true, kicker: '2분 시연', title: '한국어 포스터에 갇힌\n아이의 기회를\nAI 에이전트가 엽니다', body: '다문화가족 보호자를 위한 읽기 → 연결 → 편성', media: `<figure><img src="${asset('poster-sports-ko.jpg')}" style="width:300px"></figure><figure style="margin-top:120px"><img src="${asset('poster-sports-vi.jpg')}" style="width:300px"></figure>` })
  await caption('오산 아이 프로그램 · 오산시 사회문제 해결을 위한 AX 라이프케어')
  await wait(5000)

  // 2. 문제 (0:05–0:15)
  mark('문제')
  await scene({ kicker: '문제', title: '사이트는 번역돼도\n포스터는 한국어 그대로', body: '일정·대상·신청 QR이 모두 포스터 이미지 안에 있다.\n오산시가족센터 통번역지원사는 1명, 베트남어만.', media: `<figure><img src="${asset('problem-translated-site.png')}" style="width:250px"><figcaption>화면을 영어로 바꿔도</figcaption></figure><figure><img src="${asset('poster-kpop-ko.jpg')}" style="width:290px"><figcaption>포스터 속 정보는 한국어</figcaption></figure>` })
  await caption('보호자는 공고마다 포스터 속 한국어를 직접 읽어야 합니다.', '오산시가족센터 공고 화면(팀 캡처), 통번역 지원사 배치현황(2025.9.24)')
  await wait(9500)

  // 3. 포스터 통번역 에이전트 (0:15–0:38)
  mark('포스터')
  const a1 = report.attempts[0]
  const last = report.attempts[report.attempts.length - 1]
  await scene({
    kicker: '① 읽기 · 포스터 통번역 에이전트', title: '디자인은 그대로,\n글만 베트남어로', log: true,
    media: `<figure><img src="${asset('poster-sports-ko.jpg')}" style="width:270px"><figcaption>한국어 원본</figcaption></figure><figure id="result"><img id="resultImg" src="${local(a1.file)}" style="width:270px"><figcaption id="resultCap">1회차 결과</figcaption></figure><div id="zoom"><p></p><img></div>`,
  })
  await caption('원본 포스터를 입력으로, 문구별 번역표를 만들어 이미지 모델이 글만 바꿉니다.', '편집 gpt-image-2.5-sunburst · 검증 gemini-3.8-flash (생성과 검증에 다른 모델)')
  const steps = [
    ['① 원본 판독', 'dim'], [`② 번역표 ${report.table.length}문구 · 숫자·날짜·전화번호 코드 검사 ✓`, 'dim'],
    [`⚠ 시연용 오류 주입: 1회차 지시에 ${report.injected_fault ?? '없음'}`, 'bad'], ['③ 이미지 편집 1회차', ''], ['④ QR 원본 이식 → 다시 스캔 ✓ 같은 주소', 'ok'], ['⑤ 다른 AI가 처음부터 다시 읽고 대조', 'dim'],
  ]
  for (const [text, tone] of steps) { await log(text, tone); await wait(1100) }
  for (const issue of a1.issues) { await log(`✗ ${issue.message.length > 60 ? issue.message.slice(0, 60) + '…' : issue.message}`, 'bad'); await wait(1100) }
  await page.evaluate((src) => window.zoom(src, '1회차 확대: 날짜가 월/일(10/31)로 뒤집혔다 ✗', false), asset('crop-date-a1.png'))
  await caption('검증이 날짜 오류를 잡았습니다. 베트남어에서 10/31은 \'10일 31월\'로 읽힙니다.', '시연을 위해 1회차에 날짜를 일부러 바꿔 넣었습니다')
  await wait(3800)
  await log(`③ 이미지 편집 ${last.n}회차 (직전 결과 + 원본 + 지적 ${a1.issues.length}건)`, '')
  await wait(1100)
  await page.evaluate((src) => { document.getElementById('resultImg').src = src; document.getElementById('resultCap').textContent = '2회차 결과 · 통과' }, local(last.file))
  await page.evaluate((src) => window.zoom(src, '2회차 확대: 일/월(31/10)로 고쳐 통과 ✓', true), asset('crop-date-a2.png'))
  await log('⑤ 검증 ✓ 모든 검사 통과 → 게시 (담당자 확인 전)', 'ok')
  await caption('틀린 곳만 짚어 다시 만들고, 통과한 것만 보호자에게 보여 줍니다.', '실제 실행 기록을 시간을 줄여 다시 보여 줌 (한 번에 약 1분)')
  await wait(4500)

  // 4. 기관 검수 화면 (0:38–0:44)
  mark('검수 화면')
  await scene({ kicker: '기관 관리자 화면 · 공고 검수', desk: `${DASHBOARD}/#programs/${PROGRAM}` })
  await caption('담당자는 원본 · AI가 읽은 사실과 근거 · 번역 포스터의 검증 기록을 나란히 보고 승인합니다.', '근거로 확인되지 않은 사실은 노란 형광펜, 직접 대조했다고 표시해야 승인')
  let board = null
  for (let i = 0; i < 40 && !board; i++) { board = desk(); if (!board) await wait(100) }
  await board.waitForSelector('.review-grid .poster-img', { timeout: 20_000 }).catch(() => {})
  await wait(5500)

  // 5. 보호자 화면의 번역 포스터 (0:44–0:52)
  mark('보호자 포스터')
  await scene({ kicker: '보호자 화면 (베트남어)', title: '보호자는 자기 언어의\n포스터를 본다', body: '무엇을 원본과 대조했는지,\n담당자 확인 전인지까지 함께 보여 준다.', phone: `${GUARDIAN}/programs/${PROGRAM}` })
  await caption('보호자 웹: 운동회 공고 → 베트남어 포스터')
  await page.waitForFunction(() => document.getElementById('app').contentWindow !== null)
  await wait(1200)
  let frame = app()
  await frame.waitForSelector('.detail-title', { timeout: 20_000 })
  await wait(1000)
  await frame.evaluate(() => { const el = document.querySelector('.poster'); el && window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 10, behavior: 'smooth' }) })
  await wait(2000)
  await frame.waitForFunction(() => document.querySelector('.poster img')?.complete, null, { timeout: 15_000 }).catch(() => {})
  await caption('담당자 확인 전이면 형광펜으로 알리고, 한국어 원본으로 바꿔 볼 수 있습니다.')
  await wait(3800)

  // 6. 상담 에이전트 (0:52–1:18)
  mark('상담')
  await scene({ kicker: '② 연결 · 상담 에이전트', title: '답은 공고에서만,\n모르면 물어볼\n한국어 문장까지', body: '도구: 공고 읽기 · 아이 조건 비교 ·\n문의문 작성 · 미해결 질문 표시', phone: `${GUARDIAN}/programs/${PROGRAM}` })
  await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  await wait(1000)
  await caption('\'AI에게 물어보기\'를 눌러 베트남어로 묻습니다.', '"아이가 8살이에요. 저와 아이가 갈 수 있나요? 준비물이 있나요?"')
  await press(frame, '.ai-entry')
  await wait(1000)
  await frame.locator('#chat-input').pressSequentially(QUESTION, { delay: 24 })
  await wait(400)
  await frame.locator('#chat-input').press('Enter')
  await caption('에이전트가 공고를 읽고, 아이 조건과 비교합니다.', '실제 응답은 10~25초, 영상에서는 줄였습니다')
  await frame.waitForSelector('.bot-turn', { timeout: 30_000 })
  await wait(700)
  const scrollChat = (target, selector, offset) => target.evaluate(([sel, off]) => {
    const body = document.querySelector('dialog[open] .sheet-body')
    const el = document.querySelector(sel)
    if (body && el) body.scrollTo({ top: el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - off, behavior: 'smooth' })
  }, [selector, offset])
  await scrollChat(frame, '.agent-steps', 20)
  await caption('확인한 과정과 답을 보여 주고, 공고에 없는 것은 없다고 말합니다.', '자격은 단정하지 않고 \'기관 확인 필요\'로 나눠 말합니다')
  await wait(4800)
  await scrollChat(frame, '.chat-sources', 20)
  await caption('답의 근거가 된 원문 문장을 붙입니다. 이 인용은 코드가 원문에서 다시 확인합니다.')
  await wait(3800)
  await scrollChat(frame, '.chat-inquiry', 10)
  await caption('준비물·참가비처럼 공고에 없는 건 기관에 보낼 한국어 문장으로 만듭니다.', '연락처는 공고에서 확인된 것만 안내합니다')
  await wait(4300)
  await scrollChat(frame, '.chat-unanswered', 10)
  await wait(1000)
  await press(frame, '.chat-unanswered .btn')
  await frame.waitForSelector('.unanswered-sent', { timeout: 10_000 }).catch(() => {})
  await caption('보호자가 누를 때만, 이름 없이 이 질문을 기관에 알립니다.')
  await wait(3500)

  // 7. 공고 보완 에이전트 (1:18–1:41)
  mark('공고 보완')
  await scene({ kicker: '③ 편성 · 공고 보완 에이전트 (기관 관리자 화면)', desk: `${DASHBOARD}/#questions/${PROGRAM}` })
  await caption('보호자들이 공고에서 답을 못 찾은 질문이 기관 화면에 모입니다.', '방금 보호자가 알린 질문(●)과 시연용 예시 질문')
  for (let i = 0; i < 40; i++) { board = desk(); if (board?.url().includes('#questions')) break; await wait(100) }
  await board.waitForSelector('.improve .btn--primary', { timeout: 20_000 })
  await wait(2800)
  await press(board, '.improve .btn--primary')
  await caption('공고 보완 에이전트가 공고와 질문을 도구로 읽고, 공고에 덧붙일 안내 초안을 씁니다.', '실제 응답은 10~20초, 영상에서는 줄였습니다')
  await board.waitForSelector('.draft', { timeout: 30_000 })
  await board.evaluate(() => { const el = document.querySelector('.agent-steps'); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' }) })
  await wait(800)
  await caption('기관만 아는 답은 빈칸으로 남깁니다. 빈칸 밖의 \'무료·가능해요\' 같은 단정은 코드가 막습니다.', '숫자·날짜·수량은 공고 원문과 대조 · 검사에 걸리면 고쳐 쓰고, 통과해야 제출')
  await wait(4800)
  // 영상에서는 참가비·준비물 두 항목만 확정한다
  await board.evaluate((keep) => document.querySelectorAll('.draft-include input').forEach((box, index) => { if (!keep.includes(index) && box.checked) box.click() }), chosen.map((entry) => entry.index))
  await caption('담당자가 빈칸을 채워 확정합니다.', '입력값은 시연용 가정입니다')
  for (const { index, value } of chosen) {
    const input = board.locator(`.draft-list > li:nth-child(${index + 1}) .blank input`).first()
    await input.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 240, behavior: 'smooth' }))
    await wait(700)
    await input.pressSequentially(value, { delay: 70 })
    await wait(500)
  }
  await board.evaluate(() => { const el = document.querySelector('.improve-foot'); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 360, behavior: 'smooth' }) })
  await wait(1200)
  await press(board, '.improve-actions .btn--primary')
  await board.waitForSelector('.improve .notice--ok', { timeout: 10_000 }).catch(() => {})
  await board.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  await caption('확정한 안내는 담당자 이름과 함께 바로 게시되고, 답한 질문에 표시가 붙습니다.')
  await wait(3500)

  // 8. 다시 묻기 (1:41–1:51)
  mark('다시 묻기')
  await scene({ kicker: '순환이 닫힌다', title: '같은 질문에 이제\n기관 안내로 답한다', body: '공고 → 질문 → 공고 보완 → 상담', phone: `${GUARDIAN}/programs/${PROGRAM}?again=1` })
  await caption('다른 보호자가 참가비와 준비물을 묻습니다.', '"운동회 참가비가 있나요? 무엇을 가져가요?"')
  for (let i = 0; i < 40; i++) { frame = app(); if (frame?.url().includes('again')) break; await wait(100) }
  await frame.waitForSelector('.ai-entry', { timeout: 20_000 })
  await press(frame, '.ai-entry')
  await wait(800)
  await frame.locator('#chat-input').pressSequentially(QUESTION_AGAIN, { delay: 24 })
  await frame.locator('#chat-input').press('Enter')
  await frame.waitForSelector('.bot-turn', { timeout: 30_000 })
  await wait(600)
  await scrollChat(frame, '.bot-turn', 10)
  await wait(1800)
  await scrollChat(frame, '.chat-sources', 20)
  await caption('기관이 덧붙인 안내를 근거로 답하고, 원문이 아니라 기관 안내라고 밝힙니다.')
  await wait(4000)

  // 9. 마무리 (1:51–1:57)
  mark('마무리')
  await scene({ dark: true, kicker: 'AX 라이프케어', title: '읽기 · 연결 · 편성\n아이가 자라는 동안\n계속 도는 순환', cycle: true, media: `<figure style="margin-top:40px"><img src="${asset('poster-kpop-vi.jpg')}" style="width:250px"></figure><figure style="margin-top:110px"><img src="${asset('poster-hs-vi.jpg')}" style="width:250px"></figure>` })
  await caption('오산 아이 프로그램 · 선우 · 채현 · 소영 · 준현')
  await wait(6000)
  mark('끝')

  await cdp.send('Page.stopScreencast')
  await browser.close()

  // 프레임 → 30fps mp4 (프레임마다 실제로 머문 시간만큼)
  const list = frames.map((frame, index) => {
    const next = frames[index + 1]
    const duration = next ? Math.max(0.001, next.t - frame.t) : 1
    return `file '${frame.file}'\nduration ${duration.toFixed(4)}`
  })
  list.push(`file '${frames[frames.length - 1].file}'`)
  fs.writeFileSync(path.join(WORK, 'frames.txt'), list.join('\n') + '\n')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(WORK, 'frames.txt'),
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', OUT], { stdio: 'inherit' })
  const seconds = frames[frames.length - 1].t - frames[0].t + 1
  console.log(`프레임 ${frames.length}개, 약 ${seconds.toFixed(1)}초 → ${OUT}`)
}

main().catch((error) => { console.error(error); process.exit(1) })
