// 발표 자료용 이미지 준비: 포스터 원본·번역본 축소, 검증 장면 확대 조각, 조사 캡처 변환. 결과는 ../assets (공개 저장소에 올리지 않음)
const sharp = require('sharp')
const path = require('node:path')
const fs = require('node:fs')
const JSZip = require(require.resolve('jszip', { paths: [require.resolve('pptxgenjs')] }))

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
  await sharp(path.join(research, '035157cf29478378.webp')).png().toFile(path.join(OUT, 'problem-kpop-listing.png'))
  // 다누리 번역 화면과 경기도 이주민 포털 챗봇은 팀원 자료(기존서비스_분석.pptx)에 같은 화면의 고해상도판(약 1.8배)이 있어 그것을 쓴다
  // (1번 슬라이드 그림 = image1, 3번 슬라이드 그림 = image4). 자료가 없으면 예전 webp를 쓴다
  const teamDeck = path.join(research, '기존서비스_분석.pptx')
  const zip = fs.existsSync(teamDeck) ? await JSZip.loadAsync(fs.readFileSync(teamDeck)) : null
  for (const [media, fallback, to] of [['ppt/media/image1.png', 'e6fe6097a071267b.webp', 'problem-translated-site.png'], ['ppt/media/image4.png', '5b82eb926b204881.webp', 'problem-chatbot.png']]) {
    const entry = zip?.file(media)
    const input = entry ? await entry.async('nodebuffer') : path.join(research, fallback)
    await sharp(input).png().toFile(path.join(OUT, to))
  }
  // 기관 화면 캡처(capture.js, 2880px 폭)에서 발표자료에 쓸 부분만 잘라 둔다: 검수 화면의 세 칸, 공고 보완 도우미, AI 편성 제안
  for (const [from, to, box] of [
    ['dash-improve-drafts.png', 'dash-improve-crop.png', { left: 1195, top: 36, width: 1620, height: 1325 }],
    ['dash-review.png', 'dash-review-crop.png', { left: 562, top: 266, width: 2253, height: 1397 }],
    // AI 편성 제안(capture.js plan, 1440×1300): 왼쪽 익명 통계 카드, 오른쪽 편성안 카드(제목~근거)
    ['dash-plan-full.png', 'dash-plan-data-crop.png', { left: 564, top: 308, width: 919, height: 1060 }],
    ['dash-plan-full.png', 'dash-plan-card-crop.png', { left: 1555, top: 1000, width: 1224, height: 1425 }],
  ]) {
    const file = path.join(OUT, from)
    if (fs.existsSync(file)) await sharp(file).extract(box).png().toFile(path.join(OUT, to))
    else console.warn(`${from}이 없어 ${to}를 만들지 않았습니다. node capture.js 다음에 이 스크립트를 한 번 더 실행하세요.`)
  }
  for (const name of fs.readdirSync(OUT).sort()) {
    const { width, height } = await sharp(path.join(OUT, name)).metadata()
    console.log(name.padEnd(30), `${width}x${height}`)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
