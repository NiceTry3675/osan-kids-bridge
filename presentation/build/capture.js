// 발표 자료용 화면 캡처 (headless Chrome). 먼저 API(8787)·보호자 웹(5173)·기관 대시보드(5174)를 띄운다.
// node capture.js [all|home|detail|chat|dashboard]
const { chromium } = require('playwright-core')
const path = require('node:path')

const OUT = path.resolve(__dirname, '../assets')
const GUARDIAN = 'http://127.0.0.1:5173'
const DASHBOARD = 'http://127.0.0.1:5174'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const which = process.argv[2] ?? 'all'

async function phone(browser, locale) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  await context.addInitScript((value) => {
    localStorage.setItem('osan-guardian-locale', value)
    localStorage.setItem('osan-guardian-intro-seen', '1')
    localStorage.setItem('osan-dashboard-locale', 'ko-easy')
  }, locale)
  return context.newPage()
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
    if (which === 'all' || which === 'dashboard') {
      const page = await phone(browser, 'ko-easy')
      await page.goto(DASHBOARD + '/')
      await page.waitForSelector('#tab-questions')
      // headless 캡처에서 반투명 흐림(backdrop-filter)이 탭 막대 글자를 지워 버려, 캡처할 때만 끈다
      await page.addStyleTag({ content: '.tabbar { backdrop-filter: none !important; background: #fff !important; }' })
      await page.screenshot({ path: path.join(OUT, 'dash-demand.png') })
      await page.click('#tab-questions')
      await page.waitForSelector('.question-program')
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(OUT, 'dash-questions.png') })
      await page.click('#tab-recommend')
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(OUT, 'dash-recommend.png') })
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
