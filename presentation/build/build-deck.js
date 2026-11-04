// 발표자료(1차 심사: 발표 없이 읽히는 덱) 생성. 내용 기준은 ../outline.md, 수치 기준은 ../../research/통계_1차출처_확인_2026-10-17.md
// 실행: npm install && node prepare-assets.js && node capture.js && node prepare-assets.js && node build-deck.js  → ../osan-kids-bridge-deck.pptx (순서와 서버 준비는 ../README.md)
// 그림(../assets)에는 실제 기관 포스터와 번역본이 들어가므로 공개 저장소에 올리지 않는다.
// 문체: 제목은 명사로 끝나는 짧은 구절, 본문은 한 줄에 정보 하나인 개조식. '~다'로 끝내지 않는다.
// 용어: 사람은 '부모님', 가구·통계는 '가정'('보호자'는 기술 장의 구성요소 이름 '보호자 웹'과 앱 캡처 속 글자에만). 나라·국적은 쓰지 않고,
// 언어 이름(베트남어·중국어)은 그 언어 화면을 보일 때만, 그 밖에는 '편한 언어'. 통계는 원문 용어 그대로(외국인주민·다문화가구·결혼이민자)
const path = require('node:path')
const fs = require('node:fs')
const pptxgen = require('pptxgenjs')
const JSZip = require(require.resolve('jszip', { paths: [require.resolve('pptxgenjs')] }))

const ASSETS = path.resolve(__dirname, '../assets')
// DECK_QA=1: 맥에서 Quick Look으로 미리 보기 위한 사본(글꼴만 맥에 있는 애플 SD 산돌고딕 Neo로 바꿈)
const QA = process.env.DECK_QA === '1'
const OUT = QA ? path.resolve(__dirname, 'render/deck-qa.pptx') : path.resolve(__dirname, '../osan-kids-bridge-deck.pptx')
const img = (name) => path.join(ASSETS, name)
/** PNG의 세로/가로 비율 (IHDR의 폭·높이). 캡처를 다시 찍어 크기가 바뀌어도 그림이 늘어나지 않게 */
/** capture.js가 남긴 캡처 속 요소의 자리(비율). 없으면 각 슬라이드의 기본값을 쓴다 */
const MARKS = (() => { try { return JSON.parse(fs.readFileSync(img('marks.json'), 'utf8')) } catch { return {} } })()
const ratioOf = (name) => { const head = fs.readFileSync(img(name)).subarray(16, 24); return head.readUInt32BE(4) / head.readUInt32BE(0) }
/** 편성 도우미의 실제 결과(capture.js plan이 받아 둔 것). 13번(편성)의 숫자를 캡처와 같은 결과에서 읽는다 */
const PLAN_RESULT = (() => {
  try { return JSON.parse(fs.readFileSync(path.resolve(__dirname, 'render/plan-result.json'), 'utf8')) } catch { return null }
})()
const PLAN = PLAN_RESULT?.proposals?.[0] ?? null
/** 편성 통계의 모집단(시연용 가상 응답 가정 수). 결과의 data_note('시연용 가상 응답 400가정 · …')에서 읽는다 */
const PLAN_TOTAL = Number(/(\d+)가정/.exec(PLAN_RESULT?.data_note ?? '')?.[1] ?? 400)
/** 편성 결과 한 줄: 지금처럼 → 편성안의 닿는 비율 (없으면 null) */
const planCoverage = () => (PLAN && PLAN.baseline && PLAN.baseline.coverage_pct !== null && PLAN.coverage_pct !== null ? `${PLAN.baseline.coverage_pct}% → ${PLAN.coverage_pct}%` : null)
/** 시연영상이 쓰는 실제 상담 답·공고 보완 초안(record-demo.js가 받아 둔 것). 16번 '실제 실행 한 번' 줄을 영상과 같은 실행에서 읽는다 */
const RUN = (() => {
  try {
    const cached = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'render/prefetch.json'), 'utf8'))
    return { reply: JSON.parse(cached.reply), improve: JSON.parse(cached.improve) }
  } catch { return null }
})()
const TOOL_KO = { search_programs: '공고 찾기', get_program: '공고 읽기', check_fit: '조건 비교', flag_unanswered: '미해결 표시', draft_inquiry: '문의문' }
/** 상담: 실제로 부른 도구 순서(같은 도구 연속은 한 번) → 답, 원문에서 다시 찾은 인용 수 */
const consultRun = () => {
  if (!RUN) return '공고 읽기 → 조건 비교 → 미해결 표시 → 문의문 → 답'
  const tools = RUN.reply.steps.map((step) => TOOL_KO[step.tool] ?? step.tool).filter((label, index, all) => index === 0 || label !== all[index - 1])
  return `${[...tools, '답'].join(' → ')}, 인용 ${RUN.reply.citations.length}개 원문 확인`
}
/** 공고 보완: 검사 결과와 항목 구성(덧붙일 안내는 값이 빈칸, 이미 공고에 있는 것) */
const improveRun = () => {
  if (!RUN) return '공고·질문 읽기 → 검사 → 제출, 값은 빈칸'
  const check = RUN.improve.steps.find((step) => step.tool === 'check_draft')
  const add = RUN.improve.items.filter((item) => item.kind === 'add_notice')
  const already = RUN.improve.items.length - add.length
  const blanks = add.every((item) => item.blanks.length > 0) ? `안내 ${add.length}개 모두 값은 빈칸` : `안내 ${add.length}개`
  return `공고·질문 읽기 → 검사(문제 ${check?.problems ?? 0}) → 제출, ${blanks}${already ? `, ${already}개는 공고에 이미 있음` : ''}`
}
/** 편성: 도구 호출 수(통계 읽기·편성 계산), 검사 결과, 닿는 비율. 비율은 시연용 가상 응답 기준이라 그렇게 밝힌다 */
const planRun = () => {
  const coverage = planCoverage()
  const tail = coverage ? `, ${coverage}(가상 응답 기준)` : ', 가상 응답 기준'
  const steps = PLAN_RESULT?.steps
  if (!steps) return `도구 → 검사 → 제출${tail}`
  const count = (tool) => steps.filter((step) => step.tool === tool).length
  const check = steps.find((step) => step.tool === 'check_plan')
  return `도구 ${steps.length}번(통계 ${count('read_demand')}·계산 ${count('simulate_plan')} 포함) → 검사(문제 ${check?.problems ?? 0}) → 제출${tail}`
}

// 따뜻한 색: 크림 바탕에 흰 카드, 짙은 숲색(결론 상자), 행동 초록(해결), 테라코타(문제·오류), 햇살 노랑(실제 사례)
// 보호자 웹·대시보드의 초록과 같은 계열이고, 시연영상(record-demo.js)의 크림·코랄과 맞춘다
const THEME = {
  name: 'Osan Kids Bridge Warm',
  headFontFace: 'Malgun Gothic',
  bodyFontFace: 'Malgun Gothic',
  colors: {
    dk1: '3A2F2A', lt1: 'FFFFFF', dk2: '2F5446', lt2: 'FFFFFF',
    accent1: '2E7D5B', accent2: 'F7D27A', accent3: '5BA37E', accent4: 'C9E3D2', accent5: 'E7F1E8', accent6: 'D2643C',
    hlink: '2E7D5B', folHlink: '25664A',
  },
}
const HEX = THEME.colors
const MUTED = '7A6B62'
const CREAM = 'FBF6EE'
const PEACH = 'FBE3D3'
const SAND = 'F3E8DA'
const LINE = 'E6D8C6'
const SUN = 'FDF1CF' // 햇살 노랑을 옅게 (표의 '실제 실행' 줄)

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE' // 13.333 × 7.5 in
pres.title = '잇다, 오산 — 다문화 자녀 프로그램 연결 및 참여환경 개선 서비스'
pres.author = '팀 다담'
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace }
const C = pres.SchemeColor
const W = 13.333

// ---------- 레이아웃 ----------
pres.defineSlideMaster({
  title: 'COVER',
  background: { color: CREAM },
  objects: [
    { placeholder: { options: { name: 'kicker', type: 'body', x: 0.7, y: 0.8, w: 7.2, h: 0.45, fontSize: 15, bold: true, color: C.accent6, margin: 0, align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 1.45, w: 7.2, h: 2.6, fontSize: 40, bold: true, color: C.text1, valign: 'top', margin: 0, lineSpacingMultiple: 1.1, align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 4.3, w: 7.0, h: 1.3, fontSize: 18, color: MUTED, valign: 'top', margin: 0, align: 'left' }, text: '' } },
  ],
})
pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: CREAM },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: 'kicker', type: 'body', x: 0.6, y: 0.32, w: 9.5, h: 0.36, fontSize: 13, bold: true, color: C.accent1, margin: 0, align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.68, w: 12.1, h: 0.75, fontSize: 28, bold: true, color: C.text1, valign: 'top', margin: 0, align: 'left' }, text: '' } },
    // 출처는 한 줄(맑은 고딕 10pt 기준 상자 폭의 95% 안쪽). 쪽 번호(x 12.25) 앞까지 쓴다
    { placeholder: { options: { name: 'source', type: 'body', x: 0.6, y: 6.98, w: 11.5, h: 0.32, fontSize: 10, color: MUTED, margin: 0, valign: 'middle', align: 'left' }, text: '' } },
  ],
  slideNumber: { x: 12.25, y: 6.98, w: 0.5, h: 0.32, fontSize: 10, color: MUTED, align: 'right' },
})

// ---------- 그리기 도구 ----------
let objectCount = 0
const name = (label) => `${label}-${++objectCount}`
const softShadow = Object.freeze({ type: 'outer', color: '3A2F2A', opacity: 0.08, blur: 10, offset: 2, angle: 90 })

function text(slide, value, opts) {
  slide.addText(value, { isTextBox: true, margin: 0, fontSize: 14, color: C.text1, valign: 'top', objectName: name('text'), ...opts })
}

/** 둥근 카드. 기본은 크림 바탕 위의 흰 카드(옅은 그림자). dash면 테두리를 점선으로(아직 만들지 않은 것) */
function card(slide, { x, y, w, h, fill = C.background2, line, dash = false, shadow = true }) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.16, fill: { color: fill }, line: line ? { color: line, width: 1, ...(dash ? { dashType: 'dash' } : {}) } : { type: 'none' },
    // pptxgenjs가 shadow 객체의 값을 그 자리에서 EMU로 바꿔 쓰므로 카드마다 새 객체를 넘긴다 (같은 객체를 다시 쓰면 값이 계속 곱해져 파일이 깨짐)
    shadow: shadow ? { ...softShadow } : undefined, objectName: name('card'),
  })
}

/** 휴대폰 화면 캡처: 어두운 테 + 화면 (750×1624 캡처, 세로 h에 맞춤) */
function phone(slide, file, { x, y, h }) {
  const ratio = 750 / 1624
  const w = h * ratio
  const pad = 0.07
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2, rectRadius: 0.22, fill: { color: C.text1 }, line: { type: 'none' },
    shadow: { type: 'outer', color: '3A2F2A', opacity: 0.2, blur: 10, offset: 3, angle: 90 }, objectName: name('phone-frame'),
  })
  slide.addImage({ path: file, x, y, w, h, objectName: name('phone-screen') })
  return w
}

function picture(slide, file, { x, y, w, h, border = true }) {
  if (border) {
    slide.addShape(pres.shapes.RECTANGLE, { x: x - 0.05, y: y - 0.05, w: w + 0.1, h: h + 0.1, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 0.75 }, shadow: { type: 'outer', color: '3A2F2A', opacity: 0.12, blur: 10, offset: 2, angle: 90 }, objectName: name('pic-frame') })
  }
  slide.addImage({ path: file, x, y, w, h, objectName: name('picture') })
}

function badge(slide, label, { x, y, size = 0.5, fill = C.accent1, color = C.background1, fontSize = 16 }) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: size, h: size, fill: { color: fill }, line: { type: 'none' }, objectName: name('badge') })
  text(slide, label, { x, y, w: size, h: size, align: 'center', valign: 'middle', fontSize, bold: true, color })
}

function arrow(slide, { x, y, w = 0, h = 0, color = C.accent1, width = 2.25, both = false }) {
  slide.addShape(pres.shapes.LINE, { x, y, w, h, line: { color, width, endArrowType: 'triangle', ...(both ? { beginArrowType: 'triangle' } : {}) }, objectName: name('arrow') })
}

/** 화살촉 없는 선 (되돌아가는 고리 등) */
function rule(slide, { x, y, w = 0, h = 0, color = C.accent1, width = 2, dash = false, begin = false }) {
  slide.addShape(pres.shapes.LINE, { x, y, w, h, line: { color, width, ...(dash ? { dashType: 'dash' } : {}), ...(begin ? { beginArrowType: 'triangle' } : {}) }, objectName: name('rule') })
}

/** 그림 위에 겹쳐 그리는 강조 테두리 */
function outline(slide, { x, y, w, h, color = C.accent6 }) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { type: 'none' }, line: { color, width: 2.25 }, objectName: name('outline') })
}

/** 배경의 큰 원 (따뜻한 장식) */
function blob(slide, { x, y, size, color = PEACH }) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: size, h: size, fill: { color }, line: { type: 'none' }, objectName: name('blob') })
}

function stat(slide, { x, y, w, value, label, color = C.accent1, valueSize = 40 }) {
  // 큰 숫자는 아래에 맞춰 두고, 글자 크기만큼 상자를 위로 키운다(맑은 고딕 한 줄 높이 ≈ 글자 크기의 1.33배)
  const h = Math.max(0.75, (valueSize * 1.35) / 72)
  text(slide, value, { x, y: y + 0.75 - h, w, h, fontSize: valueSize, bold: true, color, valign: 'bottom' })
  text(slide, label, { x, y: y + 0.82, w, h: 0.7, fontSize: 14, color: C.text1 })
}

/** 문제 파트는 테라코타, 해결 파트는 초록으로 머리말 색을 나눈다 */
function content(kicker, title, source, section, { problem = false } = {}) {
  const slide = pres.addSlide({ masterName: 'CONTENT', sectionTitle: section })
  // 자리 표시자의 서식(초록)이 addText 옵션을 덮어쓰므로, 문제 파트의 색은 글자(run)에 준다
  slide.addText([{ text: kicker, options: problem ? { color: C.accent6 } : {} }], { placeholder: 'kicker' })
  slide.addText(title, { placeholder: 'title' })
  if (source) slide.addText(source, { placeholder: 'source' })
  return slide
}

const chartText = { catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt', dataLabelFontFace: '+mn-lt', titleFontFace: '+mn-lt' }
const chartBase = {
  ...chartText, titleFontSize: 13, titleColor: HEX.dk1, showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 13, dataLabelColor: HEX.dk1,
  catAxisLabelColor: HEX.dk1, catAxisLabelFontSize: 13, valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false,
  catAxisLineShow: false, plotArea: { fill: { color: 'FFFFFF' } },
}

// =========================================================
// 1. 표지
// =========================================================
pres.addSection({ title: '시작' })
{
  const slide = pres.addSlide({ masterName: 'COVER', sectionTitle: '시작' })
  blob(slide, { x: 6.55, y: -0.9, size: 7.2 })
  blob(slide, { x: -1.2, y: 5.6, size: 2.6, color: 'E7F1E8' })
  slide.addText('오산시 사회문제 해결을 위한 AX 라이프케어', { placeholder: 'kicker' })
  // 서비스 이름을 크게, 그 아래에 한 줄 소개(두 줄로 나눠 오른쪽 순환 그림과 겹치지 않게)
  slide.addText([
    { text: '잇다, 오산', options: { fontSize: 60, breakLine: true } },
    { text: '부모님의 질문이', options: { fontSize: 30, color: C.accent1, breakLine: true } },
    { text: '다음 프로그램이 되는 곳', options: { fontSize: 30, color: C.accent1 } },
  ], { placeholder: 'title' })
  slide.addText([
    { text: '다문화 자녀 프로그램 연결 및 참여환경 개선 서비스', options: { bold: true, color: C.text1, fontSize: 16, breakLine: true } },
    { text: '부모님과 기관을 잇는 AI 에이전트 4개', options: { fontSize: 16, breakLine: true } },
    { text: '① 포스터 통번역 · ② 상담 · ③ 공고 보완 · ④ 편성', options: { fontSize: 14, color: C.accent1 } },
  ], { placeholder: 'body' })
  text(slide, [{ text: '팀 다담', options: { bold: true, color: C.accent1 } }, { text: ' · 임준현 · 이선우 · 김채현 · 박소영' }], { x: 0.7, y: 6.55, w: 5.3, h: 0.4, fontSize: 14, color: MUTED })
  // 오른쪽: 순환 한 바퀴. 위는 보호자 휴대폰(세 언어), 아래는 기관 대시보드(보호자 질문에 '추가 안내로 답함')
  const h = 3.0
  const w = h * (750 / 1624)
  const phones = [['app-ko-intro.png', '쉬운 한국어'], ['app-vi-results-top.png', 'Tiếng Việt'], ['app-loop-addenda-zh.png', '中文']]
  phones.forEach(([file, label], index) => {
    const x = 6.5 + index * (w + 0.42)
    phone(slide, img(file), { x, y: 0.8, h })
    text(slide, label, { x: x - 0.25, y: 3.93, w: w + 0.5, h: 0.3, fontSize: 12, bold: true, color: C.accent1, align: 'center' })
  })
  const desk = { x: 9.35, y: 4.6, w: 3.6, h: 3.6 * ratioOf('dash-loop-answered.png') }
  picture(slide, img('dash-loop-answered.png'), desk)
  card(slide, { x: desk.x + 0.12, y: desk.y - 0.2, w: 1.35, h: 0.34, fill: C.text2, shadow: false })
  text(slide, '기관 대시보드', { x: desk.x + 0.12, y: desk.y - 0.2, w: 1.35, h: 0.34, fontSize: 11, bold: true, color: C.background1, align: 'center', valign: 'middle' })
  // 보호자 → 기관: 휴대폰 오른쪽에서 나와 대시보드 위로 내려간다
  const right = 6.5 + 3 * w + 2 * 0.42
  rule(slide, { x: right + 0.12, y: 2.05, w: 12.55 - right - 0.12, color: C.accent6, width: 2.5 })
  arrow(slide, { x: 12.55, y: 2.05, h: desk.y - 0.12 - 2.05, color: C.accent6, width: 2.5 })
  text(slide, [{ text: '못 찾은', options: { breakLine: true } }, { text: '질문·조건' }], { x: right + 0.08, y: 2.2, w: 12.45 - right - 0.08, h: 0.62, fontSize: 12.5, bold: true, color: C.accent6, align: 'right' })
  // 기관 → 보호자: 대시보드 왼쪽에서 나와 휴대폰 아래로 올라간다 (선은 위에서 아래로 그리고 화살촉을 시작점에)
  const back = 6.5 + w / 2
  rule(slide, { x: back, y: 5.95, w: desk.x - 0.12 - back, color: C.accent1, width: 2.5 })
  rule(slide, { x: back, y: 4.3, h: 5.95 - 4.3, color: C.accent1, width: 2.5, begin: true })
  text(slide, [{ text: '덧붙인 안내·', options: { breakLine: true } }, { text: '다음 프로그램' }], { x: back + 0.14, y: 5.2, w: desk.x - back - 0.24, h: 0.62, fontSize: 12.5, bold: true, color: C.accent1 })
  // 보호자 조건은 아직 모으지 않는다(조건 통계는 시연용 가상 응답)
  text(slide, '조건은 아직 수집하지 않음 · 조건 통계는 시연용 가상 400가정, 질문 수는 시연용 예시', { x: 6.2, y: 7.2, w: 6.75, h: 0.24, fontSize: 9, color: MUTED, align: 'right' })
}

// =========================================================
// 2~5. 문제
// =========================================================
pres.addSection({ title: '문제' })
{
  const slide = content('문제 ① 오산이라는 지역', '주민 11명 중 1명이 외국인주민인 도시, 오산',
    // 2022·2023년 외국인주민 수(21,046·22,523명)는 2023년판 원문에서 확인
    '출처: 행정안전부 「지방자치단체 외국인주민 현황」 2024년판(2024.11.1 기준) 보도자료·설명자료, 2022·2023년 값은 2023년판. 분모는 인구주택총조사 총인구', '문제', { problem: true })
  stat(slide, { x: 0.6, y: 1.65, w: 4.2, value: '9.3%', label: '오산 총인구 대비 외국인주민 (23,550명)\n전국 5.0%의 1.9배, 경기 6.1%의 1.5배', valueSize: 54, color: C.accent6 })
  stat(slide, { x: 0.6, y: 3.45, w: 4.2, value: '4,024가구', label: '오산의 다문화가구 (가구원 10,557명)', valueSize: 36, color: C.accent6 })
  stat(slide, { x: 0.6, y: 5.0, w: 4.2, value: '+23.8%', label: '오산 결혼이민자 2년간 증가 (2022 → 2024)', valueSize: 36, color: C.accent6 })
  card(slide, { x: 5.2, y: 1.5, w: 7.55, h: 5.35 })
  slide.addChart(pres.charts.BAR, [{ name: '외국인주민 비율(%)', labels: ['전국', '경기', '오산'], values: [5.0, 6.1, 9.3] }], {
    x: 5.35, y: 1.6, w: 7.25, h: 2.5, barDir: 'bar', chartColors: [SAND, SAND, HEX.accent6], ...chartBase,
    showTitle: true, title: '총인구 대비 외국인주민 비율(%)', dataLabelFormatCode: '0.0', valAxisMinVal: 0, valAxisMaxVal: 11, barGapWidthPct: 60,
  })
  slide.addChart(pres.charts.BAR, [{ name: '오산 외국인주민(명)', labels: ['2022', '2023', '2024'], values: [21046, 22523, 23550] }], {
    x: 5.35, y: 4.2, w: 7.25, h: 2.55, barDir: 'col', chartColors: ['E59A78'], ...chartBase,
    showTitle: true, title: '오산 외국인주민 수 (각 연도 11.1 기준, 명)', dataLabelFormatCode: '#,##0', valAxisMinVal: 0, valAxisMaxVal: 27000, barGapWidthPct: 90,
  })
}
{
  const slide = content('문제 ② 부모님의 어려움', '양육이 어려운 부모님 78.2%, 벽은 비용과 정보',
    '출처: 여성가족부(현 성평등가족부) 「2024 전국다문화가족실태조사」 별첨 7·9·11·14쪽, 교육부 「2026 교육기본통계」(2026.4.1 기준). 양육 어려움은 2021년보다 감소', '문제', { problem: true })
  // 21.8%는 1순위 어려움 중 비용 부담(24.9%) 다음 2위. 제목의 '비용과 정보'는 1·2위를 함께 가리킨다
  const items = [
    ['78.2%', '6~24세 자녀를 둔\n부모님의 양육 어려움'],
    ['21.8%', '1순위 어려움 중 비용 다음\n\'학업·진학·진로 정보 부족\''],
    ['31.2%', '모임·활동 참여가 어려운\n이유 \'정보 부족\''],
    ['17.2%', '지난 1년 가족센터를\n이용한 비율'],
  ]
  items.forEach(([value, label], index) => {
    const x = 0.6 + index * 3.07
    card(slide, { x, y: 1.6, w: 2.85, h: 2.05, fill: index === 1 || index === 2 ? PEACH : C.background2 })
    text(slide, value, { x: x + 0.25, y: 1.78, w: 2.4, h: 0.75, fontSize: 36, bold: true, color: C.accent6 })
    text(slide, label, { x: x + 0.25, y: 2.6, w: 2.5, h: 0.95, fontSize: 14 })
  })
  card(slide, { x: 0.6, y: 3.95, w: 7.0, h: 2.85 })
  slide.addChart(pres.charts.BAR, [{ name: '1순위 어려움(%)', labels: ['비용 부담', '학업·진학·진로 정보 부족', '학습지도'], values: [24.9, 21.8, 19.7] }], {
    x: 0.75, y: 4.05, w: 6.75, h: 2.65, barDir: 'bar', chartColors: [SAND, HEX.accent6, SAND], ...chartBase,
    showTitle: true, title: '6~24세 자녀 양육의 1순위 어려움 (상위 3개, %)', dataLabelFormatCode: '0.0',
    valAxisMinVal: 0, valAxisMaxVal: 30, catAxisOrientation: 'maxMin', barGapWidthPct: 55,
  })
  card(slide, { x: 8.0, y: 3.95, w: 4.73, h: 2.85, fill: C.text2 })
  text(slide, '프로그램은 있는데,\n닿지 않는 정보', { x: 8.35, y: 4.2, w: 4.1, h: 1.0, fontSize: 22, bold: true, color: C.background1 })
  text(slide, [
    { text: '이주배경학생(구 다문화학생) 21만 838명', options: { breakLine: true } },
    { text: '전체 학생의 4.3%, 초등학생은 5.3%', options: { breakLine: true } },
    { text: '진학·진로 정보가 필요한 아이도 함께 증가', options: {} },
  ], { x: 8.35, y: 5.25, w: 4.2, h: 1.45, fontSize: 14, color: C.accent5, paraSpaceAfter: 6 })
}
{
  const slide = content('문제 ③ 현장 관찰', '화면은 번역돼도, 포스터는 한국어 그대로',
    '출처: 오산시가족센터 누리집 화면(팀 캡처, 2026.10), 다누리 오산시가족센터 게시판(2026.10.17 확인), 한국건강가정진흥원 통번역 지원사 배치현황(2025.9.24)', '문제', { problem: true })
  picture(slide, img('problem-kpop-listing.png'), { x: 0.65, y: 1.65, w: 6.6, h: 3.5 })
  text(slide, '공고 상세: 일정·대상·신청 QR이 모두 포스터 이미지 안', { x: 0.65, y: 5.28, w: 6.6, h: 0.35, fontSize: 13, color: MUTED })
  picture(slide, img('problem-translated-site.png'), { x: 7.75, y: 1.65, w: 2.9, h: 4.6 })
  text(slide, '화면을 영어로 바꿔도\n포스터는 한국어 그대로', { x: 7.75, y: 6.32, w: 2.9, h: 0.6, fontSize: 13, color: MUTED })
  card(slide, { x: 10.95, y: 1.65, w: 1.8, h: 2.2, fill: PEACH })
  text(slide, '1명', { x: 11.1, y: 1.8, w: 1.5, h: 0.65, fontSize: 32, bold: true, color: C.accent6 })
  text(slide, [{ text: '오산시가족센터', options: { breakLine: true } }, { text: '통번역지원사', options: { breakLine: true } }, { text: '1개 언어만 지원', options: {} }], { x: 11.1, y: 2.5, w: 1.6, h: 1.25, fontSize: 12 })
  card(slide, { x: 10.95, y: 4.05, w: 1.8, h: 2.2 })
  text(slide, '129곳', { x: 11.1, y: 4.2, w: 1.55, h: 0.65, fontSize: 30, bold: true, color: C.accent6 })
  text(slide, [{ text: '전국 가족센터', options: { breakLine: true } }, { text: '221곳 중', options: { breakLine: true } }, { text: '1개 언어만', options: { breakLine: true } }, { text: '통번역하는 곳', options: {} }], { x: 11.1, y: 4.9, w: 1.6, h: 1.25, fontSize: 12 })
  card(slide, { x: 0.65, y: 5.75, w: 6.6, h: 1.0, fill: C.accent2, shadow: false })
  // 다누리 사실은 '프로그램안내 게시판'으로 좁혀 쓴다 (공지사항에는 10·11월 계획 이미지가 있음). 검증: research/기존서비스문제/검증_기존서비스분석_2026-10-17.md
  text(slide, [
    { text: '공고마다 포스터 속 한국어를 직접 읽어야 하는 부모님', options: { bold: true, fontSize: 16, breakLine: true } },
    { text: '다누리의 오산 센터 프로그램안내는 8.12 글이 마지막, 다국어게시판은 0건', options: { fontSize: 12.5 } },
  ], { x: 0.9, y: 5.8, w: 6.2, h: 0.9, valign: 'middle' })
}
{
  // 문제 파트의 중심 장: 보호자와 기관 사이에서 끊긴 두 방향. 해결(6번)의 순환 그림과 같은 자리에 같은 방향으로 그린다
  const slide = content('문제 ④ 핵심 · 양쪽의 단절', '묻지 못한 부모님, 무엇이 빠졌는지 모르는 기관',
    '출처: 대구광역시 「2026년 민원행정 및 제도개선 추진계획」 7쪽(120 음성 AI 상담, 2025.4~12, AI 완료 4,503건/11,932건). 챗봇 화면: 경기도 이주민 포털(팀 캡처)', '문제', { problem: true })
  const columns = [
    // 근거 없는 경향('믿기 쉽다')으로 단정하지 않고 위험으로 쓴다
    ['부모님', ['한국어 포스터만으로는 대상·일정 판단이 어려움', '공고에 없는 것(준비물·비용)도 한국어로 물어야 함', '자격을 단정한 안내를 그대로 믿을 위험']],
    ['기관', ['같은 질문이 전화로 반복', '공고에 무엇이 빠졌는지 알기 어려움', '언제·어디서 열어야 많이 올지 알기 어려움']],
  ]
  const colW = 3.45
  const colX = [0.6, 6.0]
  columns.forEach(([title, lines], index) => {
    const x = colX[index]
    card(slide, { x, y: 1.6, w: colW, h: 3.2, fill: index === 0 ? PEACH : C.background2 })
    text(slide, title, { x: x + 0.3, y: 1.78, w: 2.9, h: 0.5, fontSize: 20, bold: true, color: C.accent6 })
    text(slide, lines.map((line, i) => ({ text: line, options: { bullet: { indent: 14 }, breakLine: i < lines.length - 1 } })), { x: x + 0.3, y: 2.35, w: colW - 0.5, h: 2.35, fontSize: 14.5, paraSpaceAfter: 8 })
  })
  // 가운데: 양쪽으로 가야 할 것이 끊긴 자리 (점선 + ✕)
  const gapL = colX[0] + colW + 0.12
  const gapR = colX[1] - 0.12
  const breaks = [
    { y: 2.75, label: ['몰랐던 것 ·', '묻지 못한 것'], toRight: true },
    { y: 4.15, label: ['빠진 안내 ·', '맞는 시간'], toRight: false },
  ]
  for (const { y, label, toRight } of breaks) {
    text(slide, [{ text: label[0], options: { breakLine: true } }, { text: label[1] }], { x: gapL, y: y - 0.72, w: gapR - gapL, h: 0.52, fontSize: 12, bold: true, color: C.accent6, align: 'center' })
    slide.addShape(pres.shapes.LINE, {
      x: gapL, y, w: gapR - gapL, h: 0, objectName: name('break'),
      line: { color: 'E59A78', width: 2.5, dashType: 'dash', ...(toRight ? { endArrowType: 'triangle' } : { beginArrowType: 'triangle' }) },
    })
    badge(slide, '✕', { x: (gapL + gapR) / 2 - 0.2, y: y - 0.2, size: 0.4, fill: C.accent6, fontSize: 14 })
  }
  // 이 장의 결론: 다음 장(해결)의 순환이 바로 이 두 방향을 잇는다
  card(slide, { x: 0.6, y: 4.98, w: 8.85, h: 0.78, fill: C.text2 })
  text(slide, '부모님이 몰랐던 것, 묻지 못한 것이 기관에 닿지 않음', { x: 0.9, y: 4.98, w: 8.3, h: 0.78, fontSize: 19, bold: true, color: C.background1, valign: 'middle' })
  card(slide, { x: 0.6, y: 5.92, w: 8.85, h: 0.92, fill: SAND, shadow: false })
  text(slide, '38%', { x: 0.85, y: 5.92, w: 1.35, h: 0.92, fontSize: 30, bold: true, color: C.accent6, valign: 'middle' })
  // 챗봇 전반이 아니라 대구 120 '음성' AI 상담(3개 분야) 한 사례로 좁혀 쓴다. 셋째 줄은 같은 원문의 나머지 비율(13% + 49%)만 묶는다
  text(slide, [
    { text: '대구 120콜센터 음성 AI 상담이 스스로 끝낸 비율', options: { bold: true, breakLine: true } },
    { text: '차량등록·여권 등 3개 분야, 2025.4~12, 11,932건', options: { breakLine: true } },
    { text: 'AI만으로 끝나지 않은 상담 62%: 상담원 연결 13%, 중도 포기 49%', options: { bold: true, color: C.accent6 } },
  ], { x: 2.2, y: 5.94, w: 7.1, h: 0.88, fontSize: 12, valign: 'middle' })
  // 챗봇은 답만 보인다(prepare-assets.js가 팀이 친 질문 말풍선을 잘라 냄: 질문에 나라가 들어 있어서). 무엇을 물었는지는 위 한 줄로 요약
  text(slide, [
    { text: '팀이 물은 것: ', options: { bold: true } },
    { text: '오산에서 가장 가까운', options: { breakLine: true } },
    { text: '다문화 가족 한국어 강의 장소' },
  ], { x: 9.6, y: 1.6, w: 3.45, h: 0.52, fontSize: 11, color: MUTED, align: 'center' })
  picture(slide, img('problem-chatbot-answer.png'), { x: 9.725, y: 2.22, w: 3.2, h: 3.2 * ratioOf('problem-chatbot-answer.png') })
  text(slide, '경기도 이주민 포털 챗봇의 답 (팀이 직접 사용)', { x: 9.6, y: 6.4, w: 3.45, h: 0.3, fontSize: 11, color: MUTED, align: 'center' })
}

// =========================================================
// 6~14. 해결: 순환(6), 보호자 화면(7), 네 에이전트(8~13, 12는 순환 한 바퀴의 실제 화면), 사람이 확정(14)
// =========================================================
pres.addSection({ title: '해결' })
{
  // 순환을 먼저: 보호자(왼쪽) → 질문·조건 → 기관(오른쪽) → 덧붙인 안내·다음 프로그램 → 다음 보호자. 에이전트는 그 위의 자리로 설명한다
  // 5번(양쪽의 단절)과 같은 배치: 끊겼던 두 방향을 여기서 잇는다
  const slide = content('해결 개요 · AI 에이전트 4개', '질문이 기관에 닿아, 공고와 다음 프로그램이 바뀌는 순환',
    '코드: apps/program-api(src/poster, src/agent, src/admin), packages/planning(편성 계산), apps/guardian-web, apps/institution-dashboard', '해결')
  const top = 1.6
  const nodeH = 3.75
  // 에이전트 번호는 덱 전체에서 ① 포스터 통번역 · ② 상담 · ③ 공고 보완 · ④ 편성. 단계는 읽기(①) · 연결(②) · 편성(③④)
  // 왼쪽: 보호자 쪽의 두 에이전트 (읽기 단계 ① 입구, 연결 단계 ② 질문으로)
  card(slide, { x: 0.6, y: top, w: 4.0, h: nodeH, fill: PEACH })
  text(slide, '부모님', { x: 0.9, y: top + 0.18, w: 3.5, h: 0.48, fontSize: 21, bold: true, color: C.accent6 })
  text(slide, '쉬운 한국어 · Tiếng Việt · 中文', { x: 0.9, y: top + 0.66, w: 3.5, h: 0.32, fontSize: 13, bold: true, color: C.text1 })
  text(slide, '지금 3개 언어, 같은 방식으로 늘릴 수 있음', { x: 0.9, y: top + 0.98, w: 3.5, h: 0.3, fontSize: 11, color: MUTED })
  const guardianAgents = [
    ['1', '읽기 단계', '포스터 통번역', '입구: 읽을 수 있어야 물을 수 있음\n디자인 그대로 글만 편한 언어로'],
    ['2', '연결 단계', '상담', '모르는 것을 질문으로, 공고 사실로만 답\n없는 것은 기관에 물을 한국어 문장'],
  ]
  guardianAgents.forEach(([no, stage, title, body], index) => {
    const y = top + 1.45 + index * 1.12
    card(slide, { x: 0.8, y, w: 3.6, h: 1.0, fill: C.background2, shadow: false })
    badge(slide, no, { x: 0.95, y: y + 0.12, size: 0.38, fontSize: 13, fill: C.accent3 })
    text(slide, [{ text: `${stage} · `, options: { color: C.accent6 } }, { text: title }], { x: 1.43, y: y + 0.1, w: 2.9, h: 0.38, fontSize: 14, bold: true, color: C.accent1, valign: 'middle' })
    text(slide, body, { x: 1.43, y: y + 0.5, w: 2.92, h: 0.46, fontSize: 10.5 })
  })
  // 오른쪽: 기관이 바뀌는 곳 — 번역 앱·FAQ 챗봇과 다른 부분. 편성 단계 한 테 안에 ③ 공고 보완 · ④ 편성 두 에이전트
  const rx = 8.73
  card(slide, { x: rx, y: top, w: 4.0, h: nodeH, fill: C.text2 })
  text(slide, '기관 담당자', { x: rx + 0.3, y: top + 0.18, w: 1.75, h: 0.48, fontSize: 21, bold: true, color: C.background1 })
  text(slide, '기관이 바뀌는 곳', { x: rx + 2.05, y: top + 0.18, w: 1.75, h: 0.48, fontSize: 13, bold: true, color: C.accent4, align: 'right', valign: 'middle' })
  card(slide, { x: rx + 0.3, y: top + 0.72, w: 3.4, h: 0.32, fill: C.accent2, shadow: false })
  text(slide, '차별점 · 번역 앱·FAQ 챗봇에 없는 부분', { x: rx + 0.3, y: top + 0.72, w: 3.4, h: 0.32, fontSize: 11, bold: true, color: C.text1, align: 'center', valign: 'middle' })
  // 편성 단계의 테: 두 에이전트 카드를 함께 감싼다
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: rx + 0.1, y: top + 1.1, w: 3.8, h: 2.55, rectRadius: 0.12, fill: { type: 'none' }, line: { color: HEX.accent2, width: 1.25, dashType: 'dash' }, objectName: name('stage-frame'),
  })
  text(slide, '편성 단계 · 에이전트 2개', { x: rx + 0.25, y: top + 1.12, w: 3.5, h: 0.3, fontSize: 11.5, bold: true, color: C.accent2, valign: 'middle' })
  const institutionAgents = [
    ['3', '공고 보완', '못 찾은 질문 → 덧붙일 안내 초안\n값은 빈칸, 담당자가 채워 확정'],
    ['4', '편성', '조건 통계 → 다음 프로그램 편성안\n언제·어디서·숫자는 코드가 계산'],
  ]
  institutionAgents.forEach(([no, title, body], index) => {
    const y = top + 1.45 + index * 1.1
    card(slide, { x: rx + 0.2, y, w: 3.6, h: 1.0, fill: '3B6555', shadow: false })
    badge(slide, no, { x: rx + 0.35, y: y + 0.12, size: 0.38, fontSize: 13, fill: C.accent6 })
    text(slide, title, { x: rx + 0.83, y: y + 0.1, w: 2.9, h: 0.38, fontSize: 14, bold: true, color: C.accent2, valign: 'middle' })
    text(slide, body, { x: rx + 0.83, y: y + 0.5, w: 2.92, h: 0.46, fontSize: 10.5, color: C.background1 })
  })
  // 가운데: 두 방향. 보호자 → 기관(질문은 실제, 조건 통계는 시연용 가상 → 점선), 기관 → 다음 보호자
  const mx = 4.75
  const mw = rx - 0.15 - mx
  const flows = [
    { y: 2.35, title: '못 찾은 질문', note: "'기관에 알리기'를 누를 때만, 이름 없이", toRight: true, color: C.accent6, dash: false },
    { y: 3.35, title: '아이 조건 익명 통계', note: '시연은 가상 응답 400가정, 실제 집계는 다음 단계', toRight: true, color: C.accent6, dash: true },
    { y: 4.6, title: '덧붙인 안내 · 다음 프로그램', note: '다음 가정이 같은 질문에 바로 답을 받음', toRight: false, color: C.accent1, dash: false },
  ]
  for (const { y, title, note, toRight, color, dash } of flows) {
    text(slide, title, { x: mx, y: y - 0.42, w: mw, h: 0.36, fontSize: 15, bold: true, color, align: 'center' })
    slide.addShape(pres.shapes.LINE, {
      x: mx, y, w: mw, h: 0, objectName: name('flow'),
      line: { color, width: 3, ...(dash ? { dashType: 'dash' } : {}), ...(toRight ? { endArrowType: 'triangle' } : { beginArrowType: 'triangle' }) },
    })
    text(slide, note, { x: mx, y: y + 0.08, w: mw, h: 0.3, fontSize: 10.5, color: MUTED, align: 'center' })
  }
  card(slide, { x: 0.6, y: 5.6, w: 12.13, h: 0.55, fill: C.accent5, shadow: false })
  text(slide, '라이프케어: 아이가 자라는 동안 질문은 계속, 공고와 프로그램은 점점 가정에 맞게', { x: 0.9, y: 5.6, w: 11.6, h: 0.55, fontSize: 14, bold: true, color: C.accent1, align: 'center', valign: 'middle' })
  card(slide, { x: 0.6, y: 6.25, w: 12.13, h: 0.62, fill: SAND, shadow: false })
  text(slide, '공통 바탕', { x: 0.85, y: 6.25, w: 1.2, h: 0.62, fontSize: 13, bold: true, color: C.accent6, valign: 'middle' })
  // 에이전트끼리 서로 부르지 않는다: 저장된 공고 사실·질문·통계·덧붙인 안내로만 이어진다
  text(slide, [
    { text: '검수된 공고 사실 + 원문 근거 인용 + 기존 판정 규칙, 없는 것은 \'확인 필요\'로', options: { breakLine: true } },
    { text: '에이전트끼리 서로 부르지 않고, 저장된 질문·통계·덧붙인 안내로만 이어짐', options: {} },
  ], { x: 2.05, y: 6.25, w: 10.5, h: 0.62, fontSize: 11.5, valign: 'middle' })
}
{
  // 한 보호자의 여정을 세 언어로 나눠 보인다: 같은 화면이 쉬운 한국어·베트남어·중국어로 (제공하지 않는 언어는 보이지 않는다)
  const slide = content('부모님 화면 · 같은 화면, 세 언어', '아는 것만 넣으면, 우리 아이에게 맞는 공고까지',
    '실제 화면(시연 데이터). 1·2번 화면 쉬운 한국어, 3번 베트남어, 4번 중국어. 넣는 조건(학년·시간·동·관심 분야)은 편성 통계와 같은 항목(지금은 저장하지 않음)', '해결')
  blob(slide, { x: 3.9, y: 1.1, size: 5.8, color: 'E7F1E8' })
  const steps = [
    ['app-ko-intro.png', '쉬운 한국어', '언어부터 고르기', '이름·주소·국적은 묻지 않음'],
    ['app-ko-condition.png', '쉬운 한국어', '아는 것만 입력', '아이 나이, 가능한 요일·시간'],
    ['app-vi-results-top.png', 'Tiếng Việt', '맞는 공고만', '맞는 이유 ✓, 번역 포스터 썸네일'],
    ['app-zh-detail.png', '中文', '우리 아이와 비교', '맞는 것 ✓, 모르는 것은 ?로'],
  ]
  const y = 1.78
  const h = 4.3
  const w = h * (750 / 1624)
  const gap = 1.1
  const left = (W - (w * steps.length + gap * (steps.length - 1))) / 2
  steps.forEach(([file, language, title, note], index) => {
    const x = left + index * (w + gap)
    phone(slide, img(file), { x, y, h })
    // 휴대폰 화면 왼쪽 위(뒤로·정보 아이콘)를 가리지 않게 모서리 바깥쪽으로
    badge(slide, String(index + 1), { x: x - 0.28, y: y - 0.34, size: 0.44, fontSize: 14, fill: C.accent6 })
    // 화면 언어 표시: 휴대폰 위쪽 가운데의 작은 꼬리표
    card(slide, { x: x + w / 2 - 0.62, y: y - 0.36, w: 1.24, h: 0.28, fill: language === '쉬운 한국어' ? SAND : C.accent5, shadow: false })
    text(slide, language, { x: x + w / 2 - 0.62, y: y - 0.36, w: 1.24, h: 0.28, fontSize: 11, bold: true, color: language === '쉬운 한국어' ? C.text1 : C.accent1, align: 'center', valign: 'middle' })
    text(slide, title, { x: x - 0.3, y: 6.2, w: w + 0.6, h: 0.32, fontSize: 14, bold: true, color: C.accent1, align: 'center' })
    text(slide, note, { x: x - 0.5, y: 6.52, w: w + 1.0, h: 0.3, fontSize: 11, color: MUTED, align: 'center' })
    if (index < steps.length - 1) arrow(slide, { x: x + w + 0.22, y: y + h / 2, w: gap - 0.44, h: 0, color: C.accent6 })
  })
}
{
  // 포스터 통번역은 순환의 입구: 원본과 두 언어 결과를 나란히, 검증 루프는 짧게(옛 8·9번을 한 장으로)
  const slide = content('읽기 단계 · ① 포스터 통번역 에이전트', '디자인은 그대로, 글만 편한 언어로',
    '실제 포스터: 오산시가족센터 운동회. 이미지 편집 gpt-image-2.5-sunburst(OpenAI), 판독·검증 gemini-3.8-flash(Google). 검증 기록: data/local/translated/*.json', '해결')
  const size = 2.55
  const posters = [
    ['poster-sports-ko.jpg', '한국어 원본', false, 0.65],
    ['poster-sports-vi.jpg', 'Tiếng Việt', true, 3.72],
    ['poster-sports-zh.jpg', '中文', true, 6.55],
  ]
  for (const [file, label, translated, x] of posters) {
    picture(slide, img(file), { x, y: 1.62, w: size, h: size })
    text(slide, label, { x, y: 4.27, w: size, h: 0.3, fontSize: 12.5, bold: translated, color: translated ? C.accent1 : MUTED, align: 'center' })
  }
  arrow(slide, { x: 0.65 + size + 0.12, y: 1.62 + size / 2, w: 3.72 - 0.65 - size - 0.24, width: 3, color: C.accent6 })
  // 순환의 입구: 읽을 수 있어야 물을 수 있다 (제목 오른쪽 끝의 꼬리표)
  card(slide, { x: 9.5, y: 0.82, w: 3.25, h: 0.42, fill: PEACH, shadow: false })
  text(slide, '입구 · 읽을 수 있어야 물을 수 있음', { x: 9.5, y: 0.82, w: 3.25, h: 0.42, fontSize: 12.5, bold: true, color: C.accent6, align: 'center', valign: 'middle' })
  // 아래: 일부러 넣은 날짜 오류를 검증이 잡고 고친 기록 (운동회 베트남어판, 같은 포스터)
  card(slide, { x: 0.65, y: 4.72, w: 8.45, h: 2.05 })
  text(slide, '시연용으로 1회차 편집 지시에 날짜 오류를 일부러 넣은 기록', { x: 0.9, y: 4.84, w: 8.0, h: 0.36, fontSize: 14, bold: true })
  const crops = [
    ['1회차', 'crop-date-a1.png', C.accent6, '✕ 검증이 잡음: 베트남어로 10/31은 \'10일 31월\''],
    ['2회차', 'crop-date-a2.png', C.accent1, '✓ 31/10으로 고쳐 검증 통과'],
  ]
  crops.forEach(([label, file, color, note], index) => {
    const y = 5.27 + index * 0.6
    text(slide, label, { x: 0.9, y, w: 0.75, h: 0.42, fontSize: 13, bold: true, color, valign: 'middle' })
    picture(slide, img(file), { x: 1.65, y, w: 4.5, h: 4.5 * (102 / 1100) })
    text(slide, note, { x: 6.35, y: y - 0.06, w: 2.7, h: 0.54, fontSize: 11, bold: true, color, valign: 'middle' })
  })
  text(slide, '코드는 없는 달(31월)을, 다른 AI는 다르게 적힌 문구를 잡음 · 나머지 5건은 1회차 통과 4, 3회차 통과 1', { x: 0.9, y: 6.44, w: 8.0, h: 0.28, fontSize: 10.5, color: MUTED })
  // 오른쪽: 6건 모두 통과 + 검증 루프 6단계
  card(slide, { x: 9.5, y: 1.55, w: 3.25, h: 5.25, fill: C.accent5 })
  text(slide, '6 / 6', { x: 9.75, y: 1.68, w: 2.8, h: 0.75, fontSize: 40, bold: true, color: C.accent1 })
  text(slide, [{ text: '실제 포스터 3장 × 2개 언어', options: { breakLine: true } }, { text: '모두 검증 통과' }], { x: 9.75, y: 2.45, w: 2.85, h: 0.55, fontSize: 12.5, bold: true })
  const steps = [
    ['원본 판독', '포스터 속 글을 문구 단위로'],
    ['문구별 번역표', '숫자·날짜·전화는 코드 대조'],
    ['원본을 넣어 글만 편집', '그림·배치·색·로고는 그대로'],
    ['QR 원본 이식', '다시 스캔해 같은 주소인지'],
    ['다른 AI가 다시 읽어 검증', '생성과 검증에 서로 다른 모델'],
    ['틀린 곳만 다시 생성', '최대 3회, 통과한 것만 게시'],
  ]
  steps.forEach(([title, body], index) => {
    const y = 3.15 + index * 0.6
    badge(slide, String(index + 1), { x: 9.72, y: y + 0.04, size: 0.34, fontSize: 11.5, fill: index >= 4 ? C.accent1 : C.accent3 })
    text(slide, title, { x: 10.15, y, w: 2.55, h: 0.28, fontSize: 12, bold: true, color: index >= 4 ? C.accent1 : C.text1 })
    text(slide, body, { x: 10.15, y: y + 0.27, w: 2.55, h: 0.26, fontSize: 9.5, color: MUTED })
  })
}
{
  const slide = content('연결 단계 · ② 상담 에이전트 · 모르는 것을 질문으로', '답은 공고에서만, 모르면 물어볼 한국어 문장까지',
    '실제 화면(시연 데이터). 같은 질문 "아이가 8살이에요. 저와 아이가 갈 수 있나요? 준비물이 있나요?"를 베트남어·중국어로. 응답 10~25초', '해결')
  blob(slide, { x: 0.4, y: 1.4, size: 5.4, color: 'E7F1E8' })
  // 왼쪽 베트남어(한 일·답), 오른쪽 중국어(공고에 없는 것을 기관에 물을 한국어 문장)
  const chats = [['app-chat-answer-vi.png', 'Tiếng Việt · 한 일과 답', 0.75], ['app-chat-inquiry-zh.png', '中文 · 기관에 물을 한국어 문장', 3.45]]
  for (const [file, label, x] of chats) {
    const h = 4.85
    const w = phone(slide, img(file), { x, y: 1.95, h })
    card(slide, { x: x + w / 2 - 1.25, y: 1.5, w: 2.5, h: 0.3, fill: C.accent5, shadow: false })
    text(slide, label, { x: x + w / 2 - 1.25, y: 1.5, w: 2.5, h: 0.3, fontSize: 10.5, bold: true, color: C.accent1, align: 'center', valign: 'middle' })
  }
  const tools = [
    ['공고 찾기', '학년·나이·가능 시간으로 기존 판정 규칙 그대로'],
    ['공고 사실 읽기', '검수된 사실과 원문 근거. 미상은 \'공고에 없음\''],
    ['아이 조건 비교', '학년·시간은 판정, 자격은 단정하지 않음'],
    ['문의문 작성', '한국어 문장 + 공고에서 확인된 연락처만'],
    ['미해결 질문 표시', '부모님이 누를 때만 이름 없이 기관에 전달'],
    ['답하기', '편한 언어로, 원문 인용을 붙여서'],
  ]
  text(slide, '에이전트가 고르는 도구 6개', { x: 6.45, y: 1.6, w: 6.2, h: 0.4, fontSize: 16, bold: true, color: C.accent1 })
  tools.forEach(([title, body], index) => {
    const y = 2.1 + index * 0.6
    badge(slide, String(index + 1), { x: 6.45, y: y + 0.06, size: 0.38, fontSize: 12, fill: C.accent3 })
    text(slide, title, { x: 7.0, y, w: 1.9, h: 0.5, fontSize: 14, bold: true, valign: 'middle' })
    text(slide, body, { x: 8.9, y, w: 3.85, h: 0.5, fontSize: 12, valign: 'middle' })
  })
  card(slide, { x: 6.45, y: 5.8, w: 6.3, h: 0.95, fill: C.text2 })
  text(slide, '모델이 단 원문 인용은 코드가 검증된 근거에서 다시 확인, 없으면 버림', { x: 6.7, y: 5.85, w: 5.85, h: 0.85, fontSize: 14, bold: true, color: C.background1, valign: 'middle' })
}
{
  const slide = content('연결 단계 · ② 상담 에이전트의 차이', '기존 공공 챗봇과 무엇이 다른가',
    '팀 비교: 공공 민원 챗봇의 일반적인 서비스 범위와 이 서비스의 설계 비교(통계 아님)', '해결')
  const head = (value) => ({ text: value, options: { bold: true, color: C.background1, fill: { color: HEX.dk2 }, fontSize: 15 } })
  // 상담 답의 문장 자체는 코드가 검사하지 않는다. 다시 확인하는 것은 원문 인용
  const rows = [
    ['답의 근거', '미리 만든 FAQ·안내 문서', '검수된 공고 사실 · 원문 인용은 코드가 다시 확인'],
    ['공고에 없을 때', '다른 기관·전화번호로 안내', '무엇이 없는지 밝히고, 한국어 문의문 + 확인된 연락처'],
    ['언어', '한국어 위주', '부모님이 편한 언어(지금 3개 언어)'],
    ['우리 아이에게 맞는지', '판단하지 않음', '학년·시간은 기존 규칙으로 판정, 자격은 단정하지 않음'],
    ['포스터', '이미지 속 글은 읽지 못함', '포스터를 편한 언어로 옮기고 검증'],
    ['기관에 돌아가는 것', '없음', '못 찾은 질문으로 공고 보완 초안 (기관이 확정)'],
  ]
  // 오른쪽 열의 긴 문구가 맑은 고딕에서 한 줄에 들어가도록 가운데 열을 줄였다(colW)
  // 마지막 줄(기관에 돌아가는 것)이 이 장의 핵심이라 햇살 노랑·짙은 초록으로 강조한다
  const last = rows.length - 1
  const rowH = 0.62
  slide.addTable([
    [head(''), head('기존 공공 챗봇'), head('잇다, 오산 상담 에이전트')],
    ...rows.map(([label, before, after], index) => (index === last
      ? [
          { text: label, options: { bold: true, fill: { color: HEX.accent2 } } },
          { text: before, options: { bold: true, color: C.text1, fill: { color: SUN } } },
          { text: after, options: { bold: true, color: C.background1, fill: { color: HEX.accent1 } } },
        ]
      : [
          { text: label, options: { bold: true, fill: { color: index % 2 ? 'FFFFFF' : SAND } } },
          { text: before, options: { color: MUTED, fill: { color: index % 2 ? 'FFFFFF' : SAND } } },
          { text: after, options: { bold: true, color: C.accent1, fill: { color: index % 2 ? 'E7F1E8' : 'D9EADD' } } },
        ])),
  ], { x: 0.6, y: 1.65, w: 12.13, colW: [2.6, 3.6, 5.93], fontSize: 15, rowH, valign: 'middle', border: { type: 'solid', color: CREAM, pt: 2 }, margin: [0.06, 0.15, 0.06, 0.15], objectName: name('compare-table') })
  // 표 아래 결론 띠: 차이는 답을 준 다음에 생긴다
  const bandY = 1.65 + rowH * (rows.length + 1) + 0.18
  card(slide, { x: 0.6, y: bandY, w: 12.13, h: 0.72, fill: C.text2 })
  text(slide, '차이는 답 다음: 못 찾은 질문이 기관에 돌아가 공고와 다음 프로그램을 바꿈', { x: 0.9, y: bandY, w: 11.6, h: 0.72, fontSize: 18, bold: true, color: C.background1, valign: 'middle', align: 'center' })
}
{
  const slide = content('편성 단계 · ③ 공고 보완 에이전트', '못 찾은 답은 AI가 초안, 기관이 확정',
    '기관 대시보드 실제 화면(시연 데이터, 부모님 질문은 시연용 예시). 초안은 gemini-3.8-flash가 도구로 쓰고, 검사는 코드가 담당(apps/program-api/src/admin)', '해결')
  // 화면 전체 대신 보완 도우미 부분만 잘라 크게(prepare-assets.js의 dash-improve-crop.png, 1620×1325)
  const shot = { x: 0.75, y: 1.6, w: 6.3, h: 6.3 * (1325 / 1620) }
  picture(slide, img('dash-improve-crop.png'), shot)
  const at = (fy) => shot.y + shot.h * fy - 0.21
  // 그림 속 위치: ① 에이전트가 한 일(0.21), ② 기관만 아는 빈칸(0.67), ③ 보호자 화면에서 뺄 항목(0.89)
  outline(slide, { x: shot.x + shot.w * 0.035, y: shot.y + shot.h * 0.6, w: shot.w * 0.93, h: shot.h * 0.12 })
  ;[0.212, 0.668, 0.886].forEach((fy, index) => badge(slide, String(index + 1), { x: shot.x - 0.24, y: at(fy), size: 0.42, fontSize: 14, fill: C.accent6 }))
  const blocks = [
    ['에이전트가 하는 일', '공고 읽기 → 질문 읽기 → 초안 → 코드 검사\n→ 걸리면 고쳐 쓰기 → 통과해야 제출'],
    ['값은 지어내지 않음', '참가비·가능 여부처럼 기관만 아는 값은 빈칸으로\n빈칸 밖의 \'무료·가능해요\' 같은 단정은 차단\n숫자·날짜·수량은 공고 원문과 코드로 대조'],
    ['확정하면 바로 상담에 반영', '담당자가 빈칸을 채워 덧붙이면 상담 에이전트가\n그 안내를 근거로 답변(\'기관이 덧붙인 안내\' 표시)\n부모님 화면의 \'기관에 확인할 점\'에서도 제외'],
  ]
  blocks.forEach(([title, body], index) => {
    const y = 1.6 + index * 1.75
    card(slide, { x: 7.5, y, w: 5.25, h: 1.58, fill: index === 1 ? C.accent5 : C.background2 })
    badge(slide, String(index + 1), { x: 7.72, y: y + 0.16, size: 0.38, fontSize: 13, fill: C.accent6 })
    text(slide, title, { x: 8.22, y: y + 0.13, w: 4.4, h: 0.42, fontSize: 17, bold: true, color: C.accent1, valign: 'middle' })
    text(slide, body, { x: 7.75, y: y + 0.62, w: 4.9, h: 0.92, fontSize: 12.5 })
  })
}
{
  // 순환 한 바퀴를 실제 화면 셋으로, 같은 질문 하나를 따라간다(capture.js loop):
  // 베트남어 보호자가 '기관에 알리기' → 그 질문이 담당자 목록과 보완 초안에 → 담당자가 빈칸을 채워 덧붙임 → 중국어 보호자가 그 안내와 그 안내를 인용한 답을 봄
  // 덧붙인 안내와 알린 질문은 실제 API에 저장했다가 캡처 뒤 지웠다. 강조: 테라코타는 질문, 초록은 기관의 답
  const slide = content('순환 한 바퀴 · 실제 화면', '질문 하나가 공고를 바꾸기까지',
    '실제 화면(시연 데이터). 1칸의 답과 2칸의 초안은 시연영상과 같은 실제 실행 결과, 3칸의 답은 캡처 때 받은 실제 응답. 질문 수는 시연용 예시, 빈칸 값은 시연용 가정', '해결')
  const columns = [
    { x: 0.6, w: 2.75, title: '부모님 · Tiếng Việt', sub: ['공고에 없는 준비물 질문', '\'기관에 알리기\', 이름·대화 없이'] },
    { x: 3.85, w: 4.1, title: '기관 담당자', sub: ['그 질문이 AI 초안에, 빈칸은 담당자가 채움', '덧붙이면 질문마다 \'추가 안내로 답함\''] },
    { x: 8.4, w: 4.35, title: '다음 가정 · 中文', sub: ['\'기관이 확인해 덧붙인 안내\' 카드', '같은 것을 물으면 그 안내를 인용한 답'] },
  ]
  columns.forEach(({ x, w, title, sub }, index) => {
    badge(slide, String(index + 1), { x, y: 1.58, size: 0.42, fontSize: 14, fill: index === 0 ? C.accent6 : C.accent1 })
    text(slide, title, { x: x + 0.52, y: 1.58, w: w - 0.52, h: 0.42, fontSize: 16, bold: true, color: index === 1 ? C.text1 : C.accent1, valign: 'middle' })
    text(slide, [{ text: sub[0], options: { breakLine: true } }, { text: sub[1] }], { x: x + 0.52, y: 2.02, w: w - 0.5, h: 0.48, fontSize: 11, color: MUTED })
  })
  const top = 2.65
  const h = 4.1
  const pw = h * (750 / 1624)
  /** 그림 위의 강조 테두리 (그림 안 위치를 비율로) */
  const mark = (box, fx, fy, fw, fh, color = C.accent6) => outline(slide, { x: box.x + box.w * fx, y: box.y + box.h * fy, w: box.w * fw, h: box.h * fh, color })
  // ① 베트남어 보호자: 공고에 없는 질문 카드에서 '기관에 알리기'를 누른 뒤
  const one = { x: 0.6 + (2.75 - pw) / 2, y: top, w: pw, h }
  phone(slide, img('app-loop-reported-vi.png'), one)
  mark(one, 0.035, 0.468, 0.93, 0.267)
  // ② 기관 담당자: 그 질문이 들어간 초안 카드(채운 빈칸·게시될 문장), 덧붙인 뒤 '추가 안내로 답함'이 붙은 질문 목록
  const filled = { x: 3.85, y: top, w: 4.1, h: 4.1 * ratioOf('dash-loop-filled.png') }
  picture(slide, img('dash-loop-filled.png'), filled)
  mark(filled, 0.255, 0.125, 0.285, 0.09)
  mark(filled, 0.012, 0.485, 0.976, 0.405, C.accent1)
  const answered = { x: 3.85, y: filled.y + filled.h + 0.2, w: 4.1, h: 4.1 * ratioOf('dash-loop-answered-list.png') }
  picture(slide, img('dash-loop-answered-list.png'), answered)
  mark(answered, 0.0, 0.8, 1.0, 0.2)
  // ③ 다음 보호자(중국어): 덧붙인 안내 카드, 그 안내를 근거로 단 답
  const three = [8.4 + 0.12, 8.4 + 0.12 + pw + 0.3].map((x) => ({ x, y: top, w: pw, h }))
  phone(slide, img('app-loop-addenda-zh.png'), three[0])
  // 덧붙인 안내 카드 자리는 capture.js가 찍을 때 잰 것(marks.json), 테두리는 카드보다 조금 크게
  const card = MARKS['app-loop-addenda-zh.png']
  if (card) mark(three[0], card.x - 0.013, card.y - 0.005, card.w + 0.026, card.h + 0.01, C.accent1)
  else mark(three[0], 0.035, 0.236, 0.93, 0.327, C.accent1)
  phone(slide, img('app-loop-sources-zh.png'), three[1])
  // 기관 안내를 인용한 근거 자리도 capture.js가 잰 것 (없으면 예전 캡처의 자리)
  const cited = MARKS['app-loop-sources-zh.png']
  if (cited) mark(three[1], cited.x - 0.013, cited.y - 0.005, cited.w + 0.026, cited.h + 0.01, C.accent1)
  else mark(three[1], 0.075, 0.6, 0.85, 0.165, C.accent1)
  // 칸 사이 화살표
  const midY = top + h / 2
  arrow(slide, { x: one.x + pw + 0.14, y: midY, w: 3.85 - 0.1 - (one.x + pw + 0.14), color: C.accent6, width: 2.5 })
  arrow(slide, { x: 3.85 + 4.1 + 0.1, y: midY, w: three[0].x - 0.12 - (3.85 + 4.1 + 0.1), color: C.accent1, width: 2.5 })
}

{
  const slide = content('편성 단계 · ④ 편성 에이전트', '익명 통계로 짜는 다음 프로그램, 숫자는 코드가 계산',
    '기관 대시보드 실제 화면. 통계는 시연용 가상 응답 400가정·가상 장소 9곳(실제 통계 아님). 편성 계산 packages/planning, 에이전트·검사 apps/program-api/src/admin', '해결')
  // 왼쪽: 보호자 익명 통계(편성안 대상으로 좁힌 히트맵, 반 번호), 가운데: AI 편성안 카드(prepare-assets.js의 dash-plan-*-crop.png)
  const data = { x: 0.65, y: 1.6, w: 3.45, h: 3.45 * (1060 / 919) }
  picture(slide, img('dash-plan-data-crop.png'), data)
  text(slide, [
    { text: '익명 통계 항목', options: { bold: true, color: C.accent1, breakLine: true } },
    { text: '아이 학년 · 가능 요일·시간 · 사는 동', options: { breakLine: true } },
    { text: '관심 분야 · 화면 언어', options: { breakLine: true } },
    { text: '5가정 미만 칸은 가림', options: { breakLine: true } },
    // 그림의 히트맵은 편성안 대상(초1~4 한국어 대상)만, 관심 분야 막대는 가상 응답 전체(PlanView interestCounts)
    { text: `관심 분야 막대는 ${PLAN_TOTAL}가정 전체 기준`, options: { color: MUTED } },
  ], { x: 0.65, y: 5.72, w: 3.45, h: 1.15, fontSize: 11.5 })
  const proposal = { x: 4.4, y: 1.6, w: 4.5, h: 4.5 * (1425 / 1224) }
  picture(slide, img('dash-plan-card-crop.png'), proposal)
  // 오른쪽: 결과 한 줄과 에이전트가 하는 일
  card(slide, { x: 9.25, y: 1.55, w: 3.5, h: 1.55, fill: PEACH, shadow: false })
  // 숫자는 캡처와 같은 편성안 결과에서 읽는다 (없으면 숫자 없이)
  const facts = PLAN ? PLAN.reasons.flatMap((reason) => reason.facts) : []
  const factOf = (pattern) => facts.find((fact) => pattern.test(fact.id))
  const interestFact = factOf(/^d\d+\.interest\./)
  const interestCount = interestFact?.value
  // 관심 수는 편성안 대상(학년 좁힘)이 아니라 통계 전체 범위에서 센 것: 사실 이름('초1~6 · 한국어에 관심 표시한 가정')에서 학년 범위를 읽어 함께 쓴다
  const interestScope = /^초\d+~\d+/.exec(interestFact?.label ?? '')?.[0]
  const programCount = factOf(/^p\.interest\./)?.value
  // 받침이 있으면 '을', 없으면 '를' (분야 이름 뒤 조사)
  const objectParticle = (word) => { const code = word.charCodeAt(word.length - 1) - 0xac00; return code >= 0 && code <= 11171 && code % 28 !== 0 ? '을' : '를' }
  // 큰 숫자 바로 아래에 모집단을 밝힌다: 시연용 가상 응답 중 편성안 대상 가정
  text(slide, planCoverage() ?? '토요일 오전 몰림 → 분산', { x: 9.45, y: 1.62, w: 3.2, h: 0.62, fontSize: 30, bold: true, color: C.accent6 })
  text(slide, PLAN
    ? [
        { text: `같은 반 ${PLAN.class_count}개, 시간·장소만 바꿔서`, options: { breakLine: true } },
        { text: `(시연용 가상 응답 ${PLAN_TOTAL}가정 중 초${PLAN.grade_range[0]}~${PLAN.grade_range[1]}`, options: { bold: true, breakLine: true } },
        // eligible은 학년이 맞고 그 분야를 골랐거나 분야를 고르지 않은 가정(packages/planning matchesInterest)이라,
        // 옆 카드의 '관심 121가정'(초1~6, 그 분야를 고른 가정만)보다 클 수 있다. 무엇을 셌는지 그대로 쓴다
        { text: PLAN.interest === 'all' ? `모든 분야 ${PLAN.eligible}가정)` : `${PLAN.interest_label}${objectParticle(PLAN.interest_label)} 골랐거나 분야 미선택 ${PLAN.eligible}가정)`, options: { bold: true } },
      ]
    : '같은 반 수, 시간·장소만 바꿔서\n(시연용 가상 응답 기준)', { x: 9.45, y: 2.25, w: 3.2, h: 0.8, fontSize: 11.5 })
  const blocks = [
    ['도구로 읽기', `익명 통계·못 찾은 질문·지금 공고${interestCount && programCount ? `\n${interestScope ? `${interestScope} ` : ''}${PLAN.interest_label} 관심 ${interestCount} · ${PLAN.interest_label} 공고 ${programCount}` : ''}`],
    ['편성 계산은 코드', '요일·시간·장소 조합을 모두 비교\n언제·어디서·닿는 가정 수는 계산 결과'],
    ['근거 숫자 대조', '근거 숫자가 도구 결과와 같아야 통과\n결정은 담당자'],
  ]
  blocks.forEach(([title, body], index) => {
    const y = 3.3 + index * 1.18
    card(slide, { x: 9.25, y, w: 3.5, h: 1.06, fill: index === 1 ? C.accent5 : C.background2 })
    badge(slide, String(index + 1), { x: 9.43, y: y + 0.13, size: 0.36, fontSize: 12, fill: C.accent6 })
    text(slide, title, { x: 9.9, y: y + 0.1, w: 2.75, h: 0.4, fontSize: 14.5, bold: true, color: C.accent1, valign: 'middle' })
    text(slide, body, { x: 9.43, y: y + 0.52, w: 3.25, h: 0.5, fontSize: 10.5 })
  })
}
{
  const slide = content('사람이 확정 · 기관 검수 화면', '원문과 나란히 놓고 승인하는 기관 화면',
    '기관 대시보드 실제 화면(데스크톱). 포스터 원본: 오산시가족센터. 승인 규칙은 사람 검수 CLI(npm run review)와 같음', '해결')
  // 사이드바·제목을 뺀 세 칸만 잘라 크게(prepare-assets.js의 dash-review-crop.png, 2253×1397)
  const shot = { x: 0.75, y: 1.75, w: 7.7, h: 7.7 * (1397 / 2253) }
  picture(slide, img('dash-review-crop.png'), shot)
  // 칸 머리의 아이콘을 가리지 않게 그림 위쪽 끝에 걸쳐 둔다
  ;[0.0, 0.33, 0.695].forEach((fx, index) => badge(slide, String(index + 1), { x: shot.x + shot.w * fx - 0.12, y: shot.y - 0.33, size: 0.42, fontSize: 14, fill: C.accent6 }))
  const blocks = [
    ['원본 그대로', '기관 공고의 포스터와 원문 글'],
    ['AI가 읽은 사실 + 근거', '원문 인용으로 확인되지 않은 사실은 노랗게\n직접 대조 표시가 있어야 승인'],
    ['번역 포스터 검증 기록', '회차마다 무엇을 잡고 고쳤는지\n승인 전까지 부모님 화면에 \'담당자 확인 전\''],
  ]
  blocks.forEach(([title, body], index) => {
    const y = 1.6 + index * 1.45
    card(slide, { x: 8.8, y, w: 3.95, h: 1.3, fill: index === 1 ? C.accent5 : C.background2 })
    badge(slide, String(index + 1), { x: 9.0, y: y + 0.15, size: 0.38, fontSize: 13, fill: C.accent6 })
    text(slide, title, { x: 9.5, y: y + 0.12, w: 3.15, h: 0.42, fontSize: 16, bold: true, color: C.accent1, valign: 'middle' })
    text(slide, body, { x: 9.0, y: y + 0.6, w: 3.65, h: 0.65, fontSize: 12 })
  })
  text(slide, '로그인이 없는 시연이라 관리자 기능은 시연·내부망 전용', { x: 0.75, y: 6.62, w: 7.7, h: 0.3, fontSize: 12, color: MUTED })
}
// =========================================================
// 15~16. 기술 구조: 시스템 한 장, 에이전트 공통 구조 한 장
// 사실 기준: apps/program-api(src/server.ts, src/agent, src/admin, src/poster, src/llm), packages/planning, 실제 실행 기록(render/*.json)
// 쓰지 않을 말: 에이전트끼리 서로 부름·오케스트레이터(데이터로만 이어짐), DB·배포·RAG, 실시간 통계(아직 없음), '모든 오류를 잡는다'
// =========================================================
pres.addSection({ title: '기술 구조' })
{
  const slide = content('기술 구조 · 시스템', '화면 둘, 공고 서버 하나, 그 안의 에이전트 넷',
    '코드: apps/guardian-web·apps/institution-dashboard(React 19 + Vite), apps/program-api(Node.js·TypeScript), packages/planning. 시연 데이터 기준', '기술 구조')
  // 1줄: 누가 시작하나 (기관 원문 · 보호자 · 기관 담당자)
  const starters = [
    // 업로드 화면은 없다: 시연은 공고를 서버의 받은 공고 폴더에 넣고 일괄 실행(CLI)
    { x: 0.6, w: 3.1, fill: SAND, title: '기관 공고·포스터', sub: '시연: 공고를 서버 폴더에 넣고 일괄 실행\n누리집 연동은 다음 단계', label: '새 공고' },
    { x: 3.85, w: 1.9, fill: C.accent5, title: '보호자 웹', sub: '휴대폰 · 3개 언어\n로그인·이름 없음', label: '검색·상담·포스터' },
    { x: 5.9, w: 3.95, fill: C.background2, title: '기관 대시보드', sub: '데스크톱 · 검수·승인, 보완 초안, 편성안\n(관리자 API는 로그인 없는 시연용)', label: '검수·보완·편성' },
  ]
  for (const item of starters) {
    card(slide, { x: item.x, y: 1.55, w: item.w, h: 0.9, fill: item.fill, shadow: item.fill === C.background2 })
    text(slide, item.title, { x: item.x + 0.15, y: 1.62, w: item.w - 0.3, h: 0.3, fontSize: 14, bold: true, color: item.fill === C.accent5 ? C.accent1 : C.text1 })
    text(slide, item.sub, { x: item.x + 0.15, y: 1.94, w: item.w - 0.3, h: 0.46, fontSize: 10, color: MUTED })
    arrow(slide, { x: item.x + 0.35, y: 2.47, h: 0.26, width: 2 })
    text(slide, item.label, { x: item.x + 0.45, y: 2.47, w: item.w - 0.5, h: 0.24, fontSize: 9.5, bold: true, color: C.accent1, valign: 'middle' })
  }
  // 공고 서버: 왼쪽은 새 공고가 들어올 때(일괄 실행), 오른쪽은 요청마다(실시간)
  card(slide, { x: 0.6, y: 2.75, w: 9.4, h: 2.87, line: LINE })
  text(slide, [{ text: '공고 서버 ', options: { bold: true } }, { text: 'apps/program-api · Node.js + TypeScript', options: { color: MUTED, fontSize: 11 } }], { x: 0.8, y: 2.83, w: 9.0, h: 0.28, fontSize: 13 })
  text(slide, '새 공고가 들어올 때 · 일괄 실행', { x: 0.8, y: 3.13, w: 2.9, h: 0.24, fontSize: 10.5, bold: true, color: MUTED })
  text(slide, '요청마다 · 실시간', { x: 3.85, y: 3.13, w: 6.0, h: 0.24, fontSize: 10.5, bold: true, color: MUTED })
  rule(slide, { x: 3.775, y: 3.15, h: 1.7, color: LINE, width: 1.25, dash: true })
  card(slide, { x: 0.8, y: 3.4, w: 2.9, h: 0.55, fill: SAND, shadow: false })
  text(slide, '공고 구조화', { x: 0.95, y: 3.44, w: 2.65, h: 0.24, fontSize: 12, bold: true })
  text(slide, '판독 → 사실·근거 인용 → 3개 언어 요약', { x: 0.95, y: 3.69, w: 2.7, h: 0.22, fontSize: 10 })
  card(slide, { x: 0.8, y: 4.03, w: 2.9, h: 0.82, fill: C.accent5, shadow: false })
  text(slide, '① 포스터 통번역 에이전트', { x: 0.95, y: 4.08, w: 2.05, h: 0.26, fontSize: 11.5, bold: true })
  text(slide, '읽기 단계', { x: 2.95, y: 4.1, w: 0.7, h: 0.24, fontSize: 10, bold: true, color: C.accent6, align: 'right' })
  // 도구 호출이 아니라 코드가 순서를 정한 생성·검증 반복(src/poster/translate.ts)
  text(slide, '편집 → 다른 모델이 다시 읽어 검증\n→ 틀린 곳만 재생성, 최대 3회', { x: 0.95, y: 4.37, w: 2.7, h: 0.44, fontSize: 10 })
  const agents = [
    ['연결 단계', '② 상담 에이전트', '도구 6개 · 최대 8턴', '공고를 읽고 답\n없으면 한국어 문의문'],
    ['편성 단계', '③ 공고 보완 에이전트', '도구 4개 · 최대 10턴', '못 찾은 질문 →\n공고 보완 초안(값은 빈칸)'],
    ['편성 단계', '④ 편성 에이전트', '도구 6개 · 최대 12턴', '익명 통계 → 편성안\n언제·어디서는 계산 결과'],
  ]
  agents.forEach(([stage, agentName, tools, body], index) => {
    const x = 3.85 + index * 2.05
    card(slide, { x, y: 3.4, w: 1.9, h: 1.45, fill: C.accent5, shadow: false })
    text(slide, stage, { x: x + 0.12, y: 3.47, w: 1.7, h: 0.22, fontSize: 10, bold: true, color: C.accent6 })
    text(slide, agentName, { x: x + 0.12, y: 3.69, w: 1.74, h: 0.28, fontSize: 11.5, bold: true })
    text(slide, tools, { x: x + 0.12, y: 3.99, w: 1.7, h: 0.22, fontSize: 10, bold: true, color: C.accent1 })
    text(slide, body, { x: x + 0.12, y: 4.24, w: 1.72, h: 0.56, fontSize: 9.5 })
  })
  // 모든 결과가 지나는 코드 층. 상담 답의 문장 자체는 검사하지 않으므로 '인용·숫자·초안·편성안'으로만 말한다
  card(slide, { x: 0.8, y: 4.97, w: 9.05, h: 0.55, fill: C.text2, shadow: false })
  text(slide, '코드', { x: 0.98, y: 4.97, w: 1.15, h: 0.55, fontSize: 16, bold: true, color: C.accent2, valign: 'middle' })
  text(slide, [
    { text: '판정 규칙(학년·시간) · 편성 계산 · 원문 인용 대조 · 숫자·날짜·전화 대조 · QR 재스캔', options: { breakLine: true, bold: true } },
    { text: '모델이 낸 인용·숫자·초안·편성안은 코드가 다시 확인', options: { color: C.accent4 } },
  ], { x: 2.15, y: 4.99, w: 7.6, h: 0.5, fontSize: 10.5, color: C.background1, valign: 'middle' })
  // 외부 AI 모델 (서버만 부른다)
  text(slide, '외부 AI 모델', { x: 10.35, y: 2.47, w: 2.38, h: 0.24, fontSize: 10.5, bold: true, color: MUTED })
  card(slide, { x: 10.35, y: 2.75, w: 2.38, h: 1.7 })
  text(slide, 'Gemini', { x: 10.52, y: 2.83, w: 2.1, h: 0.3, fontSize: 14, bold: true, color: C.accent1 })
  text(slide, 'Vertex AI · gemini-3.8-flash', { x: 10.52, y: 3.13, w: 2.15, h: 0.22, fontSize: 9, color: MUTED })
  text(slide, ['판독·사실 추출·3개 언어 요약', '번역표, 결과 다시 읽어 검증', '②③④ 에이전트의 도구 호출'].map((line, index, all) => ({ text: line, options: { bullet: { indent: 10 }, breakLine: index < all.length - 1 } })),
    { x: 10.52, y: 3.42, w: 2.15, h: 0.95, fontSize: 10, paraSpaceAfter: 3 })
  card(slide, { x: 10.35, y: 4.6, w: 2.38, h: 1.02 })
  text(slide, '이미지 편집', { x: 10.52, y: 4.67, w: 2.1, h: 0.28, fontSize: 13, bold: true, color: C.accent1 })
  text(slide, 'OpenAI gpt-image-2.5-sunburst', { x: 10.52, y: 4.95, w: 2.15, h: 0.22, fontSize: 9, color: MUTED })
  text(slide, '포스터의 글만 바꿔 그리기', { x: 10.52, y: 5.2, w: 2.15, h: 0.3, fontSize: 10 })
  arrow(slide, { x: 10.03, y: 3.6, w: 0.29, both: true, color: C.accent3, width: 2 })
  arrow(slide, { x: 10.03, y: 5.1, w: 0.29, both: true, color: C.accent3, width: 2 })
  // 저장: 서버의 파일. 아직 만들지 않은 실제 통계 집계는 점선
  const stores = [
    ['공고 사실', '원문 근거 인용·검수 기록\n사실이 바뀌면 게시 중단', false],
    ['번역 포스터', '회차별 이미지와\n검증 기록 함께 저장', false],
    ['못 찾은 질문', "'기관에 알리기'를 누를 때만\n대화 없이 질문 한 줄만", false],
    ['익명 수요 통계', '시연: 합성 400가정\n실제 집계 연결은 다음 단계', true],
  ]
  stores.forEach(([title, body, planned], index) => {
    const x = 0.6 + index * 2.38
    card(slide, { x, y: 5.75, w: 2.26, h: 1.0, fill: planned ? CREAM : C.background2, line: planned ? MUTED : LINE, dash: planned, shadow: false })
    slide.addShape(pres.shapes.CAN, { x: x + 1.92, y: 5.84, w: 0.2, h: 0.26, fill: { color: planned ? 'FFFFFF' : HEX.accent4 }, line: { color: planned ? MUTED : HEX.accent3, width: 0.75 }, objectName: name('store') })
    text(slide, title, { x: x + 0.15, y: 5.82, w: 1.75, h: 0.28, fontSize: 12, bold: true, color: planned ? MUTED : C.text1 })
    text(slide, body, { x: x + 0.15, y: 6.13, w: 2.05, h: 0.66, fontSize: 9.5, color: planned ? MUTED : C.text1 })
  })
  card(slide, { x: 10.35, y: 5.75, w: 2.38, h: 1.0, fill: PEACH, shadow: false })
  text(slide, [{ text: '모델 호출은 서버에만', options: { bold: true, breakLine: true, fontSize: 12 } }, { text: 'API 키는 화면에 없음\n그림은 OpenAI, 검증은 Gemini', options: { fontSize: 9.5 } }], { x: 10.5, y: 5.82, w: 2.15, h: 0.98 })
}
{
  const slide = content('기술 구조 · 에이전트', '모델은 고르고 쓰기만, 사실과 숫자는 코드, 결정은 사람',
    '실제 실행: 시연영상과 같은 기록(gemini-3.8-flash). 자동 테스트 561개(10/18 기준)는 모델을 대역으로 바꿔 코드 규칙을 검사(npm test)', '기술 구조')
  // 위: ②③④ 에이전트가 함께 쓰는 고리. 포스터 통번역은 도구 호출 대신 정해진 단계라 표에서 따로 밝힌다
  const steps = [
    ['과제', '부모님 질문\n· 못 찾은 질문\n· 새 포스터', SAND, C.text1, C.text1],
    ['모델이 고름', '다음에 부를 도구\n초안 문장', C.accent5, C.accent1, C.text1],
    ['도구는 코드', '공고 사실 · 판정 규칙\n· 편성 계산', C.background2, C.text1, C.text1],
    ['코드 검사', '인용 · 숫자 · 단정 · 빈칸', C.text2, C.accent2, C.background1],
    ['통과한 것만', '원문에 있는 인용만\n제출 때 한 번 더 검사', C.accent5, C.accent1, C.text1],
    ['사람이 확정', '승인 · 빈칸 채우기\n· 편성 결정', PEACH, C.accent6, C.text1],
  ]
  const boxW = 1.78
  const gap = 0.29
  const left = (index) => 0.6 + index * (boxW + gap)
  steps.forEach(([title, body, fill, titleColor, bodyColor], index) => {
    const x = left(index)
    card(slide, { x, y: 1.6, w: boxW, h: 0.95, fill, shadow: fill === C.background2 })
    text(slide, title, { x: x + 0.12, y: 1.66, w: boxW - 0.2, h: 0.3, fontSize: 13, bold: true, color: titleColor })
    text(slide, body, { x: x + 0.12, y: 1.97, w: boxW - 0.18, h: 0.55, fontSize: 10, color: bodyColor })
    // 모델 ⇄ 도구는 여러 번 오가므로 양쪽 화살표
    if (index < steps.length - 1) arrow(slide, { x: x + boxW + 0.04, y: 2.075, w: gap - 0.08, width: 2, both: index === 1 })
  })
  // 검사에 걸리면 문제 목록이 모델로 돌아간다 (코드 검사 → 모델이 고름)
  const middle = (index) => left(index) + boxW / 2
  rule(slide, { x: middle(3), y: 2.57, h: 0.25, color: C.accent6 })
  rule(slide, { x: middle(1), y: 2.82, w: middle(3) - middle(1), color: C.accent6 })
  rule(slide, { x: middle(1), y: 2.57, h: 0.25, color: C.accent6, begin: true })
  text(slide, '걸리면 문제 목록을 받아 고쳐 쓰기', { x: middle(1) + 0.9, y: 2.71, w: 2.35, h: 0.22, fontSize: 10, bold: true, color: C.accent6, align: 'center', valign: 'middle', fill: { color: CREAM } })

  const head = (agentName, when) => ({ text: [{ text: agentName, options: { bold: true, fontSize: 12.5, color: C.background1, breakLine: true } }, { text: when, options: { fontSize: 9.5, color: C.accent4 } }], options: { fill: { color: HEX.dk2 } } })
  const rows = [
    ['모델이 정하는 것', '문구별 번역, 글만 바꾼 포스터(이미지 모델)', '부를 도구와 순서, 편한 언어의 답', '질문 묶기, 이미 있음/덧붙일 안내 판단, 문장', '대상·반 수, 계산된 안 중 선택, 근거 문장'],
    ['도구', '도구 대신 정해진 6단계, 최대 3회 재생성', '6개: 공고 찾기·사실 읽기·조건 비교·문의문·미해결 표시·답하기', '4개: 공고 읽기·질문 읽기·초안 검사·제출', '6개: 통계·질문·공고 읽기, 편성 계산, 검사, 제출'],
    // 상담 답의 문장 자체는 검사하지 않는다(인용·문의처·판정만)
    ['코드 검사', '숫자·날짜·전화 대조, 남은 한국어, QR 재스캔 + Gemini가 다시 읽어 뜻 대조', '원문에 없는 인용은 버림, 문의처는 공고에 있는 것만, 학년·시간은 기존 규칙. 답 문장 자체는 검사 대상 아님(인용만 대조)', "빈칸 밖 '무료·가능' 단정과 공고에 없는 숫자·날짜 차단, 인용 글자 대조", '계산된 안인지, 근거 숫자 = 도구 결과(값·단위), 가린 칸 인용 불가'],
    ['사람', "승인 전엔 '담당자 확인 전' 표시", '승인된 공고만 읽음, 기관 전달은 부모님 동의 때만', '담당자가 빈칸을 채워야 게시', '담당자가 결정, 자동 게시 없음'],
    ['실제 실행 한 번', '6건 모두 통과: 1회차 4, 2회차 1(넣은 날짜 오류 수정), 3회차 1', consultRun(), improveRun(), planRun()],
  ]
  const rowFills = [HEX.lt1, HEX.lt1, HEX.accent5, HEX.lt1, SUN]
  const labelFills = [SAND, SAND, HEX.accent4, SAND, HEX.accent2]
  slide.addTable([
    [{ text: '', options: { fill: { color: HEX.dk2 } } }, head('① 포스터 통번역', '읽기 단계 · 새 공고가 들어올 때'), head('② 상담', '연결 단계 · 부모님이 물을 때마다'), head('③ 공고 보완', '편성 단계 · 담당자가 요청할 때'), head('④ 편성', '편성 단계 · 담당자가 요청할 때')],
    ...rows.map(([label, ...cells], row) => [
      { text: label, options: { bold: true, fontSize: 11, fill: { color: labelFills[row] } } },
      // 코드 검사 줄은 초록 굵은 글씨로 눈에 띄게
      ...cells.map((cell) => ({ text: cell, options: { fill: { color: rowFills[row] }, ...(row === 2 ? { color: C.accent1, bold: true } : {}) } })),
    ]),
  ], {
    x: 0.6, y: 3.1, w: 12.13, colW: [1.45, 2.67, 2.67, 2.67, 2.67], rowH: [0.5, 0.55, 0.58, 0.86, 0.48, 0.66],
    fontSize: 10.5, color: C.text1, valign: 'middle', border: { type: 'solid', color: CREAM, pt: 2 }, margin: [0.04, 0.1, 0.04, 0.1], objectName: name('agent-table'),
  })
}

// =========================================================
// 17~19. 라이프케어·신뢰·실행
// =========================================================
pres.addSection({ title: '라이프케어와 실행' })
{
  const slide = content('라이프케어', '영유아부터 고등학생까지, 같은 순환으로',
    '6~24세 양육 1순위 어려움: 비용 부담 24.9%, 학업·진학·진로 정보 부족 21.8%(2024 전국다문화가족실태조사). 사진은 실제 오산시가족센터 포스터의 중국어·베트남어판', '라이프케어와 실행')
  const stages = [
    ['영유아', '돌봄·어린이집·예방접종 안내', null, '다음 단계'],
    ['초등', '방과후·체험·체육 프로그램', 'poster-sports-zh.jpg', '우리 zip. 운동회 · 中文'],
    ['초등', '자녀성장 프로그램', 'poster-kpop-zh.jpg', 'K-pop 방송댄스 · 中文'],
    ['중·고등', '진학설명회·진로 프로그램', 'poster-hs-vi.jpg', '진학설명회 · Tiếng Việt'],
  ]
  slide.addShape(pres.shapes.LINE, { x: 0.9, y: 1.85, w: 11.6, h: 0, line: { color: 'E8C9B5', width: 3, dashType: 'dash' }, objectName: name('timeline') })
  stages.forEach(([age, need, file, caption], index) => {
    const x = 0.6 + index * 3.07
    badge(slide, '', { x: x + 0.2, y: 1.65, size: 0.4, fill: file ? C.accent6 : 'E8C9B5' })
    text(slide, age, { x: x + 0.2, y: 2.15, w: 2.65, h: 0.45, fontSize: 18, bold: true, color: C.accent1, valign: 'middle' })
    text(slide, need, { x: x + 0.2, y: 2.6, w: 2.7, h: 0.4, fontSize: 13 })
    if (file) {
      const ratio = file.includes('kpop') ? 900 / 1350 : 1
      const h = 2.55
      const w = h * ratio
      picture(slide, img(file), { x: x + 0.2 + (2.65 - w) / 2, y: 3.15, w, h })
      text(slide, caption, { x: x + 0.2, y: 5.76, w: 2.65, h: 0.3, fontSize: 12, color: MUTED, align: 'center' })
    } else {
      card(slide, { x: x + 0.2, y: 3.15, w: 2.65, h: 2.55, fill: SAND, shadow: false })
      text(slide, '같은 방식으로\n확장할 안내', { x: x + 0.3, y: 4.05, w: 2.45, h: 0.8, fontSize: 14, color: MUTED, align: 'center', valign: 'middle' })
    }
  })
  card(slide, { x: 0.6, y: 6.1, w: 12.13, h: 0.78, fill: C.accent5, shadow: false })
  text(slide, [
    { text: '공급처 확장: 가족센터 공고 → 학교 가정통신문 → 도서관·청소년센터 → 시청 공지', options: { bold: true, fontSize: 14.5, breakLine: true } },
    { text: '어느 단계든 같은 에이전트 4개: ① 포스터 통번역 · ② 상담 · ③ 공고 보완 · ④ 편성', options: { fontSize: 12, color: C.text1 } },
  ], { x: 0.9, y: 6.1, w: 11.6, h: 0.78, color: C.accent1, valign: 'middle', paraSpaceAfter: 2 })
}
{
  const slide = content('신뢰 설계', 'AI가 틀려도, 부모님이 잘못 판단하지 않도록',
    '기준: 서비스 명세 v2.2, 구현: apps/program-api·apps/guardian-web. 실제 사례: 오산시가족센터 K-pop 방송댄스 공고 화면(팀 캡처, 2026.10)', '라이프케어와 실행')
  // 여섯 가지 장치를 세 묶음으로: 장마다 메시지 하나, 카드 세 장
  // 항목마다 줄을 나눌 자리를 정해 둔다(배열 = 한 항목 안의 줄). 한 단어만 다음 줄로 떨어지지 않게
  const groups = [
    ['사람이 마지막에 확인', [['자동 검증만 통과한 포스터·안내는', '\'담당자 확인 전\' 표시'], ['원문이나 포스터가 바뀌면', '승인이 풀리고 게시 중단']]],
    ['모르는 건 모른다고', [['공고에 없는 비용·자격·상담 언어는', '노란 형광펜'], ['모델이 단 근거가 원문에 없으면', '코드가 버림']]],
    // 보호자가 넣는 조건은 모두 선택(ConditionSheet). 통계는 5가정 미만 칸을 가린다(packages/planning SUPPRESSION_THRESHOLD)
    ['묻지 않고, 동의할 때만', [['이름·국적·체류 자격·연락처는', '묻지 않음'], ['넣는 것은 아이 학년·가능한 시간', '사는 동·관심 분야만, 모두 선택'], ['\'기관에 알리기\'를 누를 때만', '질문을 이름 없이 전달'], ['통계에서 5가정 미만 칸은 가림']]],
  ]
  /** 글머리 항목들: 항목 안의 줄은 같은 단락 안의 줄바꿈(<a:br/>) */
  const bulletRuns = (items) => items.flatMap((parts, i) => parts.map((part, j) => ({
    text: part, options: { ...(j === 0 ? { bullet: { indent: 12 } } : { softBreakBefore: true }), breakLine: j === parts.length - 1 && i < items.length - 1 },
  })))
  // 셋째 묶음이 네 항목이라 카드를 키우고 글자를 조금 줄였다(세 카드 같은 크기)
  groups.forEach(([title, lines], index) => {
    const x = 0.6 + index * 4.1
    card(slide, { x, y: 1.6, w: 3.85, h: 3.0, fill: index === 1 ? C.accent5 : C.background2 })
    badge(slide, String(index + 1), { x: x + 0.3, y: 1.82, size: 0.52, fontSize: 17 })
    text(slide, title, { x: x + 0.95, y: 1.82, w: 2.8, h: 0.52, fontSize: 18, bold: true, valign: 'middle' })
    text(slide, bulletRuns(lines), { x: x + 0.3, y: 2.5, w: 3.45, h: 2.04, fontSize: 13.5, paraSpaceAfter: 6 })
  })
  // 실제 공고에서 AI가 잡은 사례. 코드가 따로 처리하는 것은 신청(접수) 기간 불일치뿐이라 그것만 말한다
  card(slide, { x: 0.6, y: 4.8, w: 12.13, h: 1.18, fill: C.accent2, shadow: false })
  text(slide, '실제 사례', { x: 0.9, y: 4.8, w: 1.3, h: 1.18, fontSize: 16, bold: true, valign: 'middle' })
  text(slide, [
    { text: 'K-pop 방송댄스 공고: 같은 공고 안에 신청 기간이 둘 (상단 10.1~10.17, 포스터 9.28~10.14)', options: { bold: true, breakLine: true } },
    { text: 'AI 요약은 상단 기간을 안내하고 \'신청 기간이 다르게 적힌 곳도 있으니 기관에 확인\'을 덧붙임 (3개 언어)', options: {} },
  ], { x: 2.2, y: 4.8, w: 10.35, h: 1.18, fontSize: 14, valign: 'middle', paraSpaceAfter: 4 })
  text(slide, '자동 검증은 틀렸을 가능성을 줄이는 장치, 마지막 판단은 사람과 원문', { x: 0.6, y: 6.16, w: 12.13, h: 0.5, fontSize: 17, bold: true, color: C.accent1, align: 'center', valign: 'middle' })
}
{
  const slide = content('실행 계획', '오산시가족센터에서 바로 시작',
    '효과는 미리 숫자로 약속하지 않고, 시범 운영에서 이 네 지표로 측정', '라이프케어와 실행')
  // 업로드 화면은 없다: 목표(담당자 일은 그대로)와 지금 시연 상태(서버 일괄 처리)를 나눠 쓴다
  const phases = [
    ['1단계 · 지금', '오산시가족센터', '시연 공고 25건\n실제 포스터 3장 × 2개 언어 검증 완료\n목표: 담당자는 지금처럼 누리집 게시만\n시연: 공고를 서버에서 일괄 처리'],
    ['2단계', '학교 가정통신문', '진학·진로 정보가 많이 필요한 시기\n화성오산교육지원청과 연계'],
    ['3단계', '시 공공채널', '도서관·청소년센터·시청 공지까지\n같은 순환으로'],
  ]
  phases.forEach(([step, title, body], index) => {
    const x = 0.6 + index * 4.2
    card(slide, { x, y: 1.65, w: 3.75, h: 2.6, fill: index === 0 ? C.text2 : C.background2 })
    text(slide, step, { x: x + 0.3, y: 1.85, w: 3.2, h: 0.4, fontSize: 14, bold: true, color: index === 0 ? C.accent2 : C.accent6 })
    text(slide, title, { x: x + 0.3, y: 2.25, w: 3.2, h: 0.5, fontSize: 20, bold: true, color: index === 0 ? C.background1 : C.text1 })
    text(slide, body, { x: x + 0.3, y: 2.85, w: 3.4, h: 1.3, fontSize: 13, color: index === 0 ? C.accent5 : C.text1 })
    if (index < 2) arrow(slide, { x: x + 3.82, y: 2.95, w: 0.32, h: 0, color: C.accent6 })
  })
  text(slide, '시범 운영에서 잴 것', { x: 0.6, y: 4.55, w: 6, h: 0.45, fontSize: 18, bold: true, color: C.accent1 })
  const kpis = [
    ['과업 성공률', '부모님이 공고를 읽고\n대상·일정·다음 행동을\n스스로 설명하는 비율'],
    ['문의 전환', '공고에 없는 질문이\n문의문·전화로 이어진 비율'],
    ['미해결 질문 감소', '공고 보완 뒤 같은 주제의\n질문이 줄어든 정도'],
    ['충원율', '추천한 요일·시간·장소로\n연 프로그램의 정원 대비 신청 인원'],
  ]
  kpis.forEach(([title, body], index) => {
    const x = 0.6 + index * 3.07
    card(slide, { x, y: 5.1, w: 2.85, h: 1.7, fill: C.accent5 })
    text(slide, title, { x: x + 0.22, y: 5.25, w: 2.45, h: 0.4, fontSize: 16, bold: true, color: C.accent1 })
    text(slide, body, { x: x + 0.22, y: 5.7, w: 2.45, h: 1.0, fontSize: 12 })
  })
}

// =========================================================
// 20. 마무리
// =========================================================
pres.addSection({ title: '마무리' })
{
  const slide = pres.addSlide({ masterName: 'COVER', sectionTitle: '마무리' })
  blob(slide, { x: 7.6, y: 0.4, size: 6.6 })
  slide.addText('2분 시연영상 별도 제출', { placeholder: 'kicker' })
  slide.addText([
    { text: '잇다, 오산', options: { breakLine: true } },
    { text: '부모님의 질문이', options: { fontSize: 32, breakLine: true } },
    { text: '다음 프로그램이 되는 곳', options: { fontSize: 32, color: C.accent1 } },
  ], { placeholder: 'title' })
  slide.addText([
    { text: '아이가 자라는 동안 계속 도는 오산의 AX 라이프케어', options: { bold: true, color: C.text1, breakLine: true } },
    { text: '부모님의 질문 → ③ 공고 보완 · ④ 편성 → 다음 가정', options: { breakLine: true } },
    { text: 'github.com/NiceTry3675/osan-kids-bridge', options: { color: C.accent1 } },
  ], { placeholder: 'body' })
  text(slide, '팀 다담', { x: 8.6, y: 0.85, w: 4.1, h: 0.45, fontSize: 18, bold: true, color: C.accent6 })
  const team = [['임준현', 'LLM 구조화·에이전트·대시보드'], ['이선우', '문제 근거·통계'], ['김채현', '공고 확보·개인정보'], ['박소영', '부모님 서비스·UX']]
  team.forEach(([who, role], index) => {
    const y = 1.45 + index * 1.15
    card(slide, { x: 8.6, y, w: 4.1, h: 0.95 })
    text(slide, who, { x: 8.85, y, w: 1.1, h: 0.95, fontSize: 20, bold: true, color: C.accent1, valign: 'middle' })
    text(slide, role, { x: 9.95, y, w: 2.65, h: 0.95, fontSize: 14, color: C.text1, valign: 'middle' })
  })
}

// ---------- 저장 + 테마 색 + 한글 줄바꿈 ----------
// 한글을 낱자가 아니라 띄어쓰기 단위로 줄바꿈한다. OOXML a:pPr@eaLnBrk는 '동아시아 단어를 중간에서 끊어도 되는가'(기본값 참)이고,
// pptxgenjs는 이를 eaLnBrk="1"로 적어 두므로 "0"으로 바꾼다(영문은 이미 latinLnBrk="0").
// - lvl1~9pPr에는 모두 넣는다: 덱 기본값(presentation.xml defaultTextStyle), 마스터 txStyles(title·body·other), 개체별 lstStyle
// - 슬라이드 단락(a:pPr)은 위 값을 물려받으므로 직접 켠 곳만 끈다
// - 차트 글(제목·축·값)은 차트 파트 안에서 따로 정하므로 차트의 a:pPr마다 넣는다
const EA_PARTS = /^ppt\/(?:presentation|slideMasters\/slideMaster\d+|slideLayouts\/slideLayout\d+|slides\/slide\d+|charts\/chart\d+)\.xml$/
function koreanWordWrap(xml, { everyParagraph }) {
  const off = (tag) => (/\beaLnBrk="/.test(tag) ? tag.replace(/\beaLnBrk="[^"]*"/, 'eaLnBrk="0"') : tag.replace(/^<a:\w+/, '$& eaLnBrk="0"'))
  return xml
    .replace(/<a:lvl[1-9]pPr\b[^>]*>/g, off)
    .replace(/<a:pPr\b[^>]*>/g, (tag) => (everyParagraph || /\beaLnBrk="/.test(tag) ? off(tag) : tag))
    // 실제 PowerPoint(맥)는 글자 언어가 en-US면 eaLnBrk와 상관없이 한글 낱말을 중간에서 자른다. 한국어로 표시해야 낱말 단위로 줄을 바꾼다
    .replace(/(<a:(?:rPr|endParaRPr|defRPr)\b[^>]*\blang=")en-US"/g, '$1ko-KR"')
}

// pptxgenjs는 한 단락에 글자(run)가 여럿이면 run마다 a:pPr를 다시 적는다. 스키마상 a:pPr는 단락의 첫 자식 하나뿐이므로
// 첫 a:pPr만 남기고 단락 중간의 것은 지운다(PowerPoint가 무시하던 것이라 보이는 모양은 그대로)
const PARA_PROPS = /<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g
function dropStrayParagraphProps(xml) {
  return xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (whole, inner) => {
    const head = inner.startsWith('<a:pPr') ? inner.match(PARA_PROPS)[0] : ''
    return `<a:p>${head}${inner.slice(head.length).replace(PARA_PROPS, '')}</a:p>`
  })
}

async function applyTheme(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file))
  const part = 'ppt/theme/theme1.xml'
  let xml = await zip.file(part).async('string')
  for (const [slot, hex] of Object.entries(THEME.colors)) {
    xml = xml.replace(new RegExp(`<a:${slot}>[\\s\\S]*?</a:${slot}>`), `<a:${slot}><a:srgbClr val="${hex}"/></a:${slot}>`)
  }
  xml = xml.replace(/<a:clrScheme name="[^"]*">/, `<a:clrScheme name="${THEME.name}">`).replace(/<a:theme ([^>]*?)name="[^"]*"/, `<a:theme $1name="${THEME.name}"`)
  // 한글이 대체 글꼴로 바뀌지 않게 동아시아 글꼴 칸(ea)도 맑은 고딕으로 고정한다 (QA 사본은 맥에 있는 글꼴로)
  xml = xml.replace(/<a:ea typeface=""\/>/g, '<a:ea typeface="Malgun Gothic"/>')
  if (QA) xml = xml.replace(/typeface="(?:Malgun Gothic|맑은 고딕)"/g, 'typeface="Apple SD Gothic Neo"')
  zip.file(part, xml)
  for (const name of Object.keys(zip.files).filter((n) => EA_PARTS.test(n))) {
    const original = await zip.file(name).async('string')
    zip.file(name, koreanWordWrap(dropStrayParagraphProps(original), { everyParagraph: name.startsWith('ppt/charts/') }))
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

pres.writeFile({ fileName: OUT }).then(async () => {
  await applyTheme(OUT)
  console.log(`저장: ${OUT}`)
})
