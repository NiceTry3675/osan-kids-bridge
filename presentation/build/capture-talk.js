// 구두 발표 덱(build-talk.js)용 화면 캡처. 11/5 이후 바뀐 보호자 웹(안쪽 영역 스크롤, 조건 시트, 신청·물어보기 시트)에 맞췄다.
// 먼저 API(8787, npm run demo)·보호자 웹(5173)·기관 대시보드(5174)를 띄운다. → ../assets/talk/*.png
// 상담 답과 공고 보완 초안은 시연영상 때 받아 둔 실제 결과(render/prefetch.json)를 다시 쓰므로 모델을 부르지 않는다.
// '기관에 알리기'와 '공고에 덧붙이기'는 실제 시연 API에 저장했다가 끝나면(실패해도) 지운다. record-demo.js·capture.js와 동시에 돌리지 않는다.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.resolve(__dirname, '../assets/talk')
const API = 'http://127.0.0.1:8787'
const GUARDIAN = 'http://127.0.0.1:5173'
const DASHBOARD = 'http://127.0.0.1:5174'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROGRAM = 'osan-fc-sports-day'
const REVIEWER = '담당자(시연)'
const QUESTIONS_FILE = path.join(ROOT, 'apps/program-api/data/local/demo-session/questions/questions.jsonl')
const PREFETCH = path.resolve(__dirname, 'render/prefetch.json')
/** 편성 도우미의 실제 결과(180가정). capture.js plan이 받아 둔 것 */
const PLAN = path.resolve(__dirname, 'render/plan-result.json')
/** 첫 가정(베트남어 화면)의 질문: 아이가 8살이에요. 저와 아이가 갈 수 있나요? 준비물이 있나요? (시연영상과 같은 질문) */
const ASK_VI = 'Con tôi 8 tuổi. Tôi và con đi được không? Có cần chuẩn bị gì không?'
/** 다음 가정(중국어 화면)의 질문: 운동회 참가비가 있나요? 무엇을 가져가요? */
const ASK_ZH = '运动会要交参加费吗？需要带什么？'
const only = new Set(process.argv.slice(2))
const want = (name) => only.size === 0 || only.has(name)

fs.mkdirSync(OUT, { recursive: true })
const shotPath = (name) => path.join(OUT, name)

/** 캡처 속 요소의 자리(그림 크기에 대한 비율). build-talk.js가 그 위에 강조 테두리를 그린다 → ../assets/talk/marks.json */
const MARKS = path.join(OUT, 'marks.json')
const marks = (() => { try { return JSON.parse(fs.readFileSync(MARKS, 'utf8')) } catch { return {} } })()
/** selector(또는 text를 포함한 selector 요소)의 자리. within이 있으면 그 요소 기준(요소 캡처), 없으면 화면 기준 */
async function mark(page, image, key, selector, { within = null, text = null } = {}) {
  const box = await page.evaluate(([sel, base, needle]) => {
    const all = [...document.querySelectorAll(sel)]
    const el = needle ? all.find((node) => node.textContent.includes(needle)) : all[0]
    if (!el) return null
    const r = el.getBoundingClientRect()
    const b = base ? document.querySelector(base).getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    const clamp = (v) => Math.max(0, Math.min(1, v))
    const x = clamp((r.left - b.left) / b.width)
    const y = clamp((r.top - b.top) / b.height)
    return { x, y, w: clamp((r.right - b.left) / b.width) - x, h: clamp((r.bottom - b.top) / b.height) - y }
  }, [selector, within, text])
  if (!box) throw new Error(`표시할 요소가 없음: ${image} ${key} (${selector}${text ? ` ~ ${text}` : ''})`)
  marks[image] = { ...(marks[image] ?? {}), [key]: Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v * 10000) / 10000])) }
  fs.writeFileSync(MARKS, JSON.stringify(marks, null, 2))
}

async function api(method, route, body) {
  const response = await fetch(`${API}${route}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  if (!response.ok) throw new Error(`${method} ${route} 실패 ${response.status}: ${await response.text()}`)
  return response.text()
}
async function removeAddenda() {
  const detail = JSON.parse(await api('GET', `/admin/programs/${PROGRAM}`))
  for (const addendum of detail.addenda) await api('DELETE', `/admin/programs/${PROGRAM}/addenda/${addendum.id}`)
}

/** 휴대폰 화면(375×812, 3배). 터치 기기로 띄워 hover 흔적이 남지 않게 한다 */
async function phone(browser, locale, { intro = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, hasTouch: true, locale: 'ko-KR' })
  await context.addInitScript(([value, showIntro]) => {
    localStorage.setItem('osan-guardian-locale', value)
    if (!showIntro) localStorage.setItem('osan-guardian-intro-seen', '1')
  }, [locale, intro])
  const page = await context.newPage()
  return page
}

/** 화면 안에 보이는 그림이 다 그려질 때까지 (화면 밖의 lazy 그림은 기다리지 않는다) */
async function imagesReady(page) {
  const inView = () => [...document.images].filter((image) => {
    const box = image.getBoundingClientRect()
    return box.height > 0 && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth
  })
  await page.waitForFunction(`(${inView.toString()})().every((image) => image.complete && image.naturalWidth > 0)`, null, { timeout: 30_000 })
  await page.evaluate(`Promise.all((${inView.toString()})().map((image) => image.decode().catch(() => {})))`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(350)
}

/** 스크롤 영역(scroller) 안에서 selector의 위쪽이 offset(px)에 오게 */
async function scrollTo(page, selector, offset = 12, scroller = '#scroll-root') {
  await page.evaluate(([sel, off, box]) => {
    const root = document.querySelector(box)
    const el = document.querySelector(sel)
    if (!root || !el) throw new Error(`없음: ${!root ? box : sel}`)
    root.scrollTop += el.getBoundingClientRect().top - root.getBoundingClientRect().top - off
  }, [selector, offset, scroller])
  await page.waitForTimeout(300)
}

/** 시트가 다 올라올 때까지 (열리는 움직임이 끝난 뒤 찍는다) */
async function sheetOpen(page) {
  await page.waitForSelector('dialog[open] .sheet-body')
  await page.waitForTimeout(900)
}

async function intro(browser, locale, name) {
  const page = await phone(browser, locale, { intro: true })
  await page.goto(GUARDIAN + '/')
  await page.waitForSelector('.intro-lang')
  await imagesReady(page)
  await page.screenshot({ path: shotPath(name) })
  await page.context().close()
}

/** 조건 시트와 그 조건으로 걸러진 목록. 기본은 초2·토요일·오전, byAge면 만 8세·토요일(운동회 공고가 '맞는 공고'에 든다) */
async function journey(browser, locale, { sheetName, listName, byAge = false }) {
  const page = await phone(browser, locale)
  await page.goto(GUARDIAN + '/')
  await page.waitForSelector('.home-bar-fit')
  await imagesReady(page)
  await page.click('.home-bar-fit')
  await sheetOpen(page)
  const dialog = page.locator('dialog[open]')
  if (byAge) {
    await dialog.locator('.legend-link').first().click()
    await dialog.locator('.input-row input').fill('8')
    await dialog.locator('.days [role="checkbox"]').nth(5).click() // 토요일
  } else {
    await dialog.locator('.grades [role="radio"]').nth(1).click() // 2학년 (초등이 기본)
    await dialog.locator('.days [role="checkbox"]').nth(5).click() // 토요일 (월~일 순서)
    await dialog.locator('.time-parts [role="checkbox"]').nth(0).click() // 오전
  }
  await page.waitForTimeout(700)
  if (sheetName) await page.screenshot({ path: shotPath(sheetName) })
  await dialog.locator('.sheet-foot .btn--primary').click()
  await page.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {})
  await page.waitForSelector('.item-match')
  await page.waitForTimeout(900)
  await imagesReady(page)
  if (listName) {
    // 나이로 찾을 때는 운동회 카드가 화면 안에 다 들어오게 조금 내린다
    if (byAge) {
      await page.evaluate((program) => {
        const root = document.querySelector('#scroll-root')
        const card = document.querySelector(`a.item[href$="/programs/${program}"]`)
        const bottom = card.getBoundingClientRect().bottom - root.getBoundingClientRect().top
        if (bottom > root.clientHeight - 16) root.scrollTop += bottom - root.clientHeight + 24
      }, PROGRAM)
      await page.waitForTimeout(400)
      await imagesReady(page)
    }
    await page.screenshot({ path: shotPath(listName) })
    if (byAge) await mark(page, listName, 'sports', `a.item[href$="/programs/${PROGRAM}"]`)
  }
  await page.context().close()
}

/** 공고 상세 첫 화면과 편한 언어로 바꾼 포스터 */
async function detail(browser, locale, { topName, posterName }) {
  const page = await phone(browser, locale)
  await page.goto(GUARDIAN + `/programs/${PROGRAM}`)
  await page.waitForSelector('.detail-title')
  await imagesReady(page)
  if (topName) await page.screenshot({ path: shotPath(topName) })
  if (posterName) {
    await scrollTo(page, '.poster-frame', 96)
    await imagesReady(page)
    await page.screenshot({ path: shotPath(posterName) })
  }
  await page.context().close()
}

/** 상세 → 물어보기 → AI에게 묻기 → 질문 보내기 (답은 route가 돌려줌) */
async function openChatAndAsk(page, question) {
  await page.click('.action-bar .btn--outline')
  await sheetOpen(page)
  await page.locator('dialog[open] button.btn--secondary.btn--block').click()
  await page.waitForSelector('#chat-input')
  await page.waitForTimeout(900)
  await page.fill('#chat-input', question)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.bot-turn', { timeout: 60_000 })
  await page.waitForTimeout(1200)
}

async function main() {
  if (!fs.existsSync(PREFETCH)) throw new Error('render/prefetch.json이 없습니다(record-demo.js가 받아 둔 실제 결과).')
  const cached = JSON.parse(fs.readFileSync(PREFETCH, 'utf8'))
  const improve = JSON.parse(cached.improve)
  const fill = new Map(cached.chosen.map(({ index, value }) => [index, value]))
  const browser = await chromium.launch({ executablePath: CHROME })
  try {
    if (want('intro')) {
      await intro(browser, 'ko-easy', 'p1-intro-ko.png')
      await intro(browser, 'vi', 'p1-intro-vi.png')
    }
    if (want('journey')) {
      await journey(browser, 'vi', { sheetName: 'p2-conditions-vi.png', listName: 'p3-results-vi.png' })
      await journey(browser, 'zh', { sheetName: 'p2-conditions-zh.png', listName: 'p3-results-zh.png' })
    }
    if (want('age')) {
      await journey(browser, 'vi', { sheetName: 'p2-age-vi.png', listName: 'p3-age-vi.png', byAge: true })
      await journey(browser, 'zh', { sheetName: 'p2-age-zh.png', listName: 'p3-age-zh.png', byAge: true })
    }
    if (want('detail')) {
      await detail(browser, 'vi', { topName: 'p4-detail-vi.png', posterName: 'p4-poster-vi.png' })
      await detail(browser, 'zh', { topName: 'p4-detail-zh.png', posterName: 'p4-poster-zh.png' })
    }
    if (want('plan')) {
      // 편성: 받아 둔 실제 편성안(render/plan-result.json, 180가정)을 돌려주고 통계 카드와 편성안 카드를 따로 찍는다. 시연 꼬리표는 캡처에서 뺀다
      const context = await browser.newContext({ viewport: { width: 1440, height: 1300 }, deviceScaleFactor: 2 })
      await context.addInitScript(() => localStorage.setItem('osan-dashboard-locale', 'ko-easy'))
      await context.route('**/admin/planning/propose', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': DASHBOARD }, body: fs.readFileSync(PLAN, 'utf8') }))
      const desk = await context.newPage()
      await desk.goto(DASHBOARD + '/#plan')
      await desk.waitForSelector('.plan-agent .btn--primary')
      await desk.click('.plan-agent .btn--primary')
      await desk.waitForSelector('.plan-card', { timeout: 60_000 })
      await desk.evaluate(() => document.querySelectorAll('.demo-tag').forEach((node) => node.remove()))
      await desk.mouse.move(0, 0)
      await desk.waitForTimeout(600)
      await desk.locator('.plan-data').screenshot({ path: shotPath('d4-stats.png') })
      await mark(desk, 'd4-stats.png', 'heatmap', '.plan-data .heatmap', { within: '.plan-data' })
      await mark(desk, 'd4-stats.png', 'interest', '.plan-data .bar-row', { within: '.plan-data', text: '예술·체육' })
      await mark(desk, 'd4-stats.png', 'topic', '.plan-data .topic-bars li', { within: '.plan-data', text: '일정' })
      await desk.locator('.plan-card').screenshot({ path: shotPath('d5-plan.png') })
      await mark(desk, 'd5-plan.png', 'metric', '.plan-card .plan-metric', { within: '.plan-card' })
      await mark(desk, 'd5-plan.png', 'classes', '.plan-card .plan-classes', { within: '.plan-card' })
      await mark(desk, 'd5-plan.png', 'reasons', '.plan-card .plan-reasons', { within: '.plan-card' })
      await context.close()
    }
    if (want('loop')) {
      await removeAddenda()
      fs.rmSync(QUESTIONS_FILE, { force: true })
      try {
        // 첫 가정(베트남어 화면): 답 → 기관에 물을 한국어 문장 → 공고에 없는 질문을 '기관에 알리기'
        const first = await phone(browser, 'vi')
        await first.context().route('**/agent/chat', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': GUARDIAN }, body: cached.reply }))
        await first.goto(GUARDIAN + `/programs/${PROGRAM}`)
        await first.waitForSelector('.detail-title')
        await openChatAndAsk(first, ASK_VI)
        const sheet = 'dialog[open] .sheet-body'
        await scrollTo(first, '.bubble--user', 8, sheet)
        await first.screenshot({ path: shotPath('p5-answer-vi.png') })
        await mark(first, 'p5-answer-vi.png', 'question', '.bubble--user')
        await mark(first, 'p5-answer-vi.png', 'steps', '.agent-steps')
        await mark(first, 'p5-answer-vi.png', 'step3', '.agent-step:nth-child(3)')
        await mark(first, 'p5-answer-vi.png', 'answer', '.bot-turn .bubble--bot')
        await mark(first, 'p5-answer-vi.png', 'ask', '.bot-turn .bubble--bot li, .bot-turn .bubble--bot p', { text: 'Cần hỏi cơ quan' })
        await scrollTo(first, '.chat-inquiry', 8, sheet)
        await first.screenshot({ path: shotPath('p5-inquiry-vi.png') })
        await mark(first, 'p5-inquiry-vi.png', 'inquiry', '.chat-inquiry')
        await mark(first, 'p5-inquiry-vi.png', 'unanswered', '.chat-unanswered')
        await first.click('.chat-unanswered .btn')
        await first.waitForSelector('.unanswered-sent')
        await first.waitForTimeout(500)
        await scrollTo(first, '.chat-unanswered', 120, sheet)
        await first.screenshot({ path: shotPath('p6-reported-vi.png') })
        await mark(first, 'p6-reported-vi.png', 'unanswered', '.chat-unanswered')
        await mark(first, 'p6-reported-vi.png', 'sent', '.unanswered-sent')
        await first.context().close()

        // 기관 담당자: 알린 질문이 들어온 공고에서 보완 초안 → 빈칸(참가비·준비물) 채우기 → 공고에 덧붙이기
        const context = await browser.newContext({ viewport: { width: 1440, height: 1140 }, deviceScaleFactor: 2 })
        await context.addInitScript((reviewer) => {
          localStorage.setItem('osan-dashboard-locale', 'ko-easy')
          localStorage.setItem('osan-dashboard-reviewer', reviewer)
        }, REVIEWER)
        await context.route(`**/admin/programs/${PROGRAM}/improve`, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': DASHBOARD }, body: cached.improve }))
        const desk = await context.newPage()
        await desk.goto(DASHBOARD + `/#questions/${PROGRAM}`)
        await desk.waitForSelector('.question-list')
        await desk.waitForTimeout(500)
        await desk.locator('.detail-pane > .card').first().screenshot({ path: shotPath('d1-questions.png') })
        await mark(desk, 'd1-questions.png', 'newq', '.question-list li', { within: '.detail-pane > .card', text: '개인 준비물' })
        await mark(desk, 'd1-questions.png', 'bars', '.detail-pane > .card .topic-bars', { within: '.detail-pane > .card' })
        await desk.click('.improve .btn--primary')
        await desk.waitForSelector('.draft')
        const drafts = desk.locator('.draft-list > li')
        const count = await drafts.count()
        if (count !== improve.items.length) throw new Error(`초안 카드 ${count}개, 저장된 초안 ${improve.items.length}개`)
        // 채우기 전: 기관만 아는 값이 빈칸으로 남은 초안(준비물 카드)
        await desk.mouse.move(0, 0)
        await desk.waitForTimeout(400)
        const firstMaterials = improve.items.findIndex((item) => item.topic === 'materials')
        await drafts.nth(firstMaterials >= 0 ? firstMaterials : 0).screenshot({ path: shotPath('d2-blank.png') })
        await desk.evaluate((index) => document.querySelectorAll('.draft-list > li')[index].setAttribute('data-shot', '1'), firstMaterials >= 0 ? firstMaterials : 0)
        await mark(desk, 'd2-blank.png', 'questions', '[data-shot] .draft-questions', { within: '[data-shot]' })
        await mark(desk, 'd2-blank.png', 'blank', '[data-shot] .blanks', { within: '[data-shot]' })
        await mark(desk, 'd2-blank.png', 'preview', '[data-shot] .draft-preview', { within: '[data-shot]' })
        for (let index = 0; index < count; index++) {
          const card = drafts.nth(index)
          const include = card.locator('.draft-include input')
          if (!fill.has(index)) { if (await include.isChecked()) await include.uncheck(); continue }
          if (!(await include.isChecked())) await include.check()
          const blanks = card.locator('.blanks input')
          for (let blank = 0; blank < await blanks.count(); blank++) await blanks.nth(blank).fill(fill.get(index))
        }
        await desk.mouse.move(0, 0)
        await desk.waitForTimeout(400)
        const materials = [...fill.keys()].find((index) => improve.items[index].topic === 'materials') ?? [...fill.keys()][0]
        await drafts.nth(materials).screenshot({ path: shotPath('d2-filled.png') })
        await mark(desk, 'd2-filled.png', 'blank', '[data-shot] .blanks', { within: '[data-shot]' })
        await mark(desk, 'd2-filled.png', 'preview', '[data-shot] .draft-preview', { within: '[data-shot]' })
        await desk.locator('.improve').screenshot({ path: shotPath('d2-improve.png') })
        await desk.click('.improve-actions .btn--primary')
        await desk.waitForSelector('.improve .notice--ok')
        await desk.waitForSelector('.question-list .is-answered')
        await desk.waitForTimeout(500)
        await desk.locator('.detail-pane > .card').first().screenshot({ path: shotPath('d1-answered.png') })
        await mark(desk, 'd1-answered.png', 'newq', '.question-list li', { within: '.detail-pane > .card', text: '개인 준비물' })
        await context.close()

        // 다음 가정(중국어 화면): 상세의 '기관이 확인해 덧붙인 안내', 같은 것을 물으면 그 안내를 인용한 답
        const next = await phone(browser, 'zh')
        await next.context().route('**/agent/chat', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': GUARDIAN }, body: cached.replyAgain }))
        await next.goto(GUARDIAN + `/programs/${PROGRAM}`)
        await next.waitForSelector('.addenda')
        await imagesReady(next)
        await scrollTo(next, '.addenda', 150)
        await next.screenshot({ path: shotPath('p7-addenda-zh.png') })
        await mark(next, 'p7-addenda-zh.png', 'addenda', '.addenda')
        await openChatAndAsk(next, ASK_ZH)
        await scrollTo(next, '.bubble--user', 8, 'dialog[open] .sheet-body')
        await next.screenshot({ path: shotPath('p7-answer-zh.png') })
        await mark(next, 'p7-answer-zh.png', 'question', '.bubble--user')
        await mark(next, 'p7-answer-zh.png', 'answer', '.bot-turn .bubble--bot')
        // 답 첫 문장과 '기관이 덧붙인 안내'를 인용한 근거가 한 화면에 들어오게
        await scrollTo(next, '.bot-turn .bubble--bot', 6, 'dialog[open] .sheet-body')
        await next.screenshot({ path: shotPath('p7-both-zh.png') })
        await mark(next, 'p7-both-zh.png', 'lead', '.bot-turn .bubble-lead')
        await mark(next, 'p7-both-zh.png', 'cited', '.chat-sources blockquote:has(.chat-source-note)')
        await scrollTo(next, '.chat-sources', 8, 'dialog[open] .sheet-body')
        await next.screenshot({ path: shotPath('p7-sources-zh.png') })
        await mark(next, 'p7-sources-zh.png', 'sources', '.chat-sources')
        await mark(next, 'p7-sources-zh.png', 'cited', '.chat-sources blockquote:has(.chat-source-note)')
        await next.context().close()
      } finally {
        await removeAddenda().catch((error) => console.warn('덧붙인 안내를 지우지 못했습니다:', error.message))
        fs.rmSync(QUESTIONS_FILE, { force: true })
      }
    }
  } finally {
    await browser.close()
  }
  console.log('저장:', fs.readdirSync(OUT).filter((name) => name.endsWith('.png')).join(', '))
}

main().catch((error) => { console.error(error); process.exit(1) })
