// 발표 자료용 화면 캡처 (headless Chrome). 먼저 API(8787)·보호자 웹(5173)·기관 대시보드(5174)를 띄운다.
// node capture.js [all|home|detail|chat|journey|dashboard|plan|loop] [언어...]  (dashboard·plan·loop는 관리자 API가 켜진 npm run demo에서)
//   journey·chat 뒤에 언어(ko-easy|vi|zh)를 주면 그 언어만 찍는다. 기본: journey는 세 언어, chat은 베트남어·중국어
//   loop: 질문 하나가 공고를 바꾸기까지(12번). 베트남어 보호자가 알린 질문에 담당자가 빈칸을 채워 덧붙이고, 중국어 보호자가 그 안내와 그 안내를 인용한 답을 본다. 끝나면(실패해도) 덧붙인 안내·알린 질문을 지운다
//         record-demo.js가 받아 둔 render/prefetch.json이 있어야 한다. all에서는 맨 끝에 찍고, 그 파일이 없으면 알리고 건너뛴다(앞의 캡처는 그대로 남는다)
//   record-demo.js와 같은 시연 서버 상태(덧붙인 안내·알린 질문)를 바꾸므로 녹화 중에는 실행하지 않는다
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.resolve(__dirname, '../assets')
const API = 'http://127.0.0.1:8787'
const GUARDIAN = 'http://127.0.0.1:5173'
const DASHBOARD = 'http://127.0.0.1:5174'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MODES = ['all', 'home', 'detail', 'chat', 'journey', 'dashboard', 'plan', 'loop']
const which = process.argv[2] ?? 'all'
if (!MODES.includes(which)) throw new Error(`모르는 캡처: ${which} (${MODES.join('|')})`)
const LOCALES = ['ko-easy', 'vi', 'zh']
const chosenLocales = (fallback) => {
  const asked = process.argv.slice(3)
  const bad = asked.filter((locale) => !LOCALES.includes(locale))
  if (bad.length) throw new Error(`모르는 언어: ${bad.join(', ')} (ko-easy|vi|zh)`)
  return asked.length ? asked : fallback
}
/** 편성 도우미의 실제 결과를 한 번 받아 두는 파일. 발표자료 캡처와 시연영상이 같은 편성안을 쓴다(지우면 다시 받음) */
const PLAN_FIXTURE = path.resolve(__dirname, 'render/plan-result.json')
/** 캡처 속 요소의 자리(그림 크기에 대한 비율). build-deck.js가 그 위에 강조 테두리를 그린다 */
const MARKS = path.join(OUT, 'marks.json')
function saveMark(image, box) {
  let marks = {}
  try { marks = JSON.parse(fs.readFileSync(MARKS, 'utf8')) } catch { /* 처음 */ }
  marks[image] = Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 10000) / 10000]))
  fs.writeFileSync(MARKS, JSON.stringify(marks, null, 2))
}
/** record-demo.js가 녹화 전에 받아 둔 실제 결과(상담 답·공고 보완 초안·담당자가 채운 값). loop는 영상과 같은 보완 초안을 쓴다 */
const PREFETCH_CACHE = path.resolve(__dirname, 'render/prefetch.json')
const PROGRAM = 'osan-fc-sports-day'
const REVIEWER = '담당자(시연)'
/** 보호자가 '기관에 알리기'를 누르면 쌓이는 질문 (record-demo.js의 resetState와 같은 파일) */
const QUESTIONS_FILE = path.join(ROOT, 'apps/program-api/data/local/demo-session/questions/questions.jsonl')
/** 상담 캡처의 질문: 같은 뜻을 언어마다 (한국어: 아이가 8살이에요. 저와 아이가 갈 수 있나요? 준비물이 있나요?) */
const CHAT_QUESTION = {
  vi: 'Con tôi 8 tuổi. Tôi và con đi được không? Có cần chuẩn bị gì không?',
  zh: '我的孩子8岁。我和孩子可以去吗？需要准备什么吗？',
}
/** loop의 두 번째 질문 (한국어: 운동회 참가비가 있나요? 무엇을 가져가요?) — 영상의 베트남어 질문과 같은 뜻 */
const LOOP_QUESTION_ZH = '运动会要交参加费吗？需要带什么？'

async function api(method, route, body) {
  const response = await fetch(`${API}${route}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  if (!response.ok) throw new Error(`${method} ${route} 실패 ${response.status}: ${await response.text()}`)
  return response.text()
}
/** 이 공고에 덧붙인 안내를 모두 지운다 (record-demo.js resetState와 같은 방법) */
async function removeAddenda() {
  const detail = JSON.parse(await api('GET', `/admin/programs/${PROGRAM}`))
  for (const addendum of detail.addenda) await api('DELETE', `/admin/programs/${PROGRAM}/addenda/${addendum.id}`)
}

/** 홈의 '내 언어로 바꾼 포스터' 썸네일이 다 그려질 때까지 (포스터 PNG가 커서 늦게 뜬다) */
const posterThumbsReady = async (page) => {
  await page.waitForFunction(() => [...document.querySelectorAll('.home-poster img')].every((image) => image.complete && image.naturalWidth > 0))
  await page.evaluate(() => Promise.all([...document.querySelectorAll('.home-poster img')].map((image) => image.decode().catch(() => {}))))
  await page.waitForTimeout(300)
}

async function phone(browser, locale, { intro = false } = {}) {
  // 터치 기기로 띄워 마우스가 머문 자리의 hover 밑줄이 캡처에 남지 않게 한다
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true })
  await context.addInitScript(([value, showIntro]) => {
    localStorage.setItem('osan-guardian-locale', value)
    if (!showIntro) localStorage.setItem('osan-guardian-intro-seen', '1')
    localStorage.setItem('osan-dashboard-locale', 'ko-easy')
  }, [locale, intro])
  return context.newPage()
}

/** 보호자 여정: 조건 넣기(만 8세, 토요일 09:00~14:00) → 맞는 공고 목록 → 운동회 상세 첫 화면(포스터 썸네일·맞는 조건). 언어별로 같은 화면 */
async function journey(browser, locale) {
  const tag = locale === 'ko-easy' ? 'ko' : locale
  const intro = await phone(browser, locale, { intro: true })
  await intro.goto(GUARDIAN + '/')
  await intro.waitForTimeout(800)
  await intro.screenshot({ path: path.join(OUT, `app-${tag}-intro.png`) })
  await intro.context().close()
  const page = await phone(browser, locale)
  await page.goto(GUARDIAN + '/')
  await page.waitForSelector('.fit-card')
  await posterThumbsReady(page)
  await page.screenshot({ path: path.join(OUT, `app-${tag}-home.png`) })
  await page.click('.fit-card')
  await page.waitForSelector('dialog[open] .legend-link')
  await page.click('dialog[open] .legend-link')
  await page.fill('dialog[open] .input--short', '8')
  const times = page.locator('dialog[open] .time-row input[type=time]')
  await times.nth(0).fill('09:00')
  await times.nth(1).fill('14:00')
  // '추가'를 누르면 시간 칸이 비므로, 넣은 값이 보일 때 찍고 나서 추가한다
  await page.evaluate(() => { const body = document.querySelector('dialog[open] .sheet-body'); const row = document.querySelector('dialog[open] .time-row'); if (body && row) body.scrollTop = row.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 260 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, `app-${tag}-condition.png`) })
  await page.click('dialog[open] .time-row .btn--secondary')
  await page.waitForTimeout(300)
  await page.click('dialog[open] .sheet-foot button[type=submit]')
  await page.waitForSelector('.item-match')
  await page.waitForTimeout(400)
  // 목록 첫 화면: 운동회 카드(번역 포스터 썸네일, ✓ 맞는 이유)가 조건 칩 바로 아래 오게
  const toCard = (offset) => page.evaluate((off) => { const card = document.querySelector('a.item[href="/programs/osan-fc-sports-day"]'); if (card) window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - off) }, offset)
  await toCard(230)
  await page.waitForFunction(() => [...document.querySelectorAll('.item-poster img')].every((image) => image.complete))
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `app-${tag}-results-top.png`) })
  await toCard(12)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `app-${tag}-results.png`) })
  await page.click('a.item[href="/programs/osan-fc-sports-day"]')
  await page.waitForSelector('.detail-title')
  // 상세 첫 화면: 머리글(포스터 썸네일) 바로 아래에 '우리 아이 조건과 비교'(.compare)가 온다
  await page.waitForSelector('.compare')
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-thumb img')].every((image) => image.complete))
  await page.evaluate(() => window.scrollTo(0, 0))
  // 비용 줄(공고 정보의 넷째 줄)이 아래 고정 버튼 줄(.action-bar)에 가리면 가린 만큼만 올린다 (중국어는 글꼴이 커서 걸린다)
  await page.evaluate(() => {
    const cost = document.querySelectorAll('.facts .fact-row')[3]
    const bar = document.querySelector('.action-bar')
    const hidden = cost && bar ? cost.getBoundingClientRect().bottom - bar.getBoundingClientRect().top + 8 : 0
    if (hidden > 0) window.scrollBy(0, hidden)
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `app-${tag}-detail.png`) })
  await page.context().close()
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  try {
    if (which === 'all' || which === 'home') {
      const page = await phone(browser, 'vi')
      await page.goto(GUARDIAN + '/')
      await page.waitForSelector('.ai-entry')
      await posterThumbsReady(page)
      await page.screenshot({ path: path.join(OUT, 'app-home-vi.png') })
    }
    if (which === 'all' || which === 'detail') {
      const page = await phone(browser, 'vi')
      await page.goto(GUARDIAN + '/programs/osan-fc-sports-day')
      await page.waitForSelector('.detail-title')
      await page.screenshot({ path: path.join(OUT, 'app-detail-top-vi.png') })
      await page.waitForSelector('.poster img')
      await page.evaluate(() => { const el = document.querySelector('.poster'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8) })
      await page.waitForFunction(() => document.querySelector('.poster img')?.complete)
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT, 'app-poster-vi.png') })
    }
    if (which === 'all' || which === 'chat') {
      for (const locale of chosenLocales(['vi', 'zh'])) {
        if (!CHAT_QUESTION[locale]) throw new Error(`상담 캡처 질문이 없는 언어: ${locale}`)
        const page = await phone(browser, locale)
        await page.goto(GUARDIAN + `/programs/${PROGRAM}`)
        await page.click('.ai-entry')
        await page.fill('#chat-input', CHAT_QUESTION[locale])
        await page.keyboard.press('Enter')
        await page.waitForSelector('.bot-turn', { timeout: 90_000 })
        await page.waitForTimeout(600)
        const shoot = sheetShooter(page)
        await shoot('.bubble--user', `app-chat-answer-${locale}.png`, 120)
        if (await page.$('.chat-inquiry')) await shoot('.chat-inquiry', `app-chat-inquiry-${locale}.png`, 60)
        else console.warn(`${locale}: 답에 문의문이 없어 app-chat-inquiry-${locale}.png를 찍지 않았습니다.`)
        // '기관에 알리기'는 누르지 않는다(시연 상태를 바꾸지 않게). 알리는 장면은 loop가 찍고 되돌린다
        await page.context().close()
      }
    }
    if (which === 'all' || which === 'journey') {
      for (const locale of chosenLocales(LOCALES)) await journey(browser, locale)
    }
    if (which === 'all' || which === 'plan') {
      // AI 편성 제안: 실제 편성 도우미를 부른다(20~30초). 위(통계·도우미)와 아래(편성안 카드·근거)를 따로 찍는다
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
      await context.addInitScript(() => {
        localStorage.setItem('osan-dashboard-locale', 'ko-easy')
        localStorage.setItem('osan-dashboard-reviewer', '담당자(시연)')
      })
      const page = await context.newPage()
      if (fs.existsSync(PLAN_FIXTURE)) {
        await page.route('**/admin/planning/propose', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': DASHBOARD }, body: fs.readFileSync(PLAN_FIXTURE, 'utf8') }))
      } else {
        // render/는 gitignore라 새로 받은 저장소에는 없다. 응답 처리기 안에서 저장이 실패하면 캡처 전체가 멈추므로 폴더를 먼저 만들고 실패는 알리기만 한다
        fs.mkdirSync(path.dirname(PLAN_FIXTURE), { recursive: true })
        page.on('response', async (response) => {
          if (!response.url().endsWith('/admin/planning/propose') || !response.ok()) return
          try {
            const body = await response.text()
            const plan = JSON.parse(body)
            // 덱과 영상이 이 파일을 다시 쓰므로, 코드 검사를 통과한 편성안만 남긴다 (record-demo.js도 같은 기준)
            if (plan.passed && plan.proposals?.length) fs.writeFileSync(PLAN_FIXTURE, body)
            else console.warn('편성안이 코드 검사를 통과하지 못해 저장하지 않았습니다. 다시 실행하세요.')
          } catch (error) { console.warn('편성안을 저장하지 못했습니다:', error) }
        })
      }
      await page.goto(DASHBOARD + '/#plan')
      await page.waitForSelector('.plan-agent .btn--primary')
      await page.screenshot({ path: path.join(OUT, 'dash-plan-start.png') })
      await page.click('.plan-agent .btn--primary')
      await page.waitForSelector('.plan-card', { timeout: 180_000 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT, 'dash-plan.png') })
      await page.setViewportSize({ width: 1440, height: 1300 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT, 'dash-plan-full.png') })
      await context.close()
    }
    if (which === 'all' || which === 'dashboard') {
      // 관리자 화면은 데스크톱(1440×900) 기준. 승인·보완이 남지 않은 처음 상태에서 찍는다(API를 새로 켜면 처음 상태)
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
      await context.addInitScript(() => {
        localStorage.setItem('osan-dashboard-locale', 'ko-easy')
        localStorage.setItem('osan-dashboard-reviewer', '담당자(시연)')
      })
      const page = await context.newPage()
      await page.goto(DASHBOARD + '/#programs')
      await page.waitForSelector('.table tbody tr')
      await page.screenshot({ path: path.join(OUT, 'dash-programs.png') })
      await page.goto(DASHBOARD + '/#programs/osan-fc-sports-day')
      await page.waitForSelector('.review-grid .poster-img')
      await page.waitForFunction(() => [...document.querySelectorAll('.poster-img')].every((image) => image.complete && image.naturalWidth > 0))
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT, 'dash-review.png') })
      // 공고 보완 도우미: 실제 에이전트를 부른다(10~20초). 빈칸은 채우지 않은 채로 찍어 'AI가 값을 정하지 않는다'를 보인다
      await page.setViewportSize({ width: 1440, height: 1140 })
      await page.goto(DASHBOARD + '/#questions/osan-fc-sports-day')
      await page.waitForSelector('.improve .btn--primary')
      await page.click('.improve .btn--primary')
      await page.waitForSelector('.draft', { timeout: 120_000 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT, 'dash-improve.png') })
      await page.evaluate(() => { const el = document.querySelector('.improve'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16) })
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT, 'dash-improve-drafts.png') })
    }
    // loop는 맨 끝에. record-demo.js의 render/prefetch.json이 없으면 all은 앞의 캡처를 남기고 건너뛴다(loop만 부르면 멈춘다)
    if (which === 'loop') await loop(browser)
    else if (which === 'all') {
      if (fs.existsSync(PREFETCH_CACHE)) await loop(browser)
      else console.warn('loop를 건너뜁니다: render/prefetch.json이 없습니다. node record-demo.js를 한 번 실행한 뒤 node capture.js loop로 1·12번 그림을 찍으세요.')
    }
  } finally {
    await browser.close()
  }
}

/** 시트(상담 창) 안에서 selector가 위에서 offset만큼 떨어지게 스크롤하고 찍는다 */
const sheetShooter = (page) => async (selector, file, offset = 12) => {
  await page.evaluate(([sel, off]) => {
    const body = document.querySelector('dialog[open] .sheet-body')
    const el = document.querySelector(sel)
    body.scrollTop = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - off
  }, [selector, offset])
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, file) })
}

/**
 * 12번 '질문 하나가 공고를 바꾸기까지': 같은 질문 하나가 한 바퀴 도는 화면 셋.
 * ① 베트남어 보호자: 영상과 같은 실제 첫 상담 답(render/prefetch.json)을 받고 공고에 없는 준비물 질문을 '기관에 알리기'(실제 API에 저장)
 * ② 기관 대시보드: 그 질문이 목록에 들어온 상태에서, 영상과 같은 실제 보완 초안을 받아 담당자가 참가비·준비물 빈칸을 채우고 '공고에 덧붙이기'(실제 API에 저장)
 * ③ 중국어 보호자: 운동회 상세의 '기관이 확인해 덧붙인 안내' 카드, 같은 것을 물었을 때 그 안내를 인용한 실제 상담 답(/agent/chat, 캡처 때 새로 받음)
 * 끝나면(실패해도) 덧붙인 안내와 알린 질문을 지워 처음 상태로 돌린다.
 */
async function loop(browser) {
  if (!fs.existsSync(PREFETCH_CACHE)) throw new Error('render/prefetch.json이 없습니다. record-demo.js를 한 번 실행해 실제 보완 초안을 받아 두세요.')
  const cached = JSON.parse(fs.readFileSync(PREFETCH_CACHE, 'utf8'))
  const improve = JSON.parse(cached.improve)
  if (!improve.passed) throw new Error('저장된 보완 초안이 코드 검사를 통과한 결과가 아닙니다.')
  /** 담당자가 채울 항목(초안 번호 → 값). 영상과 같게 참가비 '무료', 준비물 '운동하기 편한 옷과 운동화' */
  const fill = new Map(cached.chosen.map(({ index, value }) => [index, value]))
  await removeAddenda()
  fs.rmSync(QUESTIONS_FILE, { force: true })
  try {
    // ① 베트남어 보호자: 영상과 같은 실제 첫 상담 답(render/prefetch.json)을 받고, 공고에 없는 질문을 '기관에 알리기'(실제 API에 저장)
    const guardian = await phone(browser, 'vi')
    await guardian.context().route('**/agent/chat', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': GUARDIAN }, body: cached.reply }))
    await guardian.goto(GUARDIAN + `/programs/${PROGRAM}`)
    await guardian.click('.ai-entry')
    await guardian.fill('#chat-input', CHAT_QUESTION.vi)
    await guardian.keyboard.press('Enter')
    await guardian.waitForSelector('.chat-unanswered .btn', { timeout: 30_000 })
    await guardian.click('.chat-unanswered .btn')
    await guardian.waitForSelector('.unanswered-sent')
    await guardian.waitForTimeout(400)
    await sheetShooter(guardian)('.chat-unanswered', 'app-loop-reported-vi.png', 60)
    await guardian.context().close()

    const context = await browser.newContext({ viewport: { width: 1440, height: 1140 }, deviceScaleFactor: 2 })
    await context.addInitScript((reviewer) => {
      localStorage.setItem('osan-dashboard-locale', 'ko-easy')
      localStorage.setItem('osan-dashboard-reviewer', reviewer)
    }, REVIEWER)
    await context.route(`**/admin/programs/${PROGRAM}/improve`, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': DASHBOARD }, body: cached.improve }))
    const desk = await context.newPage()
    await desk.goto(DASHBOARD + `/#questions/${PROGRAM}`)
    await desk.click('.improve .btn--primary')
    await desk.waitForSelector('.draft')
    const drafts = desk.locator('.draft-list > li')
    const count = await drafts.count()
    if (count !== improve.items.length) throw new Error(`초안 카드 ${count}개, 저장된 초안 ${improve.items.length}개`)
    for (let index = 0; index < count; index++) {
      const card = drafts.nth(index)
      const include = card.locator('.draft-include input')
      if (!fill.has(index)) { if (await include.isChecked()) await include.uncheck(); continue }
      if (!(await include.isChecked())) await include.check()
      const blanks = card.locator('.blanks input')
      for (let blank = 0; blank < await blanks.count(); blank++) await blanks.nth(blank).fill(fill.get(index))
    }
    await desk.mouse.move(0, 0)
    await desk.waitForTimeout(300)
    // 채운 카드 중 준비물 카드를 찍는다(①의 보호자가 알린 질문과 같은 주제): 질문 · 덧붙일 문장 · 담당자가 채운 값 · 게시될 문장
    const shown = [...fill.keys()].find((index) => improve.items[index].topic === 'materials') ?? [...fill.keys()][0]
    await drafts.nth(shown).screenshot({ path: path.join(OUT, 'dash-loop-filled.png') })
    await desk.click('.improve-actions .btn--primary')
    await desk.waitForSelector('.improve .notice--ok')
    await desk.waitForSelector('.question-list .is-answered')
    await desk.waitForTimeout(400)
    const questions = desk.locator('.detail-pane > .card').first()
    await questions.screenshot({ path: path.join(OUT, 'dash-loop-answered.png') })
    await questions.locator('.question-list').screenshot({ path: path.join(OUT, 'dash-loop-answered-list.png') })

    const page = await phone(browser, 'zh')
    await page.goto(GUARDIAN + `/programs/${PROGRAM}`)
    await page.waitForSelector('.addenda')
    await page.waitForFunction(() => [...document.querySelectorAll('.poster-thumb img')].every((image) => image.complete && image.naturalWidth > 0))
    await page.evaluate(() => Promise.all([...document.querySelectorAll('.poster-thumb img')].map((image) => image.decode().catch(() => {}))))
    // 장소 줄부터 찍는다: 비용 줄(덧붙인 안내로 바뀐 것)과 덧붙인 안내 카드가 함께 들어오고, 맨 위 줄이 반으로 잘리지 않게
    await page.evaluate(() => {
      const from = document.querySelectorAll('.facts .fact-row')[2] ?? document.querySelector('.addenda')
      window.scrollTo(0, from.getBoundingClientRect().top + window.scrollY - 6)
    })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT, 'app-loop-addenda-zh.png') })
    // 덱(12번)이 카드에 테두리를 그릴 자리: 그림 크기에 대한 비율
    const card = await page.evaluate(() => {
      const box = document.querySelector('.addenda').getBoundingClientRect()
      return { x: box.x / innerWidth, y: box.y / innerHeight, w: box.width / innerWidth, h: box.height / innerHeight }
    })
    saveMark('app-loop-addenda-zh.png', card)
    await page.click('.ai-entry')
    await page.fill('#chat-input', LOOP_QUESTION_ZH)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.bot-turn', { timeout: 90_000 })
    await page.waitForTimeout(600)
    if (!(await page.$('.chat-sources .chat-source-note'))) throw new Error('중국어 답이 기관이 덧붙인 안내를 인용하지 않았습니다. 다시 실행하세요.')
    const shoot = sheetShooter(page)
    await shoot('.bubble--user', 'app-loop-answer-zh.png', 40)
    await shoot('.chat-sources', 'app-loop-sources-zh.png', 300)
    await page.context().close()
    await context.close()
  } finally {
    await removeAddenda().catch((error) => console.warn('덧붙인 안내를 지우지 못했습니다:', error.message))
    fs.rmSync(QUESTIONS_FILE, { force: true })
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
