// 발표 자료용 이미지 준비: 포스터 원본·번역본 축소, 검증 장면 확대 조각, 조사 캡처 변환. 결과는 ../assets (공개 저장소에 올리지 않음)
const sharp = require('sharp')
const path = require('node:path')
const fs = require('node:fs')

const ROOT = path.resolve(__dirname, '../..')
const LOCAL = path.join(ROOT, 'apps/program-api/data/local')
const OUT = path.resolve(__dirname, '../assets')
fs.mkdirSync(OUT, { recursive: true })

const posters = [
  ['inbox/osan-fc-kpop-dance/poster.jpg', 'poster-kpop-ko.jpg'],
  ['translated/osan-fc-kpop-dance.vi.png', 'poster-kpop-vi.jpg'],
  ['translated/osan-fc-kpop-dance.zh.png', 'poster-kpop-zh.jpg'],
  ['inbox/osan-fc-sports-day/poster.jpg', 'poster-sports-ko.jpg'],
  ['translated/osan-fc-sports-day.vi.png', 'poster-sports-vi.jpg'],
  ['translated/osan-fc-sports-day.vi.attempt-1.png', 'poster-sports-vi-a1.jpg'],
  ['translated/osan-fc-sports-day.zh.png', 'poster-sports-zh.jpg'],
  ['inbox/osan-fc-high-school-info/poster.png', 'poster-hs-ko.jpg'],
  ['translated/osan-fc-high-school-info.vi.png', 'poster-hs-vi.jpg'],
]

async function main() {
  for (const [from, to] of posters) {
    await sharp(path.join(LOCAL, from)).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 86 }).toFile(path.join(OUT, to))
  }
  // 검증 장면: 1회차(일부러 넣은 날짜 오류)와 2회차(고친 결과)의 '일시' 줄
  // 회차마다 배치가 조금씩 달라 줄의 높이(top)를 따로 둔다
  for (const [from, to, top] of [['translated/osan-fc-sports-day.vi.attempt-1.png', 'crop-date-a1.png', 0.565], ['translated/osan-fc-sports-day.vi.attempt-2.png', 'crop-date-a2.png', 0.533]]) {
    const file = path.join(LOCAL, from)
    const { width, height } = await sharp(file).metadata()
    await sharp(file).extract({ left: Math.round(width * 0.02), top: Math.round(height * top), width: Math.round(width * 0.64), height: Math.round(height * 0.06) }).resize({ width: 1100 }).png().toFile(path.join(OUT, to))
  }
  // 조사 폴더의 기존 서비스 캡처 (webp → png)
  const research = path.join(ROOT, 'research/기존서비스문제')
  for (const [from, to] of [['035157cf29478378.webp', 'problem-kpop-listing.png'], ['e6fe6097a071267b.webp', 'problem-translated-site.png'], ['5b82eb926b204881.webp', 'problem-chatbot.png']]) {
    await sharp(path.join(research, from)).png().toFile(path.join(OUT, to))
  }
  for (const name of fs.readdirSync(OUT).sort()) {
    const { width, height } = await sharp(path.join(OUT, name)).metadata()
    console.log(name.padEnd(30), `${width}x${height}`)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
