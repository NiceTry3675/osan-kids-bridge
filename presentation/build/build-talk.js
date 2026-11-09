// 구두 발표(7분 안팎)용 덱. 멀리서 보는 화면이라 글은 적고 그림을 크게, 말할 대본은 슬라이드 노트에 넣는다.
// 실행: node capture-talk.js (서버 셋을 먼저 띄움) → node build-talk.js → ../osan-kids-bridge-talk.pptx
// 그림(../assets)에는 실제 기관 포스터와 화면 캡처가 들어가므로 공개 저장소에 올리지 않는다.
// 말과 글: 나라·국적은 쓰지 않고, 사람은 '부모님', 가구·통계는 '가정'. 언어 이름은 그 언어 화면을 보일 때만.
// 제목은 '~다'로 끝내지 않는 짧은 구절. 단서·면책은 슬라이드에 쌓지 않는다(질의응답 대비는 ../talk-qa.md).
const path = require('node:path')
const fs = require('node:fs')
const pptxgen = require('pptxgenjs')
const sharp = require('sharp')
const JSZip = require(require.resolve('jszip', { paths: [require.resolve('pptxgenjs')] }))

const ASSETS = path.resolve(__dirname, '../assets')
const TALK = path.join(ASSETS, 'talk')
const OUT = process.env.TALK_OUT ? path.resolve(process.env.TALK_OUT) : path.resolve(__dirname, '../osan-kids-bridge-talk.pptx')
const img = (name) => path.join(ASSETS, name)
const shot = (name) => path.join(TALK, name)
const sizeOf = (file) => { const head = fs.readFileSync(file).subarray(16, 24); return { w: head.readUInt32BE(0), h: head.readUInt32BE(4) } }

// ---------- 색 (1차 덱·시연영상과 같은 따뜻한 톤) ----------
const THEME = {
  name: 'Itda Osan Talk',
  colors: {
    dk1: '2B2420', lt1: 'FFFFFF', dk2: '24493C', lt2: 'FFFFFF',
    accent1: '2E7D5B', accent2: 'F2C25B', accent3: '5BA37E', accent4: 'C9E3D2', accent5: 'E7F1E8', accent6: 'D2643C',
    hlink: '2E7D5B', folHlink: '25664A',
  },
}
const INK = '2B2420' // 본문 글
const MUTED = '7A6B62' // 보조 글
const CREAM = 'FBF6EE' // 바탕
const PAPER = 'FFFFFF'
const GREEN = '2E7D5B' // 해결·기관의 답
const FOREST = '24493C' // 결론 상자·짙은 바탕
const TERRA = 'D2643C' // 문제·부모님의 질문
const SUN = 'F2C25B' // 강조(실제 사례·숫자)
const MINT = 'E7F1E8'
const PEACH = 'FBE3D3'
const SAND = 'F3E8DA'
const LINE = 'E3D5C3'
const FONT = 'Malgun Gothic'

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE' // 13.333 × 7.5 in
pres.title = '잇다, 오산 — 부모님의 질문이 다음 프로그램이 되는 곳'
pres.author = '팀 다담'
pres.theme = { headFontFace: FONT, bodyFontFace: FONT }
const W = 13.333
const H = 7.5
const LEFT = 0.7
const RIGHT = W - 0.7

pres.defineSlideMaster({ title: 'PLAIN', background: { color: CREAM } })
pres.defineSlideMaster({ title: 'DARK', background: { color: FOREST } })

// ---------- 그리기 도구 ----------
let objectCount = 0
const name = (label) => `${label}-${++objectCount}`
let slideNo = 0

function text(slide, value, opts) {
  slide.addText(value, { isTextBox: true, margin: 0, fontFace: FONT, fontSize: 18, color: INK, valign: 'top', objectName: name('text'), ...opts })
}

/** 새 장. part: problem(테라코타) · solution(초록) · tech(숲색) — 머리말 색만 다르다 */
// ONLY=2,5 처럼 주면 그 장만 만든다(문제 장을 찾을 때). 나머지 장은 버리는 발표 파일에 그린다
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null
const scrap = new pptxgen()
scrap.defineSlideMaster({ title: 'PLAIN', background: { color: CREAM } })
scrap.defineSlideMaster({ title: 'DARK', background: { color: FOREST } })
let shownNo = 0
/** 앞 장에서 '모핑'으로 넘어올 장(같은 '!!이름' 개체가 자리·모양을 바꾸며 이어짐) */
const MORPH_INTO = new Set()
/** 발표 중에는 건너뛰는 예비 장(질의응답용). 슬라이드 쇼에서 숨김 */
const HIDDEN = new Set()
function addSlide({ kicker = '', title = '', part = 'solution', dark = false, source = '', number = true, morph = false, hidden = false } = {}) {
  shownNo += 1
  const slide = (ONLY && !ONLY.has(shownNo) ? scrap : pres).addSlide({ masterName: dark ? 'DARK' : 'PLAIN' })
  slideNo += 1
  if (morph && !ONLY) MORPH_INTO.add(slideNo)
  if (hidden && !ONLY) HIDDEN.add(slideNo)
  const kickerColor = { problem: TERRA, solution: GREEN, tech: FOREST, plain: MUTED }[part] ?? GREEN
  if (kicker) text(slide, kicker, { x: LEFT, y: 0.42, w: 9, h: 0.34, fontSize: 15, bold: true, color: dark ? SUN : kickerColor })
  if (title) text(slide, title, { x: LEFT, y: 0.78, w: RIGHT - LEFT, h: 0.8, fontSize: 32, bold: true, color: dark ? PAPER : INK, valign: 'top' })
  if (source) text(slide, source, { x: LEFT, y: 7.06, w: 11.4, h: 0.26, fontSize: 10, color: dark ? 'B9C9C1' : MUTED, valign: 'middle' })
  if (number) text(slide, String(slideNo), { x: RIGHT - 0.6, y: 7.06, w: 0.6, h: 0.26, fontSize: 11, color: dark ? 'B9C9C1' : MUTED, align: 'right', valign: 'middle' })
  return slide
}

/** 둥근 카드. dash면 점선 테두리 */
function card(slide, { x, y, w, h, fill = PAPER, line, lineWidth = 1, dash = false, radius = 0.14, shadow = true }) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: radius, fill: { color: fill },
    line: line ? { color: line, width: lineWidth, ...(dash ? { dashType: 'dash' } : {}) } : { type: 'none' },
    // pptxgenjs가 shadow 객체를 그 자리에서 바꿔 쓰므로 카드마다 새 객체를 넘긴다
    shadow: shadow ? { type: 'outer', color: '2B2420', opacity: 0.09, blur: 10, offset: 2, angle: 90 } : undefined,
    objectName: name('card'),
  })
}

/** 휴대폰 화면(375×812 캡처를 3배로 찍은 것). h는 화면 높이(인치). crop: 위·아래를 잘라 쓸 때 [top, bottom] 비율 */
function phone(slide, file, { x, y, h, frame = INK }) {
  const { w: pw, h: ph } = sizeOf(file)
  const w = h * (pw / ph)
  const pad = 0.075
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2, rectRadius: 0.2, fill: { color: frame }, line: { type: 'none' },
    shadow: { type: 'outer', color: '2B2420', opacity: 0.22, blur: 12, offset: 3, angle: 90 }, objectName: name('phone'),
  })
  slide.addImage({ path: file, x, y, w, h, objectName: name('screen') })
  return w
}

/** 기관 화면 등 데스크톱 캡처: 흰 테두리 + 옅은 그림자. label이 있으면 왼쪽 위에 꼬리표 */
function screen(slide, file, { x, y, w, h, label, labelFill = FOREST }) {
  const { w: pw, h: ph } = sizeOf(file)
  if (w && !h) h = w * (ph / pw)
  if (h && !w) w = h * (pw / ph)
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, rectRadius: 0.08, fill: { color: PAPER }, line: { color: LINE, width: 0.75 },
    shadow: { type: 'outer', color: '2B2420', opacity: 0.14, blur: 12, offset: 3, angle: 90 }, objectName: name('screen-frame'),
  })
  slide.addImage({ path: file, x, y, w, h, objectName: name('screen') })
  if (label) {
    const lw = 0.32 + label.length * 0.17
    card(slide, { x: x + 0.1, y: y - 0.24, w: lw, h: 0.38, fill: labelFill, shadow: false, radius: 0.08 })
    text(slide, label, { x: x + 0.1, y: y - 0.24, w: lw, h: 0.38, fontSize: 13, bold: true, color: PAPER, align: 'center', valign: 'middle' })
  }
  return { w, h }
}

function badge(slide, label, { x, y, size = 0.46, fill = GREEN, color = PAPER, fontSize = 16 }) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: size, h: size, fill: { color: fill }, line: { type: 'none' }, objectName: name('badge') })
  text(slide, label, { x, y, w: size, h: size, align: 'center', valign: 'middle', fontSize, bold: true, color })
}

function arrow(slide, { x, y, w = 0, h = 0, color = GREEN, width = 3, both = false, dash = false }) {
  slide.addShape(pres.shapes.LINE, {
    x, y, w, h, line: { color, width, endArrowType: 'triangle', ...(both ? { beginArrowType: 'triangle' } : {}), ...(dash ? { dashType: 'dash' } : {}) }, objectName: name('arrow'),
  })
}

function rule(slide, { x, y, w = 0, h = 0, color = GREEN, width = 3, dash = false, begin = false, end = false }) {
  slide.addShape(pres.shapes.LINE, {
    x, y, w, h, line: { color, width, ...(dash ? { dashType: 'dash' } : {}), ...(begin ? { beginArrowType: 'triangle' } : {}), ...(end ? { endArrowType: 'triangle' } : {}) }, objectName: name('rule'),
  })
}

/** 두 점을 잇는 선(어느 방향이든). 크기는 음수가 될 수 없어 상자는 양수로 두고 flipH·flipV로 방향을 준다.
 *  head: 'end'(끝점에 화살촉) | 'start' | 'both' | null */
function line(slide, x1, y1, x2, y2, { color = GREEN, width = 3, dash = false, head = 'end' } = {}) {
  const dx = x2 - x1
  const dy = y2 - y1
  slide.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(dx), h: Math.abs(dy), flipH: dx < 0, flipV: dy < 0,
    line: { color, width, ...(dash ? { dashType: 'dash' } : {}), ...(head === 'end' || head === 'both' ? { endArrowType: 'triangle' } : {}), ...(head === 'start' || head === 'both' ? { beginArrowType: 'triangle' } : {}) },
    objectName: name('line'),
  })
}

/** 그림 위 강조 테두리 */
function outline(slide, { x, y, w, h, color = TERRA, width = 3 }) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { type: 'none' }, line: { color, width }, objectName: name('outline') })
}

function blob(slide, { x, y, size, color = PEACH }) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: size, h: size, fill: { color }, line: { type: 'none' }, objectName: name('blob') })
}

/** 알약 모양 꼬리표 */
function pill(slide, label, { x, y, w, h = 0.42, fill = MINT, color = GREEN, fontSize = 15, bold = true, align = 'center' }) {
  card(slide, { x, y, w, h, fill, shadow: false, radius: h / 2 })
  text(slide, label, { x: x + 0.12, y, w: w - 0.24, h, fontSize, bold, color, align, valign: 'middle' })
}

/** 그림 아래 번호 + 설명 */
function caption(slide, n, label, { x, y, w, color = GREEN, fontSize = 18 }) {
  const size = 0.4
  const textW = Math.min(w - size - 0.12, 0.2 + label.length * fontSize * 0.0145)
  const left = x + (w - (size + 0.12 + textW)) / 2
  badge(slide, String(n), { x: left, y, size, fill: color, fontSize: 15 })
  text(slide, label, { x: left + size + 0.12, y, w: textW, h: size, fontSize, bold: true, color: INK, valign: 'middle' })
}

/** 발표 대본(슬라이드 노트). 맨 위에 이 장의 예상 시간과 누적 시간(한글 초당 4.8음절)을 적는다. 예비 장은 시간을 세지 않는다 */
let elapsed = 0
const SYLLABLES_PER_SECOND = 4.8
function notes(slide, script, { timed = true } = {}) {
  const body = script.trim()
  if (!timed) { slide.addNotes(`[예비 장 · 질의응답 때만]\n${body}`); return }
  const seconds = Math.round((body.match(/[가-힣]/g) ?? []).length / SYLLABLES_PER_SECOND)
  elapsed += seconds
  const clock = (total) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  slide.addNotes(`[약 ${seconds}초 · 누적 ${clock(elapsed)}]\n${body}`)
}

/** 그림의 일부를 잘라 새 파일로(PowerPoint 자르기는 원본 전체가 파일에 남으므로 미리 자른다). box는 비율 [left, top, right, bottom] */
async function crop(file, box, out) {
  const target = shot(out)
  const { w, h } = sizeOf(file)
  const [l, t, r, b] = box
  await sharp(file).extract({ left: Math.round(l * w), top: Math.round(t * h), width: Math.round((r - l) * w), height: Math.round((b - t) * h) }).png().toFile(target)
  return target
}

// ---------- 저장 + 테마 색 + 한글 줄바꿈 ----------
// 한글은 낱자가 아니라 띄어쓰기 단위로 줄을 바꾼다: 모든 단락에 eaLnBrk="0"·latinLnBrk="0", 글자 언어는 ko-KR
// (PowerPoint는 글자 언어가 en-US면 eaLnBrk와 상관없이 한글 낱말을 중간에서 자른다)
const EA_PARTS = /^ppt\/(?:presentation|slideMasters\/slideMaster\d+|slideLayouts\/slideLayout\d+|slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/
function koreanWordWrap(xml) {
  const set = (tag, attr) => (new RegExp(`\\b${attr}="`).test(tag) ? tag.replace(new RegExp(`\\b${attr}="[^"]*"`), `${attr}="0"`) : tag.replace(/^<a:\w+/, `$& ${attr}="0"`))
  const off = (tag) => set(set(tag, 'eaLnBrk'), 'latinLnBrk')
  return xml
    .replace(/<a:lvl[1-9]pPr\b[^>]*>/g, off)
    .replace(/<a:pPr\b[^>]*?(\/?)>/g, (tag) => off(tag))
    .replace(/(<a:(?:rPr|endParaRPr|defRPr)\b[^>]*\blang=")en-US"/g, '$1ko-KR"')
}
// pptxgenjs는 한 단락에 run이 여럿이면 run마다 a:pPr를 다시 적는다. a:pPr는 단락의 첫 자식 하나뿐이어야 하므로 나머지는 지운다
const PARA_PROPS = /<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g
function dropStrayParagraphProps(xml) {
  return xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (whole, inner) => {
    const head = inner.startsWith('<a:pPr') ? inner.match(PARA_PROPS)[0] : ''
    return `<a:p>${head}${inner.slice(head.length).replace(PARA_PROPS, '')}</a:p>`
  })
}
const MORPH_TRANSITION = '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
  + '<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159">'
  + '<p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" spd="slow" p14:dur="1250"><p159:morph option="byObject"/></p:transition>'
  + '</mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>'
async function finalize(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file))
  const part = 'ppt/theme/theme1.xml'
  let xml = await zip.file(part).async('string')
  for (const [slot, hex] of Object.entries(THEME.colors)) {
    xml = xml.replace(new RegExp(`<a:${slot}>[\\s\\S]*?</a:${slot}>`), `<a:${slot}><a:srgbClr val="${hex}"/></a:${slot}>`)
  }
  xml = xml.replace(/<a:clrScheme name="[^"]*">/, `<a:clrScheme name="${THEME.name}">`)
  xml = xml.replace(/<a:ea typeface=""\/>/g, `<a:ea typeface="${FONT}"/>`)
  zip.file(part, xml)
  for (const entry of Object.keys(zip.files).filter((n) => EA_PARTS.test(n))) {
    const original = await zip.file(entry).async('string')
    // 크기가 음수인 도형은 PowerPoint가 파일 복구를 묻는다(ST_PositiveCoordinate)
    const negative = original.match(/<a:ext cx="-?\d+" cy="-?\d+"\/>/g)?.filter((tag) => /"-/.test(tag))
    if (negative?.length) throw new Error(`${entry}: 크기가 음수인 도형 ${negative.length}개 (${negative[0]})`)
    let xml = koreanWordWrap(dropStrayParagraphProps(original))
    // 모핑 전환(PowerPoint 2019·365). 모핑을 모르는 프로그램은 Fallback의 페이드로 넘어간다
    const number = Number(/slides\/slide(\d+)\.xml$/.exec(entry)?.[1])
    if (MORPH_INTO.has(number)) {
      xml = xml.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + MORPH_TRANSITION)
    }
    if (HIDDEN.has(number) && process.env.TALK_SHOW_ALL !== '1') xml = xml.replace(/<p:sld\b/, '<p:sld show="0"')
    zip.file(entry, xml)
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

// ===== 장별 화면 =====
const T = require('./talk-text.js')
/** capture-talk.js가 남긴 캡처 속 요소의 자리(그림 크기에 대한 비율) */
const MARKS = (() => { try { return JSON.parse(fs.readFileSync(shot('marks.json'), 'utf8')) } catch { return {} } })()
const PHONE_RATIO = 375 / 812
const SUN_LIGHT = 'FDF1CF'
const GREY = 'C9B8A6'

/** 그림 안의 표시 자리(비율) → 슬라이드 좌표 */
function at(frame, box, pad = 0.04) {
  return { x: frame.x + box.x * frame.w - pad, y: frame.y + box.y * frame.h - pad, w: box.w * frame.w + pad * 2, h: box.h * frame.h + pad * 2 }
}
function markBox(file, key) {
  const box = MARKS[file]?.[key]
  if (!box) throw new Error(`marks.json에 ${file} ${key}가 없습니다. node capture-talk.js를 다시 돌리세요.`)
  return box
}
const cropBox = (file, key) => { const b = markBox(file, key); return [b.x, b.y, b.x + b.w, b.y + b.h] }

/** 휴대폰 화면을 놓고 그 자리(frame)를 돌려준다 */
function phoneAt(slide, file, { x, y, h }) {
  const w = phone(slide, shot(file), { x, y, h })
  return { x, y, w, h }
}
function screenAt(slide, file, opts) {
  const size = screen(slide, file, opts)
  return { x: opts.x, y: opts.y, w: size.w, h: size.h }
}

/** 말풍선(부모님의 말) */
function bubble(slide, label, { x, y, w, h, fill = PAPER, color = INK, line = LINE, fontSize = 22, bold = true }) {
  card(slide, { x, y, w, h, fill, line, radius: 0.22 })
  text(slide, label, { x: x + 0.3, y, w: w - 0.6, h, fontSize, bold, color, valign: 'middle' })
}

/** 작은 꼬리표 */
function tag(slide, label, { x, y, fill = TERRA, color = PAPER, fontSize = 13, h = 0.34, w, align = 'left' }) {
  const width = w ?? 0.34 + [...label].reduce((sum, ch) => sum + (/[가-힣一-龥]/.test(ch) ? 1 : 0.6), 0) * fontSize / 72
  const left = align === 'right' ? x - width : x
  card(slide, { x: left, y, w: width, h, fill, shadow: false, radius: 0.08 })
  text(slide, label, { x: left, y, w: width, h, fontSize, bold: true, color, align: 'center', valign: 'middle' })
  return width
}

/** 그림 위 강조: 테두리 + 번호 배지(선택) */
function spot(slide, frame, file, key, { color = TERRA, n = null, pad = 0.03, width = 2.75 } = {}) {
  const box = at(frame, markBox(file, key), pad)
  outline(slide, { ...box, color, width })
  if (n !== null) badge(slide, String(n), { x: box.x - 0.2, y: box.y - 0.2, size: 0.4, fill: color, fontSize: 14 })
  return box
}

/** 사람 그림(머리 + 몸). 몸은 둥근 사각형 + 아래 절반을 덮는 사각형(위만 둥글게)
 *  pptxgenjs의 ROUND_2_SAME_RECTANGLE은 조정값 이름을 'adj'로 적어 PowerPoint가 그 뒤 도형을 버리거나 파일 복구를 묻는다 */
function person(slide, { x, y, size = 1, color = SAND }) {
  const head = 0.42 * size
  const bodyW = 0.74 * size
  const bodyH = 0.78 * size
  slide.addShape(pres.shapes.OVAL, { x: x + (bodyW - head) / 2, y, w: head, h: head, fill: { color }, line: { type: 'none' }, objectName: name('head') })
  const bodyY = y + head + 0.06 * size
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: bodyY, w: bodyW, h: bodyH, rectRadius: 0.3 * size, fill: { color }, line: { type: 'none' }, objectName: name('body') })
  slide.addShape(pres.shapes.RECTANGLE, { x, y: bodyY + bodyH / 2, w: bodyW, h: bodyH / 2, fill: { color }, line: { type: 'none' }, objectName: name('body-base') })
}

function cross(slide, { cx, cy, size = 0.5, objectName }) {
  slide.addShape(pres.shapes.OVAL, { x: cx - size / 2, y: cy - size / 2, w: size, h: size, fill: { color: PAPER }, line: { color: TERRA, width: 2.25 }, objectName: objectName ?? name('cut') })
  text(slide, '✕', { x: cx - size / 2, y: cy - size / 2, w: size, h: size, fontSize: size * 34, bold: true, color: TERRA, align: 'center', valign: 'middle' })
}

/**
 * 순환 그림: 왼쪽 노드(부모님) → 위 호(질문, 테라코타) → 오른쪽 노드(센터) → 아래 호(답, 초록) → 왼쪽.
 * 호는 같은 타원의 위·아래 부분이고, 끝이 노드 위·아래 가장자리 바로 앞에서 멈춘다. 노드는 호 위에 그린다.
 * state: 'loop'(실선) | 'broken'(점선 + ✕) | 'mini'(오른쪽 위 작은 지도). names: 모핑용 개체 이름 접두어
 */
function loopGraphic(slide, g) {
  const { cx, cy, a, nodeW, nodeH, state = 'loop', left = '부모님', right = '센터', leftSub = '', rightSub = '', topLabel = '', bottomLabel = '', names = null, focus = null, lineW = 6 } = g
  const gap = g.gap ?? 0.12
  const b = g.b ?? nodeH * 1.6
  // 호는 노드 안쪽에서 시작해(가려짐) 다른 노드 가장자리 바로 바깥에서 화살촉으로 끝난다.
  // ARC의 각도는 중심에서 그은 선의 실제 각도라, 원하는 높이(h)에서 타원 위의 점을 구해 그 각도를 쓴다
  const deg = (r) => (r * 180) / Math.PI
  const angleAt = (h) => deg(Math.atan2(h, a * Math.sqrt(Math.max(0.01, 1 - (h / b) ** 2))))
  const startOff = angleAt(nodeH / 2 - 0.08)
  const endOff = angleAt(nodeH / 2 + gap)
  const mini = state === 'mini'
  const topOn = !mini || ['up', 'center', 'next', 'closed', 'plan'].includes(focus)
  const bottomOn = !mini || ['next', 'closed', 'plan'].includes(focus)
  const dashed = state === 'broken'
  const arc = (range, color, on, key) => slide.addShape(pres.shapes.ARC, {
    x: cx - a, y: cy - b, w: 2 * a, h: 2 * b, angleRange: range,
    line: { color: mini && !on ? 'D9CBBB' : color, width: lineW, endArrowType: 'triangle', ...(dashed ? { dashType: 'dash' } : {}) },
    objectName: names ? `!!${names}-${key}` : name(`loop-${key}`),
  })
  arc([180 + startOff, 360 - endOff], TERRA, topOn, 'top')
  arc([startOff, 180 - endOff], dashed ? GREY : GREEN, bottomOn, 'bottom')
  const node = (x, label, sub, fill, color, key) => {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x - nodeW / 2, y: cy - nodeH / 2, w: nodeW, h: nodeH, rectRadius: Math.min(0.2, nodeH / 2), fill: { color: fill }, line: { color: mini ? 'E3D5C3' : fill, width: 1 },
      shadow: mini ? undefined : { type: 'outer', color: '2B2420', opacity: 0.1, blur: 10, offset: 2, angle: 90 },
      objectName: names ? `!!${names}-${key}` : name(`node-${key}`),
    })
    const big = mini ? 9 : Math.min(26, nodeH * (state === 'broken' ? 24 : 16))
    text(slide, sub ? [{ text: label, options: { breakLine: true } }, { text: sub, options: { fontSize: Math.max(10, big * 0.58), bold: true, color: MUTED } }] : label, {
      x: x - nodeW / 2, y: cy - nodeH / 2, w: nodeW, h: nodeH, fontSize: big, bold: true, color, align: 'center', valign: 'middle', lineSpacingMultiple: 1.1,
      objectName: names ? `!!${names}-${key}-label` : name('node-label'),
    })
  }
  node(cx - a, left, leftSub, mini ? (focus === 'parent' ? PEACH : PAPER) : PEACH, mini ? INK : TERRA, 'left')
  node(cx + a, right, rightSub, mini ? (['center', 'plan'].includes(focus) ? MINT : PAPER) : MINT, mini ? INK : GREEN, 'right')
  if (dashed) {
    cross(slide, { cx, cy: cy - b, size: 0.5, objectName: names ? `!!${names}-cut-top` : undefined })
    cross(slide, { cx, cy: cy + b, size: 0.5, objectName: names ? `!!${names}-cut-bottom` : undefined })
  }
  // 이름표는 고리 안쪽(꼭대기 아래, 바닥 위)에
  const labelW = Math.max(1.2, 2 * (a - nodeW / 2) - 0.3)
  if (topLabel) text(slide, topLabel, { x: cx - labelW / 2, y: cy - b + 0.34, w: labelW, h: 0.5, fontSize: g.labelSize ?? 19, bold: true, color: TERRA, align: 'center', valign: 'top' })
  if (bottomLabel) text(slide, bottomLabel, { x: cx - labelW / 2, y: cy + b - 0.84, w: labelW, h: 0.5, fontSize: g.labelSize ?? 19, bold: true, color: dashed ? MUTED : GREEN, align: 'center', valign: 'bottom' })
  if (mini && focus) {
    const r = (d) => (d * Math.PI) / 180
    const onEllipse = (d) => { const t = r(d); const k = (a * b) / Math.sqrt((b * Math.cos(t)) ** 2 + (a * Math.sin(t)) ** 2); return [cx + k * Math.cos(t), cy + k * Math.sin(t)] }
    const spots = { parent: [cx - a, cy - nodeH / 2 - 0.02], up: [cx, cy - b], center: [cx + a, cy - nodeH / 2 - 0.02], next: onEllipse(135), closed: [cx, cy + b], plan: [cx, cy + b] }
    const [px, py] = spots[focus]
    slide.addShape(pres.shapes.OVAL, { x: px - 0.1, y: py - 0.1, w: 0.2, h: 0.2, fill: { color: SUN }, line: { color: INK, width: 1.25 }, objectName: name('here') })
  }
}

/** 6~11장 오른쪽 위 작은 지도 */
function miniMap(slide, focus, caption) {
  const cx = RIGHT - 1.05
  loopGraphic(slide, { cx, cy: 0.66, a: 0.62, nodeW: 0.58, nodeH: 0.28, b: 0.4, gap: 0.04, state: 'mini', left: '부모님', right: '센터', focus, lineW: 2.25 })
  if (caption) text(slide, caption, { x: cx - 2.95, y: 0.51, w: 1.95, h: 0.3, fontSize: 11, bold: true, color: MUTED, align: 'right', valign: 'middle' })
}

/** 표지·마무리의 순환: 휴대폰 오른쪽 → 기관 화면 위(못 찾은 질문), 기관 화면 왼쪽 → 휴대폰 아래(덧붙인 안내) */
function elbowLoop(slide, p, d, t) {
  const topY = p.y + 0.85
  const dcx = d.x + d.w / 2
  line(slide, p.x + p.w + 0.12, topY, dcx, topY, { color: TERRA, width: 3.5, head: null })
  line(slide, dcx, topY, dcx, d.y - 0.36, { color: TERRA, width: 3.5 })
  text(slide, t.toDesk, { x: p.x + p.w + 0.2, y: topY - 0.48, w: dcx - p.x - p.w + 0.6, h: 0.4, fontSize: 15, bold: true, color: TERRA, align: 'center', valign: 'bottom' })
  const pcx = p.x + p.w / 2
  // 아래 화살표는 휴대폰 아래쪽으로 지나가야 위로 올라가며 휴대폰을 가리킨다
  const botY = Math.min(d.y + d.h - 0.18, Math.max(p.y + p.h + 0.5, d.y + d.h * 0.62))
  line(slide, d.x - 0.14, botY, pcx, botY, { color: GREEN, width: 3.5, head: null })
  line(slide, pcx, botY, pcx, p.y + p.h + 0.14, { color: GREEN, width: 3.5 })
  text(slide, t.toPhone, { x: pcx + 0.15, y: botY + 0.08, w: d.x - pcx - 0.3, h: 0.4, fontSize: 15, bold: true, color: GREEN, align: 'center' })
}

/** 오른쪽 설명: 번호 + 굵은 한 줄 + (선택) 작은 설명 */
function legend(slide, items, { x, y = 2.05, step = 1.45, colors }) {
  items.forEach((item, index) => {
    const [main, sub] = Array.isArray(item) ? item : [item, '']
    const top = y + index * step
    badge(slide, String(index + 1), { x, y: top, size: 0.42, fill: colors[index], fontSize: 14 })
    const runs = [{ text: main, options: { bold: true, fontSize: 17, color: INK, breakLine: !!sub } }]
    if (sub) runs.push({ text: sub, options: { fontSize: 13, color: MUTED } })
    text(slide, runs, { x: x + 0.55, y: top - 0.04, w: RIGHT - x - 0.55, h: step - 0.1, lineSpacingMultiple: 1.1 })
  })
}

async function build() {
  // ---------- 1. 표지 ----------
  {
    const t = T.s1
    const slide = addSlide({ number: false })
    blob(slide, { x: 7.0, y: -1.7, size: 7.9 })
    blob(slide, { x: -1.0, y: 6.0, size: 2.3, color: MINT })
    text(slide, t.kicker, { x: LEFT, y: 1.05, w: 6.4, h: 0.4, fontSize: 17, bold: true, color: TERRA })
    text(slide, t.title, { x: LEFT, y: 1.5, w: 6.4, h: 1.25, fontSize: 66, bold: true, color: INK })
    text(slide, [
      { text: '부모님의 ', options: { color: INK } }, { text: '질문', options: { color: TERRA } }, { text: '이', options: { color: INK, breakLine: true } },
      { text: '다음 프로그램', options: { color: GREEN } }, { text: '이 되는 곳', options: { color: INK } },
    ], { x: LEFT, y: 2.95, w: 6.4, h: 1.4, fontSize: 36, bold: true, lineSpacingMultiple: 1.05 })
    text(slide, t.subtitle, { x: LEFT, y: 4.6, w: 6.4, h: 0.45, fontSize: 18, color: MUTED })
    text(slide, t.team, { x: LEFT, y: 6.4, w: 6.4, h: 0.45, fontSize: 17, color: INK })
    const p = phoneAt(slide, 'p1-intro-ko.png', { x: 7.3, y: 0.95, h: 4.05 })
    const deskW = 2.95
    const d = screenAt(slide, shot('d1-questions.png'), { x: RIGHT - deskW, y: 3.6, w: deskW, label: t.deskLabel })
    elbowLoop(slide, p, d, t)
    notes(slide, t.script)
  }
  // ---------- 2. 포스터 한 장 ----------
  {
    const t = T.s2
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'problem' })
    const size = 5.35
    const poster = { x: RIGHT - size, y: 1.7, w: size, h: size }
    screen(slide, img('poster-sports-ko.jpg'), poster)
    const rows = [{ x: 0.03, y: 0.655, w: 0.62, h: 0.066 }, { x: 0.03, y: 0.763, w: 0.62, h: 0.055 }]
    const bubbleW = 5.45
    t.bubbles.forEach((label, index) => {
      const y = 1.95 + index * 1.55
      const missing = index === 2
      bubble(slide, label, { x: LEFT, y, w: bubbleW, h: 1.12, fill: missing ? PEACH : PAPER, line: missing ? TERRA : LINE, fontSize: 24 })
      if (!missing) {
        const row = at(poster, rows[index], 0.03)
        outline(slide, { ...row, color: TERRA, width: 2.5 })
        line(slide, LEFT + bubbleW, y + 0.56, row.x, row.y + row.h / 2, { color: TERRA, width: 1.75, head: null })
      } else {
        line(slide, LEFT + bubbleW + 0.08, y + 0.56, poster.x - 0.2, y + 0.56, { color: TERRA, width: 2.5, dash: true, head: null })
        cross(slide, { cx: poster.x - 0.62, cy: y + 0.56, size: 0.46 })
        tag(slide, t.missingTag, { x: LEFT + 0.3, y: y + 1.2, fontSize: 14, h: 0.38 })
      }
    })
    notes(slide, t.script)
  }
  // ---------- 3. 숫자로 보면 ----------
  {
    const t = T.s3
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'problem', source: t.source })
    const size = 0.86
    const step = 0.74 * size + 0.3
    const rowW = 11 * 0.74 * size + 10 * 0.3
    const px = (W - rowW) / 2
    for (let index = 0; index < 11; index++) person(slide, { x: px + index * step, y: 1.8, size, color: index === 10 ? TERRA : 'E2D3C0' })
    const cardW = (RIGHT - LEFT - 2 * 0.3) / 3
    t.numbers.forEach(([value, label], index) => {
      const x = LEFT + index * (cardW + 0.3)
      card(slide, { x, y: 3.55, w: cardW, h: 3.2 })
      text(slide, value, { x: x + 0.3, y: 3.75, w: cardW - 0.6, h: 1.1, fontSize: 42, bold: true, color: TERRA, valign: 'middle' })
      text(slide, label, { x: x + 0.3, y: 4.95, w: cardW - 0.6, h: 1.6, fontSize: 18, color: INK })
    })
    notes(slide, t.script)
  }
  // ---------- 4. 휴대폰 안에서 끝나는 질문 (끊긴 두 방향) ----------
  {
    const t = T.s4
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'problem', source: t.source })
    const site = screenAt(slide, img('problem-translated-site.png'), { x: LEFT + 0.05, y: 1.8, h: 5.0 })
    outline(slide, { x: site.x + 0.02, y: site.y + 0.02, w: site.w - 0.04, h: 0.3 * site.h, color: GREEN, width: 1.75 })
    tag(slide, t.translatedTag, { x: site.x + site.w + 0.15, y: site.y + 0.25, fill: GREEN, fontSize: 13 })
    outline(slide, { x: site.x + 0.225 * site.w, y: site.y + 0.345 * site.h, w: 0.775 * site.w, h: 0.655 * site.h, color: TERRA, width: 3 })
    text(slide, t.posterNote, { x: site.x + site.w + 0.18, y: site.y + 0.36 * site.h, w: 3.0, h: 1.1, fontSize: 19, bold: true, color: TERRA })
    const nx = 8.15
    card(slide, { x: nx, y: 1.8, w: RIGHT - nx, h: 1.5 })
    text(slide, t.big, { x: nx + 0.3, y: 1.8, w: 1.6, h: 1.5, fontSize: 58, bold: true, color: TERRA, valign: 'middle' })
    text(slide, t.bigLabel, { x: nx + 1.95, y: 1.8, w: RIGHT - nx - 2.1, h: 1.5, fontSize: 16, color: INK, valign: 'middle' })
    // 아래: 5장 순환과 같은 두 노드, 화살표는 점선 + ✕ (모핑으로 5장에 이어짐)
    loopGraphic(slide, { cx: (nx + RIGHT) / 2, cy: 5.15, a: 1.75, nodeW: 1.25, nodeH: 0.62, b: 0.95, gap: 0.08, state: 'broken', left: '부모님', right: '센터', names: 'loop', lineW: 3.5 })
    text(slide, t.toCenter, { x: nx, y: 3.62, w: RIGHT - nx, h: 0.32, fontSize: 13, bold: true, color: TERRA, align: 'center' })
    text(slide, t.toParent, { x: nx, y: 6.4, w: RIGHT - nx, h: 0.32, fontSize: 13, bold: true, color: MUTED, align: 'center' })
    notes(slide, t.script)
  }
  // ---------- 5. 그 질문이 기관까지 가는 길 (순환) ----------
  {
    const t = T.s5
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'solution', morph: true })
    const cx = W / 2
    const cy = 4.08
    loopGraphic(slide, { cx, cy, a: 3.75, nodeW: 3.3, nodeH: 1.35, b: 2.05, gap: 0.12, state: 'loop', left: '부모님', right: '센터 담당자', leftSub: t.agentsParent, rightSub: t.agentsDesk, topLabel: t.top, bottomLabel: t.bottom, names: 'loop', lineW: 7, labelSize: 20 })
    card(slide, { x: LEFT, y: 6.35, w: RIGHT - LEFT, h: 0.58, fill: FOREST, shadow: false })
    text(slide, t.band, { x: LEFT + 0.3, y: 6.35, w: RIGHT - LEFT - 0.6, h: 0.58, fontSize: 17, bold: true, color: PAPER, align: 'center', valign: 'middle' })
    notes(slide, t.script)
  }
  // ---------- 6. 입구: 편한 언어로 읽는 포스터 ----------
  {
    const t = T.s6
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'solution' })
    miniMap(slide, 'parent', t.map)
    const p = phoneAt(slide, 'p1-intro-ko.png', { x: LEFT + 0.05, y: 1.95, h: 4.3 })
    text(slide, t.phoneLabel, { x: p.x - 0.3, y: 6.38, w: p.w + 0.6, h: 0.35, fontSize: 14, bold: true, color: MUTED, align: 'center' })
    const posters = [['poster-sports-ko.jpg', t.posterLabels[0], 2.7, MUTED], ['poster-sports-vi.jpg', t.posterLabels[1], 3.15, GREEN], ['poster-sports-zh.jpg', t.posterLabels[2], 3.15, GREEN]]
    let x = p.x + p.w + 0.55
    posters.forEach(([file, label, size, fill], index) => {
      const y = 2.35 + (3.15 - size)
      screen(slide, img(file), { x, y, w: size, h: size })
      tag(slide, label, { x, y: y - 0.48, fill, fontSize: 14, h: 0.36 })
      if (index === 0) arrow(slide, { x: x + size + 0.08, y: y + size / 2, w: 0.3, color: GREY, width: 3 })
      x += size + (index === 0 ? 0.45 : 0.3)
    })
    text(slide, t.lines[0], { x: p.x + p.w + 0.55, y: 5.85, w: 7.0, h: 0.45, fontSize: 21, bold: true, color: INK })
    text(slide, t.lines[1], { x: p.x + p.w + 0.55, y: 6.32, w: 7.0, h: 0.4, fontSize: 16, color: MUTED })
    card(slide, { x: RIGHT - 2.35, y: 5.82, w: 2.35, h: 0.92, fill: FOREST, shadow: false })
    text(slide, [{ text: t.badge, options: { fontSize: 26, breakLine: true } }, { text: t.badgeNote, options: { fontSize: 11, bold: false } }], { x: RIGHT - 2.35, y: 5.82, w: 2.35, h: 0.92, bold: true, color: PAPER, align: 'center', valign: 'middle' })
    notes(slide, t.script)
  }
  // ---------- 7. 상담: 공고에 없으면 없다고 ----------
  {
    const t = T.s7
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'solution' })
    miniMap(slide, 'parent', t.map)
    bubble(slide, t.question, { x: LEFT, y: 1.95, w: 2.9, h: 2.3, fontSize: 18, line: TERRA })
    text(slide, t.questionNote, { x: LEFT, y: 4.32, w: 2.9, h: 0.35, fontSize: 13, color: MUTED })
    const h = 4.95
    const a = phoneAt(slide, 'p5-answer-vi.png', { x: 3.95, y: 1.85, h })
    const b = phoneAt(slide, 'p5-inquiry-vi.png', { x: a.x + a.w + 0.45, y: 1.85, h })
    spot(slide, a, 'p5-answer-vi.png', 'step3', { color: TERRA, n: 1 })
    spot(slide, a, 'p5-answer-vi.png', 'ask', { color: TERRA, n: 2 })
    spot(slide, b, 'p5-inquiry-vi.png', 'inquiry', { color: GREEN, n: 3 })
    legend(slide, t.legend, { x: b.x + b.w + 0.4, colors: [TERRA, TERRA, GREEN] })
    notes(slide, t.script)
  }
  // ---------- 8. 이름 없이 기관에 닿은 질문 ----------
  {
    const t = T.s8
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'solution' })
    miniMap(slide, 'up', t.map)
    const p = phoneAt(slide, 'p6-reported-vi.png', { x: LEFT + 0.15, y: 1.85, h: 4.95 })
    const u = spot(slide, p, 'p6-reported-vi.png', 'unanswered', { color: TERRA })
    tag(slide, t.reportedTag, { x: u.x + u.w, y: u.y - 0.42, fontSize: 12.5, align: 'right' })
    const dx = p.x + p.w + 1.45
    const d = screenAt(slide, shot('d1-questions.png'), { x: dx, y: 2.0, w: Math.min(6.0, RIGHT - dx), label: t.deskLabel })
    spot(slide, d, 'd1-questions.png', 'bars', { color: TERRA, width: 1.5 })
    const row = spot(slide, d, 'd1-questions.png', 'newq', { color: TERRA, width: 3 })
    tag(slide, t.newTag, { x: row.x + row.w, y: row.y - 0.4, fontSize: 13, align: 'right' })
    arrow(slide, { x: p.x + p.w + 0.18, y: 4.25, w: 1.05, color: TERRA, width: 5 })
    text(slide, t.arrowLabel, { x: p.x + p.w + 0.05, y: 4.42, w: 1.35, h: 0.5, fontSize: 14, bold: true, color: TERRA, align: 'center' })
    text(slide, t.compare, { x: d.x, y: 1.5, w: d.w, h: 0.3, fontSize: 12.5, color: MUTED, align: 'right' })
    const ly = d.y + d.h + 0.32
    text(slide, [
      { text: t.goes[0], options: { bold: true, color: GREEN } }, { text: t.goes[1], options: { color: INK, breakLine: true } },
      { text: t.stays[0], options: { bold: true, color: TERRA } }, { text: t.stays[1], options: { color: INK } },
    ], { x: d.x, y: ly, w: d.w, h: 0.85, fontSize: 17, lineSpacingMultiple: 1.25 })
    notes(slide, t.script)
  }
  // ---------- 9. 담당자가 빈칸을 채워 바뀐 공고 ----------
  {
    const t = T.s9
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'solution' })
    miniMap(slide, 'center', t.map)
    const w = 5.75
    const before = screenAt(slide, shot('d2-blank.png'), { x: LEFT + 0.05, y: 2.05, w, label: t.beforeLabel, labelFill: MUTED })
    const asked = spot(slide, before, 'd2-blank.png', 'questions', { color: TERRA, width: 1.75 })
    tag(slide, t.askedTag, { x: asked.x + asked.w, y: asked.y - 0.36, fontSize: 12, h: 0.32, align: 'right' })
    spot(slide, before, 'd2-blank.png', 'blank', { color: TERRA, n: 1 })
    const ax = RIGHT - w
    const after = screenAt(slide, shot('d2-filled.png'), { x: ax, y: 2.05, w, label: t.afterLabel, labelFill: GREEN })
    spot(slide, after, 'd2-filled.png', 'blank', { color: GREEN, n: 3 })
    spot(slide, after, 'd2-filled.png', 'preview', { color: GREEN })
    arrow(slide, { x: before.x + before.w + 0.12, y: before.y + before.h / 2, w: ax - (before.x + before.w) - 0.3, color: GREY, width: 3.5 })
    const ny = 2.05 + Math.max(before.h, after.h) + 0.4
    t.notes.forEach((note, index) => {
      const x = index === 0 ? LEFT + 0.05 : ax
      badge(slide, String(index === 0 ? 1 : 3), { x, y: ny, size: 0.42, fill: index === 0 ? TERRA : GREEN, fontSize: 14 })
      text(slide, note, { x: x + 0.56, y: ny - 0.04, w: w - 0.6, h: 0.9, fontSize: 17, bold: true, color: INK })
    })
    badge(slide, '2', { x: LEFT + 0.05, y: ny + 1.0, size: 0.42, fill: FOREST, fontSize: 14 })
    text(slide, t.codeNote, { x: LEFT + 0.61, y: ny + 0.96, w: w - 0.6, h: 0.8, fontSize: 16, color: INK })
    const answered = await crop(shot('d1-answered.png'), cropBox('d1-answered.png', 'newq'), 'answered-row.png')
    const r = screenAt(slide, answered, { x: ax, y: ny + 1.02, w })
    outline(slide, { x: r.x + r.w * 0.66, y: r.y - 0.03, w: r.w * 0.34 + 0.03, h: r.h + 0.06, color: GREEN, width: 2.5 })
    notes(slide, t.script)
  }
  // ---------- 10. 다음 가정은 같은 질문에 바로 답 ----------
  {
    const t = T.s10
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'solution' })
    miniMap(slide, 'next', t.map)
    const h = 4.95
    const a = phoneAt(slide, 'p7-addenda-zh.png', { x: 3.95, y: 1.85, h })
    const b = phoneAt(slide, 'p7-both-zh.png', { x: a.x + a.w + 0.45, y: 1.85, h })
    spot(slide, a, 'p7-addenda-zh.png', 'addenda', { color: GREEN, n: 1 })
    spot(slide, b, 'p7-both-zh.png', 'lead', { color: GREEN, n: 2 })
    spot(slide, b, 'p7-both-zh.png', 'cited', { color: GREEN, n: 3 })
    bubble(slide, t.question, { x: LEFT, y: 1.95, w: 2.9, h: 1.85, fontSize: 18, line: TERRA })
    text(slide, t.questionNote, { x: LEFT, y: 3.87, w: 2.9, h: 0.32, fontSize: 13, color: MUTED })
    text(slide, t.before, { x: LEFT, y: 4.6, w: 2.9, h: 1.0, fontSize: 15, color: MUTED })
    legend(slide, t.legend, { x: b.x + b.w + 0.4, colors: [GREEN, GREEN, GREEN] })
    notes(slide, t.script)
  }
  // ---------- 11. 모인 조건과 질문으로 짠 다음 반 ----------
  {
    const t = T.s11
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'solution' })
    miniMap(slide, 'plan', t.map)
    const s = screenAt(slide, shot('d4-stats.png'), { x: LEFT + 0.05, y: 2.0, h: 4.85, label: t.statsLabel })
    spot(slide, s, 'd4-stats.png', 'interest', { color: TERRA, width: 2.25 })
    spot(slide, s, 'd4-stats.png', 'topic', { color: TERRA, width: 2.25 })
    text(slide, t.mask, { x: s.x, y: s.y + s.h + 0.05, w: s.w, h: 0.26, fontSize: 11, color: MUTED })
    const cx = s.x + s.w + 0.55
    const planCard = await crop(shot('d5-plan.png'), [0, 0, 1, 0.49], 'plan-card-top.png')
    const c = screenAt(slide, planCard, { x: RIGHT - 6.25, y: 2.75, w: 6.25, label: t.planLabel, labelFill: GREEN })
    const cls = at(c, (() => { const b = markBox('d5-plan.png', 'classes'); return { x: b.x, y: b.y / 0.49, w: b.w, h: b.h / 0.49 } })(), 0.03)
    outline(slide, { ...cls, color: GREEN, width: 2.75 })
    text(slide, [{ text: t.big, options: { fontSize: 44, bold: true, color: GREEN } }, { text: `  ${t.gain}`, options: { fontSize: 22, bold: true, color: GREEN } }], { x: cx, y: 1.75, w: RIGHT - cx, h: 0.85, align: 'right', valign: 'bottom' })
    text(slide, t.notes.join('   ·   '), { x: cx, y: c.y + c.h + 0.18, w: RIGHT - cx, h: 0.4, fontSize: 15, bold: true, color: INK, align: 'right' })
    notes(slide, t.script)
  }
  // ---------- 12. 아이가 자라는 동안 ----------
  {
    const t = T.s12
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'solution', source: t.source })
    const colW = (RIGHT - LEFT - 2 * 0.35) / 3
    const files = [null, 'poster-kpop-zh.jpg', 'poster-hs-vi.jpg']
    t.ages.forEach(([age, what], index) => {
      const x = LEFT + index * (colW + 0.35)
      card(slide, { x, y: 1.8, w: colW, h: 2.05 })
      text(slide, age, { x: x + 0.3, y: 1.95, w: 2.0, h: 0.5, fontSize: 22, bold: true, color: GREEN })
      text(slide, what, { x: x + 0.3, y: 2.5, w: colW - 2.1, h: 1.2, fontSize: 15, color: INK })
      const ph = 1.75
      const file = files[index]
      if (file) {
        const ratio = sizeOf(img(file))
        const pw = ph * (ratio.w / ratio.h)
        screen(slide, img(file), { x: x + colW - pw - 0.2, y: 1.95, w: pw, h: ph })
      } else {
        card(slide, { x: x + colW - 1.45, y: 1.95, w: 1.25, h: ph, fill: CREAM, line: GREY, dash: true, shadow: false, radius: 0.06 })
        text(slide, t.emptyFrame, { x: x + colW - 1.45, y: 1.95, w: 1.25, h: ph, fontSize: 11, color: MUTED, align: 'center', valign: 'middle' })
      }
      if (index < 2) arrow(slide, { x: x + colW + 0.03, y: 2.82, w: 0.29, color: GREY, width: 3 })
    })
    const stepW = (RIGHT - LEFT - 3 * 0.4) / 4
    t.stages.forEach((stage, index) => {
      const x = LEFT + index * (stepW + 0.4)
      card(slide, { x, y: 4.35, w: stepW, h: 0.85, fill: index === 0 ? FOREST : PAPER, shadow: index !== 0 })
      text(slide, stage, { x: x + 0.15, y: 4.35, w: stepW - 0.3, h: 0.85, fontSize: 17, bold: true, color: index === 0 ? PAPER : INK, align: 'center', valign: 'middle' })
      if (index < t.stages.length - 1) arrow(slide, { x: x + stepW + 0.05, y: 4.775, w: 0.3, color: GREY, width: 3 })
    })
    tag(slide, t.nowTag, { x: LEFT, y: 4.0, fill: SUN, color: INK, fontSize: 12, h: 0.3 })
    text(slide, t.nextNote, { x: LEFT + stepW * 0.55, y: 5.22, w: stepW + 0.6, h: 0.28, fontSize: 12, color: MUTED, align: 'center' })
    text(slide, t.metricsTitle, { x: LEFT, y: 5.45, w: 6, h: 0.36, fontSize: 15, bold: true, color: GREEN })
    const mW = (RIGHT - LEFT - 3 * 0.3) / 4
    t.metrics.forEach((metric, index) => {
      const x = LEFT + index * (mW + 0.3)
      card(slide, { x, y: 5.85, w: mW, h: 0.95, fill: index === 0 ? MINT : PAPER, shadow: index !== 0 })
      text(slide, metric, { x: x + 0.15, y: 5.85, w: mW - 0.3, h: 0.95, fontSize: 16, bold: true, color: index === 0 ? GREEN : INK, align: 'center', valign: 'middle' })
    })
    notes(slide, t.script)
  }
  // ---------- 13. 마무리 ----------
  {
    const t = T.s13
    const slide = addSlide({ number: false })
    blob(slide, { x: 7.0, y: -1.7, size: 7.9 })
    text(slide, t.kicker, { x: LEFT, y: 1.05, w: 6.4, h: 0.4, fontSize: 17, bold: true, color: TERRA })
    text(slide, [
      { text: '부모님의 ', options: { color: INK } }, { text: '질문', options: { color: TERRA } }, { text: '이', options: { color: INK, breakLine: true } },
      { text: '다음 프로그램', options: { color: GREEN } }, { text: '이 되는 곳', options: { color: INK } },
    ], { x: LEFT, y: 1.5, w: 6.5, h: 1.55, fontSize: 40, bold: true, lineSpacingMultiple: 1.05 })
    const chipW = 3.0
    t.chips.forEach((chip, index) => {
      const y = 3.35 + index * 0.66
      card(slide, { x: LEFT, y, w: chipW, h: 0.5, fill: index === 0 ? PEACH : index === t.chips.length - 1 ? FOREST : MINT, shadow: false, radius: 0.25 })
      text(slide, chip, { x: LEFT, y, w: chipW, h: 0.5, fontSize: 16, bold: true, color: index === 0 ? TERRA : index === t.chips.length - 1 ? PAPER : GREEN, align: 'center', valign: 'middle' })
      if (index < t.chips.length - 1) arrow(slide, { x: LEFT + chipW / 2, y: y + 0.51, h: 0.14, color: GREY, width: 2 })
    })
    text(slide, t.team, { x: LEFT, y: 6.4, w: 6.6, h: 0.4, fontSize: 16, color: INK })
    const p = phoneAt(slide, 'p7-addenda-zh.png', { x: 7.3, y: 0.95, h: 4.05 })
    const deskW = 2.95
    const d = screenAt(slide, shot('d1-answered.png'), { x: RIGHT - deskW, y: 3.6, w: deskW, label: t.deskLabel })
    elbowLoop(slide, p, d, t)
    text(slide, t.thanks, { x: RIGHT - 4, y: 6.4, w: 4, h: 0.5, fontSize: 22, bold: true, color: INK, align: 'right' })
    notes(slide, t.script)
  }

  // =========================================================
  // 예비 장(숨김): 질의응답 때 꺼내 보이는 장
  // =========================================================
  // ---------- 예비 1. 포스터 통번역 검증 ----------
  {
    const t = T.b1
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'tech', hidden: true })
    const w = 6.3
    t.rounds.forEach(([label, note, file, color], index) => {
      const y = 2.0 + index * 2.05
      tag(slide, label, { x: LEFT, y, fill: color, fontSize: 14, h: 0.38 })
      const r = screenAt(slide, img(file), { x: LEFT + 0.05, y: y + 0.55, w })
      const [ox, ow] = index === 0 ? [0.365, 0.245] : [0.345, 0.23]
      outline(slide, { x: r.x + ox * r.w, y: r.y - 0.04, w: ow * r.w, h: r.h + 0.08, color, width: 2.75 })
      text(slide, note, { x: LEFT, y: y + 0.6 + r.h + 0.1, w, h: 0.5, fontSize: 15, color: index === 0 ? TERRA : GREEN, bold: true })
    })
    const sx = LEFT + w + 0.6
    t.steps.forEach((step, index) => {
      const y = 1.95 + index * 0.72
      badge(slide, String(index + 1), { x: sx, y, size: 0.42, fill: index === 4 ? TERRA : FOREST, fontSize: 14 })
      text(slide, step, { x: sx + 0.56, y: y - 0.04, w: RIGHT - sx - 0.56, h: 0.5, fontSize: 16.5, bold: index === 4, color: INK, valign: 'middle' })
    })
    card(slide, { x: LEFT, y: 6.3, w: RIGHT - LEFT, h: 0.6, fill: FOREST, shadow: false })
    text(slide, t.band, { x: LEFT + 0.3, y: 6.3, w: RIGHT - LEFT - 0.6, h: 0.6, fontSize: 16, bold: true, color: PAPER, align: 'center', valign: 'middle' })
    notes(slide, t.script, { timed: false })
  }
  // ---------- 예비 2. 시스템 구조 ----------
  {
    const t = T.b2
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'tech', hidden: true })
    const half = (RIGHT - LEFT - 0.4) / 2
    t.screens.forEach(([who, what], index) => {
      const x = LEFT + index * (half + 0.4)
      card(slide, { x, y: 1.85, w: half, h: 0.95, fill: index === 0 ? PEACH : MINT })
      text(slide, [{ text: who, options: { bold: true, fontSize: 18, color: index === 0 ? TERRA : GREEN, breakLine: true } }, { text: what, options: { fontSize: 13.5, color: INK } }], { x: x + 0.3, y: 1.85, w: half - 0.6, h: 0.95, valign: 'middle' })
      arrow(slide, { x: x + half / 2, y: 2.84, h: 0.32, color: GREY, width: 3, both: true })
    })
    card(slide, { x: LEFT, y: 3.22, w: RIGHT - LEFT, h: 2.25, fill: PAPER })
    text(slide, t.server, { x: LEFT + 0.3, y: 3.3, w: 6, h: 0.4, fontSize: 17, bold: true, color: FOREST })
    const aw = (RIGHT - LEFT - 0.6 - 3 * 0.25) / 4
    t.agents.forEach(([nameLine, when], index) => {
      const x = LEFT + 0.3 + index * (aw + 0.25)
      card(slide, { x, y: 3.78, w: aw, h: 0.95, fill: CREAM, shadow: false, line: LINE })
      text(slide, [{ text: nameLine, options: { bold: true, fontSize: 16, breakLine: true } }, { text: when, options: { fontSize: 12.5, color: MUTED } }], { x: x + 0.15, y: 3.78, w: aw - 0.3, h: 0.95, color: INK, align: 'center', valign: 'middle' })
    })
    card(slide, { x: LEFT + 0.3, y: 4.86, w: RIGHT - LEFT - 0.6, h: 0.45, fill: FOREST, shadow: false, radius: 0.08 })
    text(slide, t.code, { x: LEFT + 0.45, y: 4.86, w: RIGHT - LEFT - 0.9, h: 0.45, fontSize: 14, bold: true, color: PAPER, align: 'center', valign: 'middle' })
    t.bottom.forEach(([who, what], index) => {
      const x = LEFT + index * (half + 0.4)
      card(slide, { x, y: 5.75, w: half, h: 0.95, fill: PAPER, line: index === 1 ? GREY : undefined, dash: index === 1 })
      text(slide, [{ text: who, options: { bold: true, fontSize: 16, color: FOREST, breakLine: true } }, { text: what, options: { fontSize: 13, color: INK } }], { x: x + 0.3, y: 5.75, w: half - 0.6, h: 0.95, valign: 'middle' })
      arrow(slide, { x: x + half / 2, y: 5.4, h: 0.32, color: GREY, width: 3, both: true })
    })
    text(slide, t.note, { x: LEFT, y: 6.78, w: RIGHT - LEFT - 0.8, h: 0.26, fontSize: 12, color: MUTED })
    notes(slide, t.script, { timed: false })
  }
  // ---------- 예비 3. 신뢰와 개인정보 ----------
  {
    const t = T.b3
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'tech', hidden: true })
    const colW = (RIGHT - LEFT - 2 * 0.35) / 3
    t.columns.forEach(([head, lines], index) => {
      const x = LEFT + index * (colW + 0.35)
      card(slide, { x, y: 1.95, w: colW, h: 4.75 })
      text(slide, head, { x: x + 0.35, y: 2.15, w: colW - 0.7, h: 0.55, fontSize: 22, bold: true, color: [TERRA, GREEN, FOREST][index] })
      text(slide, lines.map((line, k) => ({ text: line, options: { bullet: { code: '2022' }, breakLine: k < lines.length - 1, paraSpaceAfter: 10 } })), { x: x + 0.35, y: 2.85, w: colW - 0.7, h: 3.7, fontSize: 16.5, color: INK })
    })
    notes(slide, t.script, { timed: false })
  }

  // ---------- 예비 4. 기존 공공 챗봇과 다른 점 ----------
  {
    const t = T.b4
    const slide = addSlide({ kicker: t.kicker, title: t.title, part: 'tech', hidden: true })
    const shotH = 4.0
    const c = screenAt(slide, img('problem-chatbot-answer.png'), { x: LEFT + 0.05, y: 2.75, h: shotH })
    tag(slide, t.shotLabel, { x: LEFT + 0.05, y: 2.3, fill: MUTED, fontSize: 12, h: 0.32 })
    text(slide, t.asked, { x: LEFT, y: 1.7, w: c.w + 0.3, h: 0.55, fontSize: 12, color: MUTED })
    const tx = LEFT + c.w + 0.55
    const tw = RIGHT - tx
    const head = { bold: true, color: PAPER, fill: { color: FOREST }, fontSize: 14, valign: 'middle' }
    const rows = [[{ text: '', options: head }, { text: t.columns[0], options: head }, { text: t.columns[1], options: head }]]
    t.rows.forEach(([what, old, ours], index) => {
      const last = index === t.rows.length - 1
      const fill = { color: last ? 'FDF1CF' : index % 2 ? 'FFFFFF' : 'FBF6EE' }
      rows.push([
        { text: what, options: { bold: true, fontSize: 13, color: INK, fill, valign: 'middle' } },
        { text: old, options: { fontSize: 13, color: MUTED, fill, valign: 'middle' } },
        { text: ours, options: { fontSize: 13, color: last ? FOREST : INK, bold: last, fill, valign: 'middle' } },
      ])
    })
    slide.addTable(rows, { x: tx, y: 1.85, w: tw, colW: [1.45, (tw - 1.45) * 0.42, (tw - 1.45) * 0.58], rowH: 0.62, fontFace: FONT, border: { type: 'solid', color: 'E3D5C3', pt: 0.75 }, margin: [4, 8, 4, 8] })
    card(slide, { x: tx, y: 6.2, w: tw, h: 0.6, fill: FOREST, shadow: false })
    text(slide, t.band, { x: tx + 0.25, y: 6.2, w: tw - 0.5, h: 0.6, fontSize: 15, bold: true, color: PAPER, align: 'center', valign: 'middle' })
    notes(slide, t.script, { timed: false })
  }

  await pres.writeFile({ fileName: OUT })
  if (process.env.RAW !== '1') await finalize(OUT)
  console.log(`저장: ${OUT} (${slideNo}장)`)
}

build().catch((error) => { console.error(error); process.exit(1) })
