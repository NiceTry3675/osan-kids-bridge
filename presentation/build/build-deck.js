// 발표자료(1차 심사: 발표 없이 읽히는 덱) 생성. 내용 기준은 ../outline.md, 수치 기준은 ../../research/통계_1차출처_확인_2026-10-17.md
// 실행: npm install && node prepare-assets.js && node build-deck.js  → ../osan-kids-bridge-deck.pptx
// 그림(../assets)에는 실제 기관 포스터와 번역본이 들어가므로 공개 저장소에 올리지 않는다.
const path = require('node:path')
const fs = require('node:fs')
const pptxgen = require('pptxgenjs')
const JSZip = require(require.resolve('jszip', { paths: [require.resolve('pptxgenjs')] }))

const ASSETS = path.resolve(__dirname, '../assets')
const OUT = path.resolve(__dirname, '../osan-kids-bridge-deck.pptx')
const img = (name) => path.join(ASSETS, name)

// 보호자 웹·대시보드와 같은 색: 짙은 숲색(바탕), 행동 초록(강조), 형광펜 노랑은 '확인 필요'에만
const THEME = {
  name: 'Osan Kids Bridge',
  headFontFace: 'Malgun Gothic',
  bodyFontFace: 'Malgun Gothic',
  colors: {
    dk1: '1D2A24', lt1: 'FFFFFF', dk2: '12382B', lt2: 'F3F4EF',
    accent1: '1F7A5C', accent2: 'FFD84D', accent3: '2E8B63', accent4: 'A6D3BD', accent5: 'E4F2EC', accent6: 'B42318',
    hlink: '1F7A5C', folHlink: '18654B',
  },
}
const HEX = THEME.colors
const MUTED = '5C6862'

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE' // 13.333 × 7.5 in
pres.title = '오산 아이 프로그램 — AX 라이프케어'
pres.author = 'osan-kids-bridge 팀'
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace }
const C = pres.SchemeColor
const W = 13.333

// ---------- 레이아웃 ----------
pres.defineSlideMaster({
  title: 'COVER',
  background: { color: HEX.dk2 },
  objects: [
    { placeholder: { options: { name: 'kicker', type: 'body', x: 0.7, y: 0.75, w: 7.2, h: 0.45, fontSize: 14, bold: true, color: C.accent4, margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 1.4, w: 7.2, h: 2.6, fontSize: 38, bold: true, color: C.background1, valign: 'top', margin: 0, lineSpacingMultiple: 1.1 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 4.25, w: 7.0, h: 1.3, fontSize: 18, color: C.accent5, valign: 'top', margin: 0 }, text: '' } },
  ],
})
pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: 'FFFFFF' },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: 'kicker', type: 'body', x: 0.6, y: 0.32, w: 9.5, h: 0.36, fontSize: 13, bold: true, color: C.accent1, margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.68, w: 12.1, h: 0.75, fontSize: 28, bold: true, color: C.text1, valign: 'top', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'source', type: 'body', x: 0.6, y: 6.98, w: 11.2, h: 0.32, fontSize: 10, color: MUTED, margin: 0, valign: 'middle' }, text: '' } },
  ],
  slideNumber: { x: 12.25, y: 6.98, w: 0.5, h: 0.32, fontSize: 10, color: MUTED, align: 'right' },
})

// ---------- 그리기 도구 ----------
let objectCount = 0
const name = (label) => `${label}-${++objectCount}`

function text(slide, value, opts) {
  slide.addText(value, { isTextBox: true, margin: 0, fontSize: 14, color: C.text1, valign: 'top', objectName: name('text'), ...opts })
}

function card(slide, { x, y, w, h, fill = C.background2, line, shadow = false }) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: line ? { color: line, width: 1 } : { type: 'none' },
    shadow: shadow ? { type: 'outer', color: '1D2A24', opacity: 0.12, blur: 8, offset: 2, angle: 90 } : undefined,
    objectName: name('card'),
  })
}

/** 휴대폰 화면 캡처: 어두운 테 + 화면 (750×1624 캡처, 세로 h에 맞춤) */
function phone(slide, file, { x, y, h }) {
  const ratio = 750 / 1624
  const w = h * ratio
  const pad = 0.07
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2, rectRadius: 0.22, fill: { color: C.text1 }, line: { type: 'none' },
    shadow: { type: 'outer', color: '1D2A24', opacity: 0.2, blur: 10, offset: 3, angle: 90 }, objectName: name('phone-frame'),
  })
  slide.addImage({ path: file, x, y, w, h, objectName: name('phone-screen') })
  return w
}

function picture(slide, file, { x, y, w, h, border = true }) {
  if (border) {
    slide.addShape(pres.shapes.RECTANGLE, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, fill: { color: 'FFFFFF' }, line: { color: 'CDD3CC', width: 0.75 }, shadow: { type: 'outer', color: '1D2A24', opacity: 0.14, blur: 8, offset: 2, angle: 90 }, objectName: name('pic-frame') })
  }
  slide.addImage({ path: file, x, y, w, h, objectName: name('picture') })
}

function badge(slide, label, { x, y, size = 0.5, fill = C.accent1, color = C.background1, fontSize = 16 }) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: size, h: size, fill: { color: fill }, line: { type: 'none' }, objectName: name('badge') })
  text(slide, label, { x, y, w: size, h: size, align: 'center', valign: 'middle', fontSize, bold: true, color })
}

function arrow(slide, { x, y, w = 0, h = 0, color = C.accent1, width = 2.25 }) {
  slide.addShape(pres.shapes.LINE, { x, y, w, h, line: { color, width, endArrowType: 'triangle' }, objectName: name('arrow') })
}

function stat(slide, { x, y, w, value, label, color = C.accent1, valueSize = 40 }) {
  // 큰 숫자는 아래에 맞춰 두고, 글자 크기만큼 상자를 위로 키운다
  const h = Math.max(0.75, (valueSize * 1.3) / 72)
  text(slide, value, { x, y: y + 0.75 - h, w, h, fontSize: valueSize, bold: true, color, valign: 'bottom' })
  text(slide, label, { x, y: y + 0.82, w, h: 0.7, fontSize: 14, color: C.text1 })
}

function content(kicker, title, source, section) {
  const slide = pres.addSlide({ masterName: 'CONTENT', sectionTitle: section })
  slide.addText(kicker, { placeholder: 'kicker' })
  slide.addText(title, { placeholder: 'title' })
  if (source) slide.addText(source, { placeholder: 'source' })
  return slide
}

const chartText = { catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt', dataLabelFontFace: '+mn-lt', titleFontFace: '+mn-lt' }

// =========================================================
// 1. 표지
// =========================================================
pres.addSection({ title: '시작' })
{
  const slide = pres.addSlide({ masterName: 'COVER', sectionTitle: '시작' })
  slide.addText('오산시 사회문제 해결을 위한 AX 라이프케어', { placeholder: 'kicker' })
  slide.addText('한국어 포스터에 갇힌\n아이의 기회를\nAI 에이전트가 엽니다', { placeholder: 'title' })
  slide.addText([
    { text: '오산 아이 프로그램', options: { bold: true, color: C.background1, breakLine: true } },
    { text: '다문화가족 보호자를 위한 읽기 → 연결 → 편성', options: {} },
  ], { placeholder: 'body' })
  text(slide, '선우 · 채현 · 소영 · 준현', { x: 0.7, y: 6.55, w: 6, h: 0.4, fontSize: 14, color: C.accent4 })
  // 같은 포스터의 한국어 원본과 AI가 옮긴 베트남어판
  picture(slide, img('poster-kpop-ko.jpg'), { x: 8.35, y: 0.75, w: 2.4, h: 3.39, border: false })
  picture(slide, img('poster-kpop-vi.jpg'), { x: 10.25, y: 2.45, w: 2.55, h: 3.83, border: false })
  text(slide, '한국어 원본', { x: 8.35, y: 4.22, w: 1.85, h: 0.3, fontSize: 12, color: C.accent4 })
  text(slide, 'AI가 옮긴 베트남어판 (디자인 그대로)', { x: 9.0, y: 6.4, w: 3.8, h: 0.3, fontSize: 12, color: C.accent4, align: 'right' })
}

// =========================================================
// 2~5. 문제
// =========================================================
pres.addSection({ title: '문제' })
{
  const slide = content('문제 ① 오산이라는 지역', '오산은 주민 11명 중 1명이 외국인주민인 도시다',
    '출처: 행정안전부 「2024 지방자치단체 외국인주민 현황」(2024.11.1 기준) 설명자료 9·11·22·36·86쪽. 비율의 분모는 인구주택총조사 총인구', '문제')
  stat(slide, { x: 0.6, y: 1.65, w: 4.2, value: '9.3%', label: '오산 총인구 대비 외국인주민 (23,550명)\n전국 5.0%의 1.9배, 경기 6.1%의 1.5배', valueSize: 54 })
  stat(slide, { x: 0.6, y: 3.45, w: 4.2, value: '4,024가구', label: '오산의 다문화가구 (가구원 10,557명)', valueSize: 36 })
  stat(slide, { x: 0.6, y: 5.0, w: 4.2, value: '+23.8%', label: '오산 결혼이민자 2년간 증가 (2022 → 2024)', valueSize: 36 })
  slide.addChart(pres.charts.BAR, [{ name: '외국인주민 비율(%)', labels: ['전국', '경기', '오산'], values: [5.0, 6.1, 9.3] }], {
    x: 5.3, y: 1.55, w: 7.4, h: 2.55, barDir: 'bar', chartColors: ['A6D3BD', 'A6D3BD', '1F7A5C'], ...chartText,
    showTitle: true, title: '총인구 대비 외국인주민 비율(%)', titleFontSize: 13, titleColor: '1D2A24',
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 13, dataLabelColor: '1D2A24', dataLabelFormatCode: '0.0',
    catAxisLabelColor: '1D2A24', catAxisLabelFontSize: 13, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
    showLegend: false, valAxisMinVal: 0, valAxisMaxVal: 11, barGapWidthPct: 60,
  })
  slide.addChart(pres.charts.BAR, [{ name: '오산 외국인주민(명)', labels: ['2022', '2023', '2024'], values: [21046, 22523, 23550] }], {
    x: 5.3, y: 4.25, w: 7.4, h: 2.55, barDir: 'col', chartColors: ['2E8B63'], ...chartText,
    showTitle: true, title: '오산 외국인주민 수 (각 연도 11.1 기준, 명)', titleFontSize: 13, titleColor: '1D2A24',
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 13, dataLabelColor: '1D2A24', dataLabelFormatCode: '#,##0',
    catAxisLabelColor: '1D2A24', catAxisLabelFontSize: 13, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
    showLegend: false, valAxisMinVal: 0, valAxisMaxVal: 27000, barGapWidthPct: 90,
  })
}
{
  const slide = content('문제 ② 보호자의 어려움', '보호자 10명 중 7~8명이 양육에 어려움을 겪고, 큰 벽은 \'정보\'다',
    '출처: 성평등가족부 「2024 전국다문화가족실태조사」 별첨 7·9·11·14쪽(2025.7.31), 교육부 「2026 교육기본통계」(2026.4.1 기준). 양육 어려움은 2021년보다 낮아졌다', '문제')
  const items = [
    ['78.2%', '6~24세 자녀를 둔\n보호자의 양육 어려움'],
    ['21.8%', '그중 1순위 어려움\n\'학업·진학·진로 정보 부족\''],
    ['31.2%', '모임·활동 참여가 어려운\n이유 \'정보 부족\''],
    ['17.2%', '지난 1년 가족센터를\n이용한 비율'],
  ]
  items.forEach(([value, label], index) => {
    const x = 0.6 + index * 3.07
    card(slide, { x, y: 1.6, w: 2.85, h: 2.05, fill: index === 1 || index === 2 ? C.accent5 : C.background2 })
    text(slide, value, { x: x + 0.25, y: 1.78, w: 2.4, h: 0.75, fontSize: 36, bold: true, color: C.accent1 })
    text(slide, label, { x: x + 0.25, y: 2.6, w: 2.45, h: 0.95, fontSize: 14 })
  })
  slide.addChart(pres.charts.BAR, [{ name: '1순위 어려움(%)', labels: ['비용 부담', '학업·진학·진로 정보 부족', '학습지도'], values: [24.9, 21.8, 19.7] }], {
    x: 0.6, y: 3.95, w: 7.0, h: 2.85, barDir: 'bar', chartColors: ['A6D3BD', '1F7A5C', 'A6D3BD'], ...chartText,
    showTitle: true, title: '6~24세 자녀 양육의 1순위 어려움 (상위 3개, %)', titleFontSize: 13, titleColor: '1D2A24',
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 13, dataLabelColor: '1D2A24', dataLabelFormatCode: '0.0',
    catAxisLabelColor: '1D2A24', catAxisLabelFontSize: 13, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
    showLegend: false, valAxisMinVal: 0, valAxisMaxVal: 30, catAxisOrientation: 'maxMin', barGapWidthPct: 55,
  })
  card(slide, { x: 8.0, y: 3.95, w: 4.73, h: 2.85, fill: C.text2 })
  text(slide, '프로그램은 있는데,\n정보가 닿지 않는다', { x: 8.35, y: 4.2, w: 4.1, h: 1.0, fontSize: 22, bold: true, color: C.background1 })
  text(slide, [
    { text: '이주배경학생(구 다문화학생) 21만 838명, 전체 학생의 4.3% (초등학생은 5.3%)', options: { breakLine: true } },
    { text: '진학·진로 정보가 필요한 시기의 아이가 계속 늘고 있다', options: {} },
  ], { x: 8.35, y: 5.25, w: 4.1, h: 1.45, fontSize: 14, color: C.accent5, paraSpaceAfter: 6 })
}
{
  const slide = content('문제 ③ 현장 관찰', '사이트는 번역돼도, 정보가 담긴 포스터는 한국어 이미지 그대로다',
    '출처: 오산시가족센터 누리집 프로그램 신청 화면(팀 캡처, 2026.10), 한국건강가정진흥원 「전국 다문화가족지원센터 통번역 지원사 배치현황」(2025.9.24 데이터)', '문제')
  picture(slide, img('problem-kpop-listing.png'), { x: 0.65, y: 1.65, w: 6.6, h: 3.5 })
  text(slide, '공고 상세: 일정·대상·신청 QR이 모두 포스터 이미지 안에 있다', { x: 0.65, y: 5.28, w: 6.6, h: 0.35, fontSize: 13, color: MUTED })
  picture(slide, img('problem-translated-site.png'), { x: 7.75, y: 1.65, w: 2.9, h: 4.6 })
  text(slide, '화면을 영어로 바꿔도\n포스터는 한국어 그대로', { x: 7.75, y: 6.32, w: 2.9, h: 0.6, fontSize: 13, color: MUTED })
  card(slide, { x: 10.95, y: 1.65, w: 1.8, h: 2.2, fill: C.accent5 })
  text(slide, '1명', { x: 11.1, y: 1.8, w: 1.5, h: 0.65, fontSize: 32, bold: true, color: C.accent1 })
  text(slide, '오산시가족센터 통번역지원사 (베트남어 1개 언어)', { x: 11.1, y: 2.5, w: 1.55, h: 1.25, fontSize: 12 })
  card(slide, { x: 10.95, y: 4.05, w: 1.8, h: 2.2, fill: C.background2 })
  text(slide, '129곳', { x: 11.1, y: 4.2, w: 1.55, h: 0.65, fontSize: 30, bold: true, color: C.accent1 })
  text(slide, '전국 가족센터 221곳 중 1개 언어만 통번역하는 곳', { x: 11.1, y: 4.9, w: 1.55, h: 1.25, fontSize: 12 })
  card(slide, { x: 0.65, y: 5.75, w: 6.6, h: 1.0, fill: C.accent2 })
  text(slide, '보호자는 공고마다 이미지를 열어 일정·대상·신청 방법을 한국어로 읽어야 한다', { x: 0.9, y: 5.85, w: 6.2, h: 0.8, fontSize: 15, bold: true, valign: 'middle' })
}
{
  const slide = content('문제 ④ 양쪽의 단절', '보호자는 못 읽고, 기관은 보호자가 무엇을 모르는지 모른다',
    '출처: 대구광역시 「2026년 민원행정 및 제도개선 추진계획」 7쪽(120 AI 상담 2025.4~12, 11,932건 중 AI 완료 4,503건). 챗봇 화면은 팀이 직접 사용해 캡처', '문제')
  const columns = [
    ['보호자', ['포스터를 읽지 못해 대상·일정을 판단하기 어렵다', '공고에 없는 것(준비물·비용)을 물으려 해도 한국어로 물어야 한다', '자격을 단정한 안내를 그대로 믿을 위험이 있다']],
    ['기관', ['같은 질문이 전화로 반복된다', '공고에서 무엇이 빠졌는지 모른다', '언제·어디서 열어야 많이 올 수 있는지 모른다']],
  ]
  columns.forEach(([title, lines], index) => {
    const x = 0.6 + index * 4.1
    card(slide, { x, y: 1.6, w: 3.85, h: 3.55, fill: index === 0 ? C.accent5 : C.background2 })
    text(slide, title, { x: x + 0.3, y: 1.8, w: 3.3, h: 0.5, fontSize: 20, bold: true, color: C.accent1 })
    text(slide, lines.map((line, i) => ({ text: line, options: { bullet: true, breakLine: i < lines.length - 1 } })), { x: x + 0.3, y: 2.4, w: 3.35, h: 2.6, fontSize: 15, paraSpaceAfter: 8 })
  })
  arrow(slide, { x: 4.47, y: 3.35, w: 0.22, h: 0, color: C.text2 })
  card(slide, { x: 0.6, y: 5.35, w: 7.95, h: 1.45, fill: C.text2 })
  text(slide, '38%', { x: 0.9, y: 5.45, w: 1.9, h: 1.2, fontSize: 40, bold: true, color: C.accent2, valign: 'middle' })
  text(slide, '공공 AI 상담이 스스로 끝낸 비율(대구 120 AI 상담, 2025). 나머지는 상담원 연결(13%)이나 중도 포기(49%)로 끝났다', { x: 2.85, y: 5.5, w: 5.45, h: 1.15, fontSize: 14, color: C.background1, valign: 'middle' })
  picture(slide, img('problem-chatbot.png'), { x: 9.35, y: 1.6, w: 2.95, h: 5.05 })
  text(slide, '기존 공공 AI 챗봇 (팀이 직접 사용)', { x: 8.85, y: 6.68, w: 3.95, h: 0.28, fontSize: 11, color: MUTED, align: 'center' })
}

// =========================================================
// 6~11. 해결: 세 에이전트
// =========================================================
pres.addSection({ title: '해결' })
{
  const slide = content('해결 개요', '세 에이전트가 \'읽기 → 연결 → 편성\'의 순환을 만든다',
    '코드: apps/program-api(src/poster, src/agent), apps/guardian-web, apps/institution-dashboard', '해결')
  const nodes = [
    ['1', '읽기', '포스터 통번역 에이전트', '기관이 올린 한국어 포스터를 디자인 그대로 보호자 언어로. 다른 AI가 다시 읽어 검증하고 틀린 곳만 다시 만든다'],
    ['2', '연결', '상담 에이전트', '공고 사실만으로 보호자 언어로 답하고, 아이 조건을 비교하고, 공고에 없는 건 기관에 보낼 한국어 문장으로'],
    ['3', '편성', '기관 대시보드', '보호자가 공고에서 못 찾은 질문과 익명 수요를 모아, 다음 공고에 적을 것과 요일·시간·장소를 제안'],
  ]
  nodes.forEach(([no, verb, title, body], index) => {
    const x = 0.6 + index * 4.2
    card(slide, { x, y: 1.65, w: 3.75, h: 2.95, fill: index === 1 ? C.accent5 : C.background2, shadow: true })
    badge(slide, no, { x: x + 0.3, y: 1.9, size: 0.62, fontSize: 20 })
    text(slide, verb, { x: x + 1.1, y: 1.9, w: 2.4, h: 0.62, fontSize: 28, bold: true, color: C.accent1, valign: 'middle' })
    text(slide, title, { x: x + 0.3, y: 2.75, w: 3.2, h: 0.45, fontSize: 18, bold: true })
    text(slide, body, { x: x + 0.3, y: 3.3, w: 3.2, h: 1.2, fontSize: 14, color: C.text1 })
    if (index < 2) arrow(slide, { x: x + 3.82, y: 3.12, w: 0.32, h: 0 })
  })
  // 돌아오는 화살표: 편성 → 다음 공고 → 읽기
  slide.addShape(pres.shapes.LINE, { x: 10.47, y: 4.65, w: 0, h: 0.55, line: { color: C.accent1, width: 2.25 }, objectName: name('loop') })
  slide.addShape(pres.shapes.LINE, { x: 2.47, y: 5.2, w: 8.0, h: 0, line: { color: C.accent1, width: 2.25 }, objectName: name('loop') })
  slide.addShape(pres.shapes.LINE, { x: 2.47, y: 4.65, w: 0, h: 0.55, line: { color: C.accent1, width: 2.25, beginArrowType: 'triangle' }, objectName: name('loop') })
  card(slide, { x: 3.2, y: 4.88, w: 6.5, h: 0.64, fill: 'FFFFFF', line: HEX.accent1 })
  text(slide, '라이프케어: 다음 공고가 나아지고, 아이가 자라는 동안 계속된다', { x: 3.3, y: 4.88, w: 6.3, h: 0.64, fontSize: 15, bold: true, color: C.accent1, align: 'center', valign: 'middle' })
  card(slide, { x: 0.6, y: 5.85, w: 12.13, h: 0.9, fill: C.text2 })
  text(slide, [
    { text: '공통 바탕  ', options: { bold: true, color: C.accent2 } },
    { text: '검수된 공고 사실 + 원문 근거 인용 + 기존 판정 규칙. 세 에이전트 모두 이것만 쓰고, 없는 것은 \'확인 필요\'로 남긴다', options: { color: C.background1 } },
  ], { x: 0.9, y: 5.85, w: 11.6, h: 0.9, fontSize: 15, valign: 'middle' })
}
{
  const slide = content('① 읽기 · 포스터 통번역 에이전트', '디자인은 그대로, 글만 보호자 언어로 옮긴다',
    '이미지 편집 gpt-image-2.5-sunburst(OpenAI), 판독·검증 gemini-3.8-flash(Google). 생성과 검증에 서로 다른 모델을 쓴다. 포스터 원본: 오산시가족센터', '해결')
  const steps = ['원본 판독', '문구별 번역표\n+ 숫자 코드 검사', '원본을 넣어\n이미지 편집', 'QR 원본 이식\n+ 재스캔', '다른 AI가 다시\n읽어 검증', '틀린 곳만 재생성\n통과분만 게시']
  steps.forEach((label, index) => {
    const x = 0.6 + index * 2.04
    badge(slide, String(index + 1), { x: x + 0.62, y: 1.6, size: 0.55, fontSize: 18, fill: index === 4 || index === 5 ? C.accent1 : C.accent3 })
    text(slide, label, { x, y: 2.22, w: 1.8, h: 0.75, fontSize: 13, align: 'center', bold: index >= 4 })
    if (index < steps.length - 1) arrow(slide, { x: x + 1.3, y: 1.875, w: 0.65, h: 0, color: C.accent4 })
  })
  picture(slide, img('poster-kpop-ko.jpg'), { x: 0.75, y: 3.25, w: 2.5, h: 3.53 })
  arrow(slide, { x: 3.4, y: 5.0, w: 0.55, h: 0, width: 3 })
  picture(slide, img('poster-kpop-vi.jpg'), { x: 4.1, y: 3.25, w: 2.35, h: 3.53 })
  const points = [
    ['원본을 입력으로', '기관 담당자가 만든 포스터의 그림·배치·색은 그대로 두고 글만 바꾼다. 로고는 바꾸지 않는다'],
    ['번역표가 정답지', '문구별 한국어 ↔ 베트남어 대응표를 먼저 만들고 전화번호·날짜·인원을 코드로 대조한다 (10/19 → 19/10)'],
    ['통과한 것만 게시', '3회 안에 검증을 통과하지 못하면 내보내지 않고 원본과 검수된 다국어 안내를 보여 준다'],
  ]
  points.forEach(([title, body], index) => {
    const y = 3.25 + index * 1.2
    card(slide, { x: 6.95, y, w: 5.8, h: 1.07, fill: index === 1 ? C.accent5 : C.background2 })
    text(slide, title, { x: 7.2, y: y + 0.1, w: 5.3, h: 0.38, fontSize: 15, bold: true, color: C.accent1 })
    text(slide, body, { x: 7.2, y: y + 0.47, w: 5.35, h: 0.58, fontSize: 12 })
  })
}
{
  const slide = content('① 읽기 · 검증 결과', '검증 루프는 실제로 오류를 잡아 고친다',
    '실제 포스터 3장(K-pop 방송댄스, 우리 zip. 운동회, 고등학교 진학설명회) × 베트남어·중국어. 검증 기록: apps/program-api/data/local/translated/*.json (2026-10-17)', '해결')
  text(slide, '시연을 위해 1회차 편집 지시에 날짜 오류를 일부러 넣었다', { x: 0.6, y: 1.6, w: 7.2, h: 0.4, fontSize: 15, bold: true })
  text(slide, '1회차', { x: 0.6, y: 2.12, w: 1.0, h: 0.35, fontSize: 13, bold: true, color: C.accent6 })
  picture(slide, img('crop-date-a1.png'), { x: 1.6, y: 2.1, w: 6.1, h: 0.57 })
  card(slide, { x: 0.6, y: 2.9, w: 7.1, h: 1.65, fill: C.text1 })
  text(slide, [
    { text: '⑤ 검증 (gemini가 결과를 처음부터 다시 읽고 대조)', options: { breakLine: true, color: 'A6D3BD' } },
    { text: '✗ 빠진 날짜 10-31 · 원래 없던 날짜 invalid:10/31/2026', options: { breakLine: true, color: 'FFD84D' } },
    { text: '✗ 다르게 적힘: 기대 "31/10/2026 (T7)" / 보이는 글 "10/31/2026 (T7)"', options: { breakLine: true, color: 'FFD84D' } },
    { text: '③ 이미지 편집 2회차 (직전 결과 + 원본 + 지적 2건)', options: { color: 'FFFFFF' } },
  ], { x: 0.85, y: 3.02, w: 6.7, h: 1.45, fontSize: 12, valign: 'middle' })
  text(slide, '2회차', { x: 0.6, y: 4.8, w: 1.0, h: 0.35, fontSize: 13, bold: true, color: C.accent1 })
  picture(slide, img('crop-date-a2.png'), { x: 1.6, y: 4.78, w: 6.1, h: 0.57 })
  text(slide, '베트남에서 10/31은 \'10일 31월\'로 읽힌다. 코드는 없는 달을 잡아내고, 모델은 문구가 다르게 적힌 것을 잡았다. 2회차에서 31/10으로 고쳐 통과했다', { x: 0.6, y: 5.6, w: 7.1, h: 1.1, fontSize: 14 })
  card(slide, { x: 8.15, y: 1.6, w: 4.6, h: 5.15, fill: C.accent5 })
  text(slide, '6 / 6', { x: 8.45, y: 1.8, w: 4.0, h: 0.85, fontSize: 48, bold: true, color: C.accent1 })
  text(slide, '실제 포스터 3장 × 2개 언어, 모두 검증 통과', { x: 8.45, y: 2.7, w: 4.0, h: 0.4, fontSize: 14, bold: true })
  text(slide, [
    { text: '5건은 1회차에 통과 (한 번에 약 1분)', options: { bullet: true, breakLine: true } },
    { text: '1건은 3회차 통과: 검증 AI가 그대로 둔 로고 글자(성평등가족부)를 옛 이름으로 잘못 읽어 다시 만들었다. 로고 오독은 막지 않도록 규칙을 고쳤다', options: { bullet: true, breakLine: true } },
    { text: 'QR이 있는 포스터 2장: 원본 QR을 옮겨 붙이고 다시 스캔해 주소가 같은지 확인', options: { bullet: true, breakLine: true } },
    { text: '자동 검증만 통과한 결과는 화면에 \'담당자 확인 전\'으로 표시한다', options: { bullet: true } },
  ], { x: 8.45, y: 3.25, w: 4.05, h: 3.4, fontSize: 13, paraSpaceAfter: 7 })
}
{
  const slide = content('② 연결 · 상담 에이전트', '답은 공고에서만, 모르면 기관에 물어볼 한국어 문장까지 만든다',
    '보호자 웹 실제 화면(베트남어, 시연 데이터). 질문: "아이가 8살이에요. 저와 아이가 갈 수 있나요? 준비물이 있나요?" 응답 10~25초', '해결')
  phone(slide, img('app-chat-answer-vi.png'), { x: 0.75, y: 1.6, h: 5.15 })
  phone(slide, img('app-chat-inquiry-vi.png'), { x: 3.45, y: 1.6, h: 5.15 })
  const tools = [
    ['공고 찾기', '학년·나이·가능 시간으로 기존 판정 규칙 그대로'],
    ['공고 사실 읽기', '검수된 사실과 원문 근거. 미상은 \'공고에 없음\''],
    ['아이 조건 비교', '학년·시간은 판정, 자격은 단정하지 않음'],
    ['문의문 작성', '한국어 문장 + 공고에서 확인된 연락처만'],
    ['미해결 질문 표시', '보호자가 누를 때만 이름 없이 기관에 전달'],
    ['답하기', '보호자 언어로, 원문 인용을 붙여서'],
  ]
  text(slide, '에이전트가 고르는 도구 6개', { x: 6.45, y: 1.6, w: 6.2, h: 0.4, fontSize: 16, bold: true, color: C.accent1 })
  tools.forEach(([title, body], index) => {
    const y = 2.1 + index * 0.6
    badge(slide, String(index + 1), { x: 6.45, y: y + 0.06, size: 0.38, fontSize: 12, fill: C.accent3 })
    text(slide, title, { x: 7.0, y, w: 1.9, h: 0.5, fontSize: 14, bold: true, valign: 'middle' })
    text(slide, body, { x: 8.9, y, w: 3.85, h: 0.5, fontSize: 12, valign: 'middle' })
  })
  card(slide, { x: 6.45, y: 5.8, w: 6.3, h: 0.95, fill: C.text2 })
  text(slide, '모델이 단 원문 인용은 코드가 그 공고의 검증된 근거에서 다시 찾아 확인하고, 없으면 버린다', { x: 6.7, y: 5.85, w: 5.85, h: 0.85, fontSize: 14, bold: true, color: C.background1, valign: 'middle' })
}
{
  const slide = content('② 연결 · 차이', '기존 챗봇은 \'문의하세요\'로 끝나고, 우리는 거기서 시작한다',
    '팀 비교: 공공 민원 챗봇의 일반적인 서비스 범위와 이 서비스의 설계를 비교한 것이며 통계가 아니다', '해결')
  const head = (value) => ({ text: value, options: { bold: true, color: C.background1, fill: { color: C.text2 }, fontSize: 15 } })
  const rows = [
    ['답의 근거', '미리 만든 FAQ·안내 문서', '검수된 공고 사실 + 원문 인용 (코드가 다시 확인)'],
    ['공고에 없을 때', '"담당 기관에 문의하세요"', '무엇이 없는지 말하고, 한국어 문의문 + 확인된 연락처'],
    ['언어', '한국어 위주', '보호자가 고른 언어(베트남어·중국어·쉬운 한국어)'],
    ['우리 아이에게 맞는지', '판단하지 않음', '학년·시간은 기존 규칙으로 판정, 자격은 단정하지 않음'],
    ['포스터', '이미지 속 글은 읽지 못함', '포스터를 보호자 언어로 옮기고 검증'],
    ['기관에 돌아가는 것', '없음', '공고에서 답을 못 찾은 질문을 주제별로 집계'],
  ]
  slide.addTable([
    [head(''), head('기존 공공 챗봇'), head('오산 아이 프로그램 상담 에이전트')],
    ...rows.map(([label, before, after], index) => [
      { text: label, options: { bold: true, fill: { color: index % 2 ? 'FFFFFF' : 'F3F4EF' } } },
      { text: before, options: { color: MUTED, fill: { color: index % 2 ? 'FFFFFF' : 'F3F4EF' } } },
      { text: after, options: { bold: true, color: C.accent1, fill: { color: index % 2 ? 'E4F2EC' : 'D6ECE2' } } },
    ]),
  ], { x: 0.6, y: 1.65, w: 12.13, colW: [2.6, 3.9, 5.63], fontSize: 15, rowH: 0.7, valign: 'middle', border: { type: 'solid', color: 'FFFFFF', pt: 2 }, margin: [0.06, 0.15, 0.06, 0.15], objectName: name('compare-table') })
}
{
  const slide = content('③ 편성 · 기관 대시보드', '기관은 보호자가 무엇을 모르는지 보고 다음 공고를 고친다',
    '기관 대시보드 실제 화면. 보호자 질문 탭은 시연용 예시 질문과 보호자 웹에서 들어온 질문을 함께 보여 준다. 수요·추천은 합성 데이터', '해결')
  phone(slide, img('dash-questions.png'), { x: 0.75, y: 1.6, h: 5.15 })
  phone(slide, img('dash-recommend.png'), { x: 3.45, y: 1.6, h: 5.15 })
  const blocks = [
    ['보호자 질문', '보호자가 AI 상담에서 공고로 답을 찾지 못해 \'기관에 알리기\'를 누른 질문을 공고별·주제별로 센다'],
    ['공고에 적을 것', '많이 나온 주제를 \'참가비, 준비물·복장, 형제 동반\'처럼 다음 공고에 적을 항목으로 바꿔 보여 준다'],
    ['일정·장소 추천', '보호자가 익명으로 남긴 가능 요일·시간·동을 모아, 가장 많은 가정이 올 수 있는 조합을 추천한다'],
  ]
  blocks.forEach(([title, body], index) => {
    const y = 1.6 + index * 1.45
    card(slide, { x: 6.45, y, w: 6.3, h: 1.28, fill: index === 1 ? C.accent5 : C.background2 })
    text(slide, title, { x: 6.75, y: y + 0.13, w: 5.8, h: 0.4, fontSize: 17, bold: true, color: C.accent1 })
    text(slide, body, { x: 6.75, y: y + 0.55, w: 5.8, h: 0.68, fontSize: 13 })
  })
  text(slide, '이름·연락처·대화 내용은 받지 않는다. 공고·주제·일반화한 질문·날짜만 받고, 적은 수의 집계는 가린다', { x: 6.45, y: 6.0, w: 6.3, h: 0.7, fontSize: 13, color: MUTED })
}

// =========================================================
// 12~14. 라이프케어·신뢰·실행
// =========================================================
pres.addSection({ title: '라이프케어와 실행' })
{
  const slide = content('라이프케어', '아이가 자라는 동안, 필요한 공고가 바뀌어도 같은 순환이 돈다',
    '6~24세 자녀 보호자의 1순위 어려움 \'학업·진학·진로 정보 부족\' 21.8%(2024 전국다문화가족실태조사). 사진은 실제 오산시가족센터 포스터의 베트남어판', '라이프케어와 실행')
  const stages = [
    ['영유아', '돌봄·어린이집·예방접종 안내', null, '다음 단계'],
    ['초등', '방과후·체험·체육 프로그램', 'poster-sports-vi.jpg', '우리 zip. 운동회'],
    ['초등', '자녀성장 프로그램', 'poster-kpop-vi.jpg', 'K-pop 방송댄스'],
    ['중·고등', '진학설명회·진로 프로그램', 'poster-hs-vi.jpg', '고등학교 진학설명회'],
  ]
  slide.addShape(pres.shapes.LINE, { x: 0.9, y: 2.05, w: 11.6, h: 0, line: { color: C.accent4, width: 3 }, objectName: name('timeline') })
  stages.forEach(([age, need, file, caption], index) => {
    const x = 0.6 + index * 3.07
    badge(slide, '', { x: x + 0.2, y: 1.85, size: 0.4, fill: file ? C.accent1 : C.accent4 })
    text(slide, age, { x: x + 0.75, y: 1.75, w: 2.0, h: 0.55, fontSize: 18, bold: true, color: C.accent1, valign: 'middle' })
    text(slide, need, { x: x + 0.2, y: 2.4, w: 2.7, h: 0.45, fontSize: 13 })
    if (file) {
      const ratio = file.includes('kpop') ? 900 / 1350 : 1
      const h = 2.65
      const w = h * ratio
      picture(slide, img(file), { x: x + 0.2 + (2.65 - w) / 2, y: 3.0, w, h })
      text(slide, caption, { x: x + 0.2, y: 5.72, w: 2.65, h: 0.3, fontSize: 12, color: MUTED, align: 'center' })
    } else {
      card(slide, { x: x + 0.2, y: 3.0, w: 2.65, h: 2.65, fill: C.background2, line: 'CDD3CC' })
      text(slide, '같은 방식으로\n확장할 안내', { x: x + 0.3, y: 3.95, w: 2.45, h: 0.8, fontSize: 14, color: MUTED, align: 'center', valign: 'middle' })
    }
  })
  card(slide, { x: 0.6, y: 6.1, w: 12.13, h: 0.7, fill: C.accent5 })
  text(slide, '공급처 확장: 가족센터 공고 → 학교 가정통신문 → 도서관·청소년센터 → 시청 공지', { x: 0.9, y: 6.1, w: 11.6, h: 0.7, fontSize: 15, bold: true, color: C.accent1, valign: 'middle' })
}
{
  const slide = content('신뢰 설계', 'AI가 틀려도 보호자가 잘못 판단하지 않게 설계했다',
    '기준: 보호자 서비스 명세 v2.2(program_connection_spec_v2_2.md), 구현: apps/program-api, apps/guardian-web', '라이프케어와 실행')
  const items = [
    ['사람이 마지막에 확인', '자동 검증만 통과한 포스터·안내는 \'담당자 확인 전\'으로 표시하고, 승인하면 바뀐다'],
    ['모르는 것은 노란 형광펜', '비용·자격·상담 언어처럼 공고에 없는 것은 확인되지 않았다고 표시한다'],
    ['원본이 바뀌면 내린다', '공고 원문이나 포스터가 바뀌면 승인이 풀려 자동으로 게시가 멈춘다'],
    ['인용은 코드가 다시 확인', '모델이 단 근거 문장이 원문에 없으면 버린다'],
    ['묻지 않는다', '이름·국적·체류 자격·연락처를 묻지 않는다. 아이 학년과 가능한 시간만'],
    ['동의할 때만 전달', '질문은 보호자가 \'기관에 알리기\'를 누를 때만, 이름 없이 일반화해 보낸다'],
  ]
  items.forEach(([title, body], index) => {
    const col = index % 3
    const row = Math.floor(index / 3)
    const x = 0.6 + col * 4.1
    const y = 1.65 + row * 2.1
    card(slide, { x, y, w: 3.85, h: 1.9, fill: row === 0 ? C.background2 : C.accent5 })
    badge(slide, String(index + 1), { x: x + 0.3, y: y + 0.28, size: 0.5, fontSize: 16 })
    text(slide, title, { x: x + 0.95, y: y + 0.28, w: 2.75, h: 0.5, fontSize: 17, bold: true, valign: 'middle' })
    text(slide, body, { x: x + 0.3, y: y + 0.95, w: 3.3, h: 0.85, fontSize: 14 })
  })
  card(slide, { x: 0.6, y: 6.0, w: 12.13, h: 0.8, fill: C.text2 })
  text(slide, '자동 검증은 \'틀렸을 가능성\'을 줄이고, 마지막 판단은 사람과 원문이 한다', { x: 0.9, y: 6.0, w: 11.6, h: 0.8, fontSize: 16, bold: true, color: C.background1, valign: 'middle' })
}
{
  const slide = content('실행 계획', '오산에서 바로 시작할 수 있다',
    '효과를 미리 숫자로 약속하지 않고, 아래 지표로 시범 운영에서 측정한다', '라이프케어와 실행')
  const phases = [
    ['1단계 · 지금', '오산시가족센터', '시연 공고 25건, 실제 포스터 3장 × 2개 언어 검증 완료. 담당자는 지금처럼 포스터를 올리기만 하면 된다'],
    ['2단계', '학교 가정통신문', '진학·진로 정보가 가장 부족한 시기. 화성오산교육지원청과 연계'],
    ['3단계', '시 공공채널', '도서관·청소년센터·시청 공지까지 같은 순환으로'],
  ]
  phases.forEach(([step, title, body], index) => {
    const x = 0.6 + index * 4.2
    card(slide, { x, y: 1.65, w: 3.75, h: 2.6, fill: index === 0 ? C.text2 : C.background2 })
    text(slide, step, { x: x + 0.3, y: 1.85, w: 3.2, h: 0.4, fontSize: 14, bold: true, color: index === 0 ? C.accent4 : C.accent1 })
    text(slide, title, { x: x + 0.3, y: 2.25, w: 3.2, h: 0.5, fontSize: 20, bold: true, color: index === 0 ? C.background1 : C.text1 })
    text(slide, body, { x: x + 0.3, y: 2.85, w: 3.2, h: 1.3, fontSize: 13, color: index === 0 ? C.accent5 : C.text1 })
    if (index < 2) arrow(slide, { x: x + 3.82, y: 2.95, w: 0.32, h: 0 })
  })
  text(slide, '시범 운영에서 잴 것', { x: 0.6, y: 4.55, w: 6, h: 0.45, fontSize: 18, bold: true, color: C.accent1 })
  const kpis = [
    ['과업 성공률', '보호자가 공고를 읽고 대상·일정·다음 행동을 스스로 설명하는 비율'],
    ['문의 전환', '공고에 없는 질문이 문의문·전화로 이어진 비율'],
    ['미해결 질문 감소', '공고 보완 뒤 같은 주제의 질문이 줄어든 정도'],
    ['충원율', '추천한 요일·시간·장소로 연 프로그램의 신청 대비 정원'],
  ]
  kpis.forEach(([title, body], index) => {
    const x = 0.6 + index * 3.07
    card(slide, { x, y: 5.1, w: 2.85, h: 1.7, fill: C.accent5 })
    text(slide, title, { x: x + 0.22, y: 5.25, w: 2.45, h: 0.4, fontSize: 16, bold: true, color: C.accent1 })
    text(slide, body, { x: x + 0.22, y: 5.7, w: 2.45, h: 1.0, fontSize: 12 })
  })
}

// =========================================================
// 15. 마무리
// =========================================================
pres.addSection({ title: '마무리' })
{
  const slide = pres.addSlide({ masterName: 'COVER', sectionTitle: '마무리' })
  slide.addText('2분 시연 영상과 함께 제출합니다', { placeholder: 'kicker' })
  slide.addText([
    { text: '읽기 · 연결 · 편성', options: { breakLine: true } },
    { text: '아이가 자라는 동안 계속 도는', options: { fontSize: 32, breakLine: true } },
    { text: '오산의 AX 라이프케어', options: { fontSize: 32 } },
  ], { placeholder: 'title' })
  slide.addText([
    { text: '포스터 통번역 → 상담 → 보호자 질문 → 다음 공고', options: { breakLine: true } },
    { text: 'github.com/NiceTry3675/osan-kids-bridge', options: { color: C.accent4 } },
  ], { placeholder: 'body' })
  const team = [['선우', '문제 근거·통계'], ['채현', '공고 확보·개인정보'], ['소영', '보호자 서비스·UX'], ['준현', 'LLM 구조화·에이전트·대시보드']]
  team.forEach(([who, role], index) => {
    const y = 1.45 + index * 1.15
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.6, y, w: 4.1, h: 0.95, rectRadius: 0.12, fill: { color: '1F4D3D' }, line: { type: 'none' }, objectName: name('team') })
    text(slide, who, { x: 8.9, y, w: 1.0, h: 0.95, fontSize: 20, bold: true, color: C.background1, valign: 'middle' })
    text(slide, role, { x: 9.9, y, w: 2.7, h: 0.95, fontSize: 14, color: C.accent5, valign: 'middle' })
  })
}

// ---------- 저장 + 테마 색 ----------
async function applyTheme(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file))
  const part = 'ppt/theme/theme1.xml'
  let xml = await zip.file(part).async('string')
  for (const [slot, hex] of Object.entries(THEME.colors)) {
    xml = xml.replace(new RegExp(`<a:${slot}>[\\s\\S]*?</a:${slot}>`), `<a:${slot}><a:srgbClr val="${hex}"/></a:${slot}>`)
  }
  xml = xml.replace(/<a:clrScheme name="[^"]*">/, `<a:clrScheme name="${THEME.name}">`).replace(/<a:theme ([^>]*?)name="[^"]*"/, `<a:theme $1name="${THEME.name}"`)
  zip.file(part, xml)
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

pres.writeFile({ fileName: OUT }).then(async () => {
  await applyTheme(OUT)
  console.log(`저장: ${OUT}`)
})
