// 발표 자료용 화면 캡처 (headless Chrome). 먼저 API(8787)·보호자 웹(5173)·기관 대시보드(5174)를 띄운다.
// node capture.js [all|home|detail|chat|journey|dashboard|plan]  (dashboard·plan은 관리자 API가 켜진 npm run demo를 새로 띄운 상태에서)
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')

const OUT = path.resolve(__dirname, '../assets')
const GUARDIAN = 'http://127.0.0.1:5173'
const DASHBOARD = 'http://127.0.0.1:5174'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const which = process.argv[2] ?? 'all'
/** 편성 도우미의 실제 결과를 한 번 받아 두는 파일. 발표자료 캡처와 시연영상이 같은 편성안을 쓴다(지우면 다시 받음) */
const PLAN_FIXTURE = path.resolve(__dirname, 'render/plan-result.json')

async function phone(browser, locale, { intro = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  await context.addInitScript(([value, showIntro]) => {
    localStorage.setItem('osan-guardian-locale', value)
    if (!showIntro) localStorage.setItem('osan-guardian-intro-seen', '1')
    localStorage.setItem('osan-dashboard-locale', 'ko-easy')
  }, [locale, intro])
  return context.newPage()
}

/** 보호자 여정: 조건 넣기(만 8세, 토요일 09:00~14:00) → 맞는 공고 목록 → 운동회 상세의 '기관에 확인할 점'. 언어별로 같은 화면 */
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
  await page.screenshot({ path: path.join(OUT, `app-${tag}-home.png`) })
  await page.click('.fit-card')
  await page.waitForSelector('dialog[open] .legend-link')
  await page.click('dialog[open] .legend-link')
  await page.fill('dialog[open] .input--short', '8')
  const times = page.locator('dialog[open] .time-row input[type=time]')
  await times.nth(0).fill('09:00')
  await times.nth(1).fill('14:00')
  await page.click('dialog[open] .time-row .btn--secondary')
  await page.waitForTimeout(300)
  await page.evaluate(() => { const body = document.querySelector('dialog[open] .sheet-body'); const row = document.querySelector('dialog[open] .time-row'); if (body && row) body.scrollTop = row.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 260 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, `app-${tag}-condition.png`) })
  await page.click('dialog[open] .sheet-foot button[type=submit]')
  await page.waitForSelector('.item-match')
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `app-${tag}-results-top.png`) })
  await page.evaluate(() => { const card = document.querySelector('a.item[href="/programs/osan-fc-sports-day"]'); if (card) window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 230) })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `app-${tag}-results.png`) })
  await page.click('a.item[href="/programs/osan-fc-sports-day"]')
  await page.waitForSelector('.detail-title')
  await page.evaluate(() => { const el = document.querySelector('.to-check'); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12) })
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
      const page = await phone(browser, 'vi')
      await page.goto(GUARDIAN + '/programs/osan-fc-sports-day')
      await page.click('.ai-entry')
      await page.fill('#chat-input', 'Con tôi 8 tuổi. Tôi và con đi được không? Có cần chuẩn bị gì không?')
      await page.keyboard.press('Enter')
      await page.waitForSelector('.bot-turn', { timeout: 90_000 })
      await page.waitForTimeout(600)
      const shoot = async (selector, file, offset = 12) => {
        await page.evaluate(([sel, off]) => {
          const body = document.querySelector('dialog[open] .sheet-body')
          const el = document.querySelector(sel)
          body.scrollTop = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - off
        }, [selector, offset])
        await page.waitForTimeout(300)
        await page.screenshot({ path: path.join(OUT, file) })
      }
      await shoot('.bubble--user', 'app-chat-answer-vi.png', 120)
      if (await page.$('.chat-inquiry')) await shoot('.chat-inquiry', 'app-chat-inquiry-vi.png', 60)
      const report = await page.$('.chat-unanswered .btn')
      if (report) { await report.click(); await page.waitForSelector('.unanswered-sent'); await shoot('.chat-unanswered', 'app-chat-reported-vi.png', 60) }
    }
    if (which === 'all' || which === 'journey') {
      await journey(browser, 'ko-easy')
      await journey(browser, 'vi')
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
  } finally {
    await browser.close()
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
