// 포스터 발표 옆 노트북에 띄울 무음 시연영상(my-video, Remotion)용 화면 캡처.
// 먼저 API(8787, npm run demo)·보호자 웹(5173)·기관 대시보드(5174)를 띄운다. → ../assets/video/
// - 상태가 바뀌는 순간(누르기 전·후)은 PNG 한 장씩, 스크롤은 실제로 조금씩 내리며 찍은 JPEG 연속 장면(폴더)으로 남긴다.
// - 누를 자리·강조할 자리는 화면 크기에 대한 비율로 shots.json에 남긴다(영상의 누름 표시·확대가 이 값을 쓴다).
// - 상담 답·공고 보완 초안·편성안은 시연영상 때 받아 둔 실제 결과(render/prefetch.json, plan-result.json)를 다시 돌려준다.
// - '기관에 알리기'와 '공고에 덧붙이기'는 실제 시연 API에 저장했다가 끝나면(실패해도) 지운다. capture-talk.js·record-demo.js와 동시에 돌리지 않는다.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.resolve(__dirname, '../assets/video')
const API = 'http://127.0.0.1:8787'
const GUARDIAN = 'http://127.0.0.1:5173'
const DASHBOARD = 'http://127.0.0.1:5174'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROGRAM = 'osan-fc-sports-day'
const REVIEWER = '담당자(시연)'
const QUESTIONS_FILE = path.join(ROOT, 'apps/program-api/data/local/demo-session/questions/questions.jsonl')
const PREFETCH = path.resolve(__dirname, 'render/prefetch.json')
const PLAN = path.resolve(__dirname, 'render/plan-result.json')
/** 첫 가정(베트남어 화면): 아이가 8살이에요. 저와 아이가 갈 수 있나요? 준비할 게 있나요? */
const ASK_VI = 'Con tôi 8 tuổi. Tôi và con đi được không? Có cần chuẩn bị gì không?'
/** 다음 가정(중국어 화면): 운동회 참가비가 있나요? 무엇을 가져가요? */
const ASK_ZH = '运动会要交参加费吗？需要带什么？'
const PHONE = { width: 375, height: 812 }
const DESK = { width: 1440, height: 1000 }

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
/** 그림 이름 → { file | frames, width, height, marks: { key: {x,y,w,h} } } */
const shots = {}
const save = () => fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(shots, null, 2))

async function api(method, route, body) {
  const response = await fetch(`${API}${route}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  if (!response.ok) throw new Error(`${method} ${route} 실패 ${response.status}: ${await response.text()}`)
  return response.text()
}
async function removeAddenda() {
  const detail = JSON.parse(await api('GET', `/admin/programs/${PROGRAM}`))
  for (const addendum of detail.addenda) await api('DELETE', `/admin/programs/${PROGRAM}/addenda/${addendum.id}`)
}

/** 화면(뷰포트) 기준 요소 자리. text가 있으면 그 글을 포함한 요소 */
async function box(page, selector, text = null, { full = false } = {}) {
  const found = await page.evaluate(([sel, needle, whole]) => {
    const all = [...document.querySelectorAll(sel)]
    const el = needle ? all.find((node) => node.textContent.includes(needle)) : all[0]
    if (!el) return null
    const r = el.getBoundingClientRect()
    const W = whole ? document.documentElement.scrollWidth : window.innerWidth
    const H = whole ? document.documentElement.scrollHeight : window.innerHeight
    const dx = whole ? window.scrollX : 0
    const dy = whole ? window.scrollY : 0
    const round = (v) => Math.round(v * 10000) / 10000
    return { x: round((r.left + dx) / W), y: round((r.top + dy) / H), w: round(r.width / W), h: round(r.height / H) }
  }, [selector, text, full])
  if (!found) throw new Error(`요소가 없음: ${selector}${text ? ` ~ ${text}` : ''}`)
  return found
}
/** 한 장 찍고 표시할 자리를 같이 남긴다. marks: { key: [selector, text?] } */
async function shot(page, name, marks = {}, { full = false } = {}) {
  const file = `${name}.png`
  await page.screenshot({ path: path.join(OUT, file), fullPage: full })
  const size = await page.evaluate((whole) => whole
    ? [document.documentElement.scrollWidth, document.documentElement.scrollHeight]
    : [window.innerWidth, window.innerHeight], full)
  const entry = { file, width: size[0], height: size[1], marks: {} }
  for (const [key, [selector, text]] of Object.entries(marks)) entry.marks[key] = await box(page, selector, text, { full })
  shots[name] = entry
  save()
  return entry
}
/** scroller를 from→to로 조금씩(step px) 내리며 연속 장면을 찍는다. 처음·마지막 장면의 표시 자리도 남긴다 */
async function scrollFrames(page, name, scroller, to, { step = 14, first = {}, last = {} } = {}) {
  const dir = path.join(OUT, name)
  fs.mkdirSync(dir, { recursive: true })
  const from = await page.evaluate((sel) => document.querySelector(sel).scrollTop, scroller)
  const count = Math.max(2, Math.round(Math.abs(to - from) / step) + 1)
  const entry = { frames: [], width: PHONE.width, height: PHONE.height, from, to, marks: {}, lastMarks: {} }
  for (let index = 0; index < count; index++) {
    const top = Math.round(from + ((to - from) * index) / (count - 1))
    await page.evaluate(([sel, value]) => { document.querySelector(sel).scrollTop = value }, [scroller, top])
    await page.waitForTimeout(index === 0 || index === count - 1 ? 400 : 60)
    if (index === 0) for (const [key, [selector, text]] of Object.entries(first)) entry.marks[key] = await box(page, selector, text)
    if (index === count - 1) for (const [key, [selector, text]] of Object.entries(last)) entry.lastMarks[key] = await box(page, selector, text)
    const file = `${name}/${String(index).padStart(3, '0')}.jpg`
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 92 })
    entry.frames.push(file)
  }
  shots[name] = entry
  save()
  return entry
}

async function phone(browser, locale, { intro = false } = {}) {
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 3, hasTouch: true, locale: 'ko-KR' })
  await context.addInitScript(([value, showIntro]) => {
    if (value) localStorage.setItem('osan-guardian-locale', value)
    if (!showIntro) localStorage.setItem('osan-guardian-intro-seen', '1')
  }, [locale, intro])
  return context.newPage()
}
/** 화면 안 그림이 다 그려질 때까지 */
async function imagesReady(page) {
  const inView = () => [...document.images].filter((image) => {
    const r = image.getBoundingClientRect()
    return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth
  })
  await page.waitForFunction(`(${inView.toString()})().every((image) => image.complete && image.naturalWidth > 0)`, null, { timeout: 30_000 })
  await page.evaluate(`Promise.all((${inView.toString()})().map((image) => image.decode().catch(() => {})))`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(350)
}
/** scroller 안에서 selector 위쪽이 offset에 오는 scrollTop (스크롤하지 않고 값만) */
function topFor(page, selector, offset, scroller) {
  return page.evaluate(([sel, off, box]) => {
    const root = document.querySelector(box)
    const el = document.querySelector(sel)
    return Math.round(root.scrollTop + el.getBoundingClientRect().top - root.getBoundingClientRect().top - off)
  }, [selector, offset, scroller])
}
/** scroller 안에서 selector 아래쪽이 scroller 아래에서 gap만큼 위에 오는 scrollTop */
function bottomFor(page, selector, gap, scroller) {
  return page.evaluate(([sel, off, box]) => {
    const root = document.querySelector(box)
    const el = document.querySelector(sel)
    return Math.round(root.scrollTop + el.getBoundingClientRect().bottom - root.getBoundingClientRect().bottom + off)
  }, [selector, gap, scroller])
}
/** 입력칸과 같은 줄에 있는 보내기 버튼에 표시를 붙인다 */
function markSend(page) {
  return page.evaluate(() => {
    const input = document.querySelector('#chat-input').getBoundingClientRect()
    const middle = input.top + input.height / 2
    const send = [...document.querySelectorAll('dialog[open] button')].find((button) => {
      const r = button.getBoundingClientRect()
      return r.top < middle && r.bottom > middle && r.left >= input.right - 4
    })
    if (!send) throw new Error('보내기 버튼을 찾지 못함')
    send.setAttribute('data-v', 'send')
  })
}
async function sheetOpen(page) {
  await page.waitForSelector('dialog[open] .sheet-body')
  await page.waitForTimeout(900)
}
/** 대시보드 화면의 시연 꼬리표·'시연용 가상' 문구와 마우스 흔적을 지운다 (포스터 캡처와 같은 규칙. 앱 자체는 그대로) */
async function tidyDesk(page) {
  const left = await page.evaluate(() => {
    document.querySelectorAll('.demo-tag').forEach((node) => node.remove())
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const rules = [
      [/\s*\(시연[^)]*\)/g, ''],
      [/\s*·\s*시연용 가상 응답[^·]*/g, ''],
      [/시연용 가상 응답\s*/g, ''],
      [/\s*·?\s*장소 \d+곳의 대관 가능 시간은 가정\s*\(실제 통계 아님\)/g, ''],
    ]
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let text = node.nodeValue
      for (const [pattern, value] of rules) text = text.replace(pattern, value)
      if (text !== node.nodeValue) node.nodeValue = text
    }
    for (const el of document.querySelectorAll('body *')) {
      const text = el.textContent.trim()
      if (el.children.length === 0 && (text.startsWith('시연용 예시 질문') || text.startsWith('이 결과는 시연용'))) el.style.display = 'none'
    }
    return [...document.body.innerText.matchAll(/[^\n]*(시연|가상)[^\n]*/g)].map((match) => match[0].trim()).filter(Boolean)
  })
  if (left.length) console.warn('남은 시연 문구:', left)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)
}

async function main() {
  const cached = JSON.parse(fs.readFileSync(PREFETCH, 'utf8'))
  const improve = JSON.parse(cached.improve)
  const fill = new Map(cached.chosen.map(({ index, value }) => [index, value]))
  const materials = [...fill.keys()].find((index) => improve.items[index].topic === 'materials')
  if (materials === undefined) throw new Error('준비물 초안에 채울 값이 없습니다(prefetch.json chosen)')
  const browser = await chromium.launch({ executablePath: CHROME })
  await removeAddenda()
  fs.rmSync(QUESTIONS_FILE, { force: true })
  try {
    // ① 첫 화면: 쉬운 한국어로 열렸다가 Tiếng Việt를 누르면 화면 글자가 바뀐다
    const intro = await phone(browser, null, { intro: true })
    await intro.goto(GUARDIAN + '/')
    await intro.waitForSelector('.intro-lang')
    await imagesReady(intro)
    await shot(intro, 'vi-intro-ko', { vi: ['.intro-lang', 'Tiếng Việt'] })
    await intro.locator('.intro-lang', { hasText: 'Tiếng Việt' }).click()
    await intro.waitForTimeout(900)
    await imagesReady(intro)
    await shot(intro, 'vi-intro-vi', { start: ['button', 'Bắt đầu xem'] })
    await intro.context().close()

    // ① 공고 상세: 맨 위에서 편한 언어로 옮긴 포스터까지 내려간다
    const first = await phone(browser, 'vi')
    await first.context().route('**/agent/chat', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': GUARDIAN }, body: cached.reply }))
    await first.goto(GUARDIAN + `/programs/${PROGRAM}`)
    await first.waitForSelector('.detail-title')
    await imagesReady(first)
    // 포스터 그림을 먼저 다 받아 두고 맨 위로 (스크롤 도중 빈 그림이 찍히지 않게)
    const posterTop = await topFor(first, '.poster-frame', 96, '#scroll-root')
    await first.evaluate((top) => { document.querySelector('#scroll-root').scrollTop = top }, posterTop)
    await imagesReady(first)
    await first.evaluate(() => { document.querySelector('#scroll-root').scrollTop = 0 })
    await first.waitForTimeout(400)
    await scrollFrames(first, 'vi-detail', '#scroll-root', posterTop, {
      step: 16,
      first: { title: ['.detail-title'] },
      last: { poster: ['.poster-frame'], ask: ['.action-bar .btn--outline'] },
    })

    // ② 묻기: 물어보기 → AI에게 묻기 → 질문 입력 → 보내기
    await first.click('.action-bar .btn--outline')
    await sheetOpen(first)
    await shot(first, 'vi-ask', { ai: ['dialog[open] button.btn--secondary.btn--block'] })
    await first.locator('dialog[open] button.btn--secondary.btn--block').click()
    await first.waitForSelector('#chat-input')
    await first.waitForTimeout(900)
    await markSend(first)
    await shot(first, 'vi-chat-empty', { input: ['#chat-input'], send: ['[data-v="send"]'] })
    await first.fill('#chat-input', ASK_VI)
    await first.waitForTimeout(300)
    await shot(first, 'vi-chat-typed', { input: ['#chat-input'], send: ['[data-v="send"]'] })
    await first.keyboard.press('Enter')
    await first.waitForSelector('.bot-turn', { timeout: 60_000 })
    await first.waitForTimeout(1200)
    const sheet = 'dialog[open] .sheet-body'
    const answerTop = await topFor(first, '.bubble--user', 8, sheet)
    await first.evaluate(([sel, top]) => { document.querySelector(sel).scrollTop = top }, [sheet, answerTop])
    await first.waitForTimeout(300)
    const unansweredTop = await bottomFor(first, '.chat-unanswered', 14, sheet)
    await scrollFrames(first, 'vi-chat', sheet, unansweredTop, {
      step: 18,
      first: { question: ['.bubble--user'], steps: ['.agent-steps'], answer: ['.bot-turn .bubble--bot'] },
      last: { unanswered: ['.chat-unanswered'], report: ['.chat-unanswered .btn'] },
    })
    // 공고에 없는 질문을 기관에 알린다 (스크롤은 그대로)
    await first.click('.chat-unanswered .btn')
    await first.waitForSelector('.unanswered-sent')
    await first.waitForTimeout(600)
    await shot(first, 'vi-reported', { unanswered: ['.chat-unanswered'], sent: ['.unanswered-sent'] })
    await first.context().close()

    // ③ 기관 담당자: 알린 질문 → 보완 초안 → 빈칸 채우기 → 공고에 덧붙이기
    const context = await browser.newContext({ viewport: DESK, deviceScaleFactor: 2 })
    await context.addInitScript((reviewer) => {
      localStorage.setItem('osan-dashboard-locale', 'ko-easy')
      localStorage.setItem('osan-dashboard-reviewer', reviewer)
    }, REVIEWER)
    await context.route(`**/admin/programs/${PROGRAM}/improve`, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': DASHBOARD }, body: cached.improve }))
    await context.route('**/admin/planning/propose', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': DASHBOARD }, body: fs.readFileSync(PLAN, 'utf8') }))
    const desk = await context.newPage()
    await desk.goto(DASHBOARD + `/#questions/${PROGRAM}`)
    await desk.waitForSelector('.question-list')
    await tidyDesk(desk)
    await shot(desk, 'desk-questions', {
      newq: ['.question-list li', '개인 준비물'],
      list: ['.question-list'],
      improve: ['.improve .btn--primary'],
      nav: ['nav a, nav button', '보호자 질문'],
    })
    await desk.click('.improve .btn--primary')
    await desk.waitForSelector('.draft')
    const drafts = desk.locator('.draft-list > li')
    const count = await drafts.count()
    if (count !== improve.items.length) throw new Error(`초안 카드 ${count}개, 저장된 초안 ${improve.items.length}개`)
    // 준비물 말고 채울 카드(참가비)는 먼저 채워 두고, 준비물 카드만 빈칸으로 남긴다
    for (let index = 0; index < count; index++) {
      const card = drafts.nth(index)
      const include = card.locator('.draft-include input')
      if (!fill.has(index)) { if (await include.isChecked()) await include.uncheck(); continue }
      if (!(await include.isChecked())) await include.check()
      if (index === materials) continue
      const blanks = card.locator('.blanks input')
      for (let blank = 0; blank < await blanks.count(); blank++) await blanks.nth(blank).fill(fill.get(index))
    }
    await desk.evaluate((index) => document.querySelectorAll('.draft-list > li')[index].setAttribute('data-shot', '1'), materials)
    // 준비물 카드가 화면 가운데쯤 오게 (창 전체가 스크롤된다)
    await desk.evaluate(() => {
      const card = document.querySelector('[data-shot]').getBoundingClientRect()
      window.scrollBy(0, card.top - (window.innerHeight - card.height) / 2)
    })
    await tidyDesk(desk)
    await shot(desk, 'desk-blank', {
      card: ['[data-shot]'],
      questions: ['[data-shot] .draft-questions'],
      blank: ['[data-shot] .blanks input'],
      preview: ['[data-shot] .draft-preview'],
    })
    const blanks = drafts.nth(materials).locator('.blanks input')
    for (let blank = 0; blank < await blanks.count(); blank++) await blanks.nth(blank).fill(fill.get(materials))
    await tidyDesk(desk)
    await shot(desk, 'desk-filled', {
      card: ['[data-shot]'],
      blank: ['[data-shot] .blanks input'],
      preview: ['[data-shot] .draft-preview'],
    })
    // 덧붙이기 버튼이 보이게 내린 화면
    await desk.evaluate(() => {
      const button = document.querySelector('.improve-actions .btn--primary').getBoundingClientRect()
      window.scrollBy(0, button.bottom - window.innerHeight + 140)
    })
    await tidyDesk(desk)
    await shot(desk, 'desk-append', { append: ['.improve-actions .btn--primary'] })
    await desk.click('.improve-actions .btn--primary')
    await desk.waitForSelector('.improve .notice--ok')
    await desk.waitForSelector('.question-list .is-answered')
    await desk.evaluate(() => window.scrollTo(0, 0))
    await tidyDesk(desk)
    await shot(desk, 'desk-answered', { newq: ['.question-list li', '개인 준비물'], list: ['.question-list'] })

    // ④ 편성: 익명 조건 통계와 편성안 (페이지 전체를 한 장으로)
    await desk.goto(DASHBOARD + '/#plan')
    await desk.waitForSelector('.plan-agent .btn--primary')
    await tidyDesk(desk)
    await shot(desk, 'desk-plan-start', { create: ['.plan-agent .btn--primary'] })
    await desk.click('.plan-agent .btn--primary')
    await desk.waitForSelector('.plan-card', { timeout: 60_000 })
    await tidyDesk(desk)
    await shot(desk, 'desk-plan', {
      stats: ['.plan-data'],
      heatmap: ['.plan-data .heatmap'],
      card: ['.plan-card'],
      metric: ['.plan-card .plan-metric'],
      classes: ['.plan-card .plan-classes'],
    }, { full: true })
    await context.close()

    // 다음 가정(중국어 화면): 기관이 덧붙인 안내 → 같은 것을 물으면 그 안내를 인용한 답
    const next = await phone(browser, 'zh')
    await next.context().route('**/agent/chat', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': GUARDIAN }, body: cached.replyAgain }))
    await next.goto(GUARDIAN + `/programs/${PROGRAM}`)
    await next.waitForSelector('.addenda')
    await imagesReady(next)
    const addendaTop = await topFor(next, '.addenda', 150, '#scroll-root')
    await scrollFrames(next, 'zh-detail', '#scroll-root', addendaTop, {
      step: 16,
      first: { title: ['.detail-title'] },
      last: { addenda: ['.addenda'], ask: ['.action-bar .btn--outline'] },
    })
    await next.click('.action-bar .btn--outline')
    await sheetOpen(next)
    await next.locator('dialog[open] button.btn--secondary.btn--block').click()
    await next.waitForSelector('#chat-input')
    await next.waitForTimeout(900)
    await next.fill('#chat-input', ASK_ZH)
    await next.waitForTimeout(300)
    await markSend(next)
    await shot(next, 'zh-chat-typed', { input: ['#chat-input'], send: ['[data-v="send"]'] })
    await next.keyboard.press('Enter')
    await next.waitForSelector('.bot-turn', { timeout: 60_000 })
    await next.waitForTimeout(1200)
    const zhSheet = 'dialog[open] .sheet-body'
    const zhTop = await topFor(next, '.bubble--user', 8, zhSheet)
    await next.evaluate(([sel, top]) => { document.querySelector(sel).scrollTop = top }, [zhSheet, zhTop])
    await next.waitForTimeout(300)
    const citedTop = await bottomFor(next, '.chat-sources blockquote:has(.chat-source-note)', 14, zhSheet)
    await scrollFrames(next, 'zh-chat', zhSheet, Math.max(zhTop, citedTop), {
      step: 18,
      first: { question: ['.bubble--user'], lead: ['.bot-turn .bubble-lead'] },
      last: { lead: ['.bot-turn .bubble-lead'], cited: ['.chat-sources blockquote:has(.chat-source-note)'] },
    })
    await next.context().close()
  } finally {
    await removeAddenda().catch((error) => console.warn('덧붙인 안내를 지우지 못했습니다:', error.message))
    fs.rmSync(QUESTIONS_FILE, { force: true })
    await browser.close()
  }
  for (const [name, entry] of Object.entries(shots)) console.log(name, entry.file ?? `${entry.frames.length} frames`, JSON.stringify(entry.marks), entry.lastMarks ? JSON.stringify(entry.lastMarks) : '')
}

main().catch((error) => { console.error(error); process.exit(1) })
