import type { AttendanceRule, Audience, CompanionRule, Evidence, Weekday } from '../types'

// 근거 인용 검사와 값-인용 대조. 모두 순수 함수.

const SEPARATORS = /[\s\p{P}\p{S}]+/gu

/**
 * 비교용 정규화: NFKC, 소문자, 공백·문장부호·기호 제거.
 * 숫자와 숫자 사이의 구분은 '·'로 남겨 '10:00'과 '1,000'이 같아지지 않게 한다.
 */
export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase()
    .replace(SEPARATORS, ' ')
    .replace(/(\d) (?=\d)/g, '$1·')
    .replace(/ /g, '')
}

/** 인용이 원문(이미 정규화된 문자열)에 들어 있는지. 두 글자 미만 인용은 근거로 보지 않는다 */
function containsNormalized(normalizedSource: string, quote: string): boolean {
  const needle = normalizeForMatch(quote)
  return needle.length >= 2 && normalizedSource.includes(needle)
}

export function quoteInSource(quote: string, sourceText: string): boolean {
  return containsNormalized(normalizeForMatch(sourceText), quote)
}

/** 각 인용이 원문에 실제로 있는지 표시한다 */
export function verifyEvidence(quotes: { field: string; quote: string }[], sourceText: string): Evidence[] {
  const source = normalizeForMatch(sourceText)
  return quotes.map(({ field, quote }) => ({ field, quote, verified: containsNormalized(source, quote) }))
}

// ---- 값이 인용 안에 실제로 적혀 있는지 대조 ----

const NATIVE_NUMBERS: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 }

/** 인용 속 정수들. 천 단위 쉼표는 붙이고, '1만 5천' 같은 표기도 계산한다 */
export function numbersIn(text: string): number[] {
  const plain = text.normalize('NFKC').replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
  const numbers = [...plain.matchAll(/\d+/g)].map((match) => Number(match[0]))
  for (const match of plain.matchAll(/(\d+)\s*만(?:\s*(\d+)\s*천)?/g)) {
    numbers.push(Number(match[1]) * 10000 + Number(match[2] ?? 0) * 1000)
  }
  for (const match of plain.matchAll(/(?<![\d만]\s*)(\d+)\s*천/g)) numbers.push(Number(match[1]) * 1000)
  // '두 회차', '세 명'처럼 고유어 수 + 단위
  for (const match of plain.matchAll(/(?<![가-힣])(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?=회|번|명|가족|팀|개|차례|날|주)/g)) {
    numbers.push(NATIVE_NUMBERS[match[1]])
  }
  return numbers
}

/** 인용에 적힌 네 자리 연도 */
export function yearsIn(text: string): number[] {
  return [...text.normalize('NFKC').matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].map((match) => Number(match[1]))
}

export interface DateMention {
  year: number | null
  month: number
  day: number
}

// 2026-10-19 · 2026.11.07 · 2026. 11. 15. · 2026년 11월 7일 · 11월 7일 · 11.7. · 11/7, 그리고 '11월 7일, 14일'의 뒤 날짜
const DATE_PATTERN = /(?<![\d.])(?:(\d{4})\s*(?:년|[-./])\s*)?(\d{1,2})\s*(?:월|[-./])\s*(\d{1,2})(?![\d:])(?:\s*일)?|(?<![\d.\-/월])(\d{1,2})\s*일(?!\s*간)/g

/** 인용에 적힌 날짜 표기들. 시각('10:00')이나 흩어진 숫자는 날짜로 보지 않는다 */
export function datesIn(text: string): DateMention[] {
  const mentions: DateMention[] = []
  let year: number | null = null
  let month: number | null = null
  for (const match of text.normalize('NFKC').matchAll(DATE_PATTERN)) {
    const [, fullYear, fullMonth, fullDay, bareDay] = match
    if (fullMonth) {
      year = fullYear ? Number(fullYear) : null
      month = Number(fullMonth)
    }
    if (month === null) continue
    const day = Number(fullDay ?? bareDay)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) mentions.push({ year, month, day })
  }
  return mentions
}

/** YYYY-MM-DD가 인용의 날짜 표기 하나와 월·일이 같고, 인용에 연도가 있다면 그 연도도 맞는지 */
export function supportsDate(date: string, quote: string): boolean {
  const [year, month, day] = date.split('-').map(Number)
  const years = yearsIn(quote)
  if (years.length && !years.includes(year)) return false
  return datesIn(quote).some((mention) => mention.month === month && mention.day === day && (mention.year === null || mention.year === year))
}

interface ClockToken { hour: number; minute: number; meridiem: 'am' | 'pm' | null }

function clockTokens(text: string): ClockToken[] {
  const plain = text.normalize('NFKC')
  const tokens: ClockToken[] = []
  for (const match of plain.matchAll(/(오전|오후|낮|저녁|밤)?\s*(\d{1,2})\s*:\s*(\d{2})/g)) {
    tokens.push({ hour: Number(match[2]), minute: Number(match[3]), meridiem: meridiemOf(match[1]) })
  }
  for (const match of plain.matchAll(/(오전|오후|낮|저녁|밤)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/g)) {
    tokens.push({ hour: Number(match[2]), minute: match[4] ? 30 : Number(match[3] ?? 0), meridiem: meridiemOf(match[1]) })
  }
  return tokens
}

function meridiemOf(word: string | undefined): 'am' | 'pm' | null {
  if (!word) return null
  return word === '오전' ? 'am' : 'pm'
}

/** HH:MM이 인용의 시각 표기('10:00', '오후 2시', '2시 30분')와 맞는지 */
export function supportsTime(time: string, quote: string): boolean {
  const [hour, minute] = time.split(':').map(Number)
  return clockTokens(quote).some((token) => {
    if (token.minute !== minute) return false
    if (token.meridiem === 'pm') return hour === (token.hour < 12 ? token.hour + 12 : token.hour)
    if (token.meridiem === 'am') return token.hour === hour
    return token.hour === hour || (token.hour < 12 && token.hour + 12 === hour)
  })
}

export function supportsNumber(value: number, quote: string): boolean {
  return numbersIn(quote).includes(value)
}

const COST_WORDS = '참가비|참여비|참가료|비용|수강료|교육비|재료비|회비|이용료|체험비|입장료|수업료|등록비'
const FREE_COST = new RegExp(`(?:${COST_WORDS})\\s*[:|]?\\s*(?:은|는|이|가)?\\s*(?:전액|모두|전부)?\\s*(?:무료|(?<!\\d)0\\s*원|없음)`)
const FREE_PROGRAM = /(?:전액|모두|전\s*과정)\s*무료|무료\s*(?:로|으로)?\s*(?:참가|참여|운영|진행|교육|체험|수강|강좌|강의|프로그램|행사)/
/** 무료라고 해도 따로 내는 돈이 있다는 표현 */
const EXTRA_COST = /별도|자부담|실비|[1-9][\d,]*\s*원/

/** 무료(0)는 비용을 가리키는 말과 함께 '무료·0원·없음'이 있고 따로 내는 금액이 없을 때만 ('무료 주차'는 아님) */
export function supportsCost(krw: number, quote: string): boolean {
  const text = quote.normalize('NFKC')
  if (krw === 0) return (FREE_COST.test(text) || FREE_PROGRAM.test(text)) && !EXTRA_COST.test(text)
  return supportsNumber(krw, quote)
}

/** 학년 범위(1~6 초등, 7~9 중, 10~12 고)가 인용의 숫자·학교급 표기와 맞는지 */
export function supportsGradeRange([min, max]: [number, number], quote: string): boolean {
  const text = quote.normalize('NFKC')
  const candidates = new Set<number>()
  const middle = /중학|중등|중\s*\d/.test(text)
  const high = /고등|고교|고\s*\d/.test(text)
  const numbers = numbersIn(text).filter((value) => value <= 12)
  for (const value of numbers) {
    candidates.add(value)
    if (middle) candidates.add(value + 6)
    if (high) candidates.add(value + 9)
  }
  // 학교급의 처음·끝 학년은 숫자가 없을 때('초등학생')나 열린 범위('3학년 이상')에서만 쓴다
  const lower = !numbers.length || /이하|까지/.test(text)
  const upper = !numbers.length || /이상|부터/.test(text)
  const levels: [boolean, number, number][] = [[/초등|초\s*\d/.test(text), 1, 6], [middle, 7, 9], [high, 10, 12]]
  for (const [present, first, last] of levels) {
    if (present && lower) candidates.add(first)
    if (present && upper) candidates.add(last)
  }
  return candidates.has(min) && candidates.has(max)
}

/** 나이 범위. 열린 범위(0 또는 99)는 '이상·이하' 같은 표현이 있을 때만 */
export function supportsAgeRange([min, max]: [number, number], quote: string): boolean {
  const text = quote.normalize('NFKC')
  const numbers = numbersIn(text)
  const open = /이상|이하|부터|까지|미만|초과/.test(text)
  const has = (value: number) => numbers.includes(value)
    || (/미만/.test(text) && numbers.includes(value + 1))
    || (/초과/.test(text) && numbers.includes(value - 1))
  return (has(min) || (min === 0 && open)) && (has(max) || (max === 99 && open))
}

export function supportsPhone(phone: string, quote: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 7 && quote.normalize('NFKC').replace(/\D/g, '').includes(digits)
}

const WEEKDAY_CHARS: Record<string, Weekday> = { 월: 'mon', 화: 'tue', 수: 'wed', 목: 'thu', 금: 'fri', 토: 'sat', 일: 'sun' }

/** 인용에 적힌 요일 표기('(토)', '토요일')들 */
export function weekdaysIn(quote: string): Weekday[] {
  const text = quote.normalize('NFKC')
  const found: Weekday[] = []
  for (const match of text.matchAll(/\(\s*([월화수목금토일])\s*\)|([월화수목금토일])요일/g)) {
    found.push(WEEKDAY_CHARS[match[1] ?? match[2]])
  }
  return found
}

const TARGET_KEYWORDS = {
  multicultural_family: /다문화|결혼\s*이민|이주\s*배경|중도\s*입국|이주민|외국인\s*가정/,
  all: /누구나|제한\s*없|관계\s*없|전체|모든|시민/,
  parent_only: /부모|보호자|학부모|양육자|아버지|어머니|아빠|엄마/,
}

export function supportsTargetType(type: keyof typeof TARGET_KEYWORDS, quote: string): boolean {
  return TARGET_KEYWORDS[type].test(quote.normalize('NFKC'))
}

/** 언어 코드와 원문의 언어 이름 ('베트남어'처럼 언어를 가리키는 말. '베트남 쌀국수'의 나라 이름은 아님) */
export const LANGUAGE_NAMES: Record<string, RegExp> = {
  ko: /한국\s*어|한국\s*말|korean/i,
  en: /영어|english/i,
  vi: /베트남\s*어|베트남\s*말|tiếng\s*việt|vietnamese/i,
  zh: /중국\s*어|중국\s*말|중문|chinese|中文|汉语|漢語|普通话|华语/i,
  ja: /일본\s*어|일본\s*말|japanese|日本語|日语/i,
  th: /태국\s*어|타이\s*어|thai/i,
  tl: /필리핀\s*어|타갈로그|tagalog|filipino/i,
  ru: /러시아\s*어|russian/i,
  uz: /우즈베크\s*어|우즈벡\s*어|uzbek/i,
  mn: /몽골\s*어|mongolian/i,
  km: /캄보디아\s*어|크메르\s*어|khmer/i,
  ne: /네팔\s*어|nepali/i,
  id: /인도네시아\s*어|indonesian/i,
  my: /미얀마\s*어|버마\s*어|myanmar|burmese/i,
}

/** 그 언어로 통역·진행·안내한다는 말 */
const LANGUAGE_SUPPORT = /통역|번역|진행|상담|지원|안내|서비스|제공|가능|사용|신청서|양식|서식|페이지|어\s*로|말\s*로|interpret|translat|support|available|version/i

export function supportsLanguage(code: string, quote: string): boolean {
  const text = quote.normalize('NFKC')
  return (LANGUAGE_NAMES[code]?.test(text) ?? false) && LANGUAGE_SUPPORT.test(text)
}

// ---- 분류 값과 인용 대조 ----

const AUDIENCE_KEYWORDS: Record<Exclude<Audience, 'unknown'>, RegExp> = {
  child: /자녀|아동|어린이|아이|유아|학생|초등|중학|중등|고등|청소년|학년|\d+\s*세|키즈|꿈나무/,
  parent_child: /부모\s*[와과·,&-]?\s*(?:자녀|아이)|(?:자녀|아이)\s*(?:와|과)\s*(?:함께|부모|보호자)|(?:엄마|아빠|아버지|어머니|보호자|부모)\s*(?:와|과|랑)\s*(?:함께|아이|자녀)|온\s*가족|(?<!다문화\s*|1\s*인\s*|한\s*부모\s*)가족\s*(?:체험|행사|운동회|캠프|나들이|여행|축제|단위|참여|함께|모두|요리|놀이|친화)|\d+\s*가족|육아\s*나눔|동반/,
  parent_only: /부모|보호자|학부모|양육자|아버지|어머니|아빠|엄마/,
  adult: /성인|매니저|종사자|봉사자|활동가|결혼\s*이민|이민자|1\s*인\s*가구|부부|여성|남성|어르신|노인|직장인|구직|취업|강사|멘토|정착|임산부|예비\s*(?:부부|부모)/,
}

/** 실제 참여자 분류가 인용의 낱말과 맞는지 ('영양제 꿀팁'만으로 child가 되지 않게) */
export function supportsAudience(audience: Audience, quote: string): boolean {
  return audience !== 'unknown' && AUDIENCE_KEYWORDS[audience].test(quote.normalize('NFKC'))
}

/** 참여 자격 하나하나가 인용에 그대로 있는지. 자격 없음([])은 '누구나·제한 없음' 같은 말이 있을 때만 */
export function supportsEligibility(requirements: string[], quote: string): boolean {
  if (!requirements.length) return supportsTargetType('all', quote)
  const text = normalizeForMatch(quote)
  return requirements.every((item) => {
    const needle = normalizeForMatch(item)
    if (needle.length >= 2 && text.includes(needle)) return true
    // 다문화가족 대상은 '결혼이민자 가정'처럼 적혀도 같은 자격이다
    return /다문화/.test(item) && supportsTargetType('multicultural_family', quote)
  })
}

const COMPANION_CONTEXT = {
  guardian: /보호자|부모|학부모|양육자|엄마|아빠|가족|동반|함께|같이/,
  sibling: /형제|자매|동생|언니|오빠|누나|미취학|영유아|다자녀/,
}

const COMPANION_WORDS: Record<Exclude<CompanionRule, 'unknown'>, RegExp> = {
  required: /필수|반드시|꼭|함께\s*(?:참여|참석|해야|와야|오셔야|하는)|동반\s*(?:하여|해야|필요|참여|참석|요망)|(?:보호자|부모)\s*(?:와|과|도)?\s*(?:함께|같이)|부모\s*[와과]?\s*자녀|(?:자녀|아이|아동)\s*(?:와|과)\s*(?:보호자|부모)|(?:보호자|부모)\s*[와과]\s*(?:자녀|아이)[가이]?\s*함께|가족\s*단위/,
  allowed: /가능|허용|환영|(?:와도|오셔도|해도|하셔도)\s*(?:됩|돼|좋)|수\s*있(?:습|어|음|다)/,
  not_allowed: /불가|금지|불허|안\s*(?:됩|돼)|어렵|제한|수\s*없|(?:자녀|아동|학생|어린이)\s*만/,
}

/** 동반 규칙이 인용에 직접 적혀 있는지 (대상 문구만으로 '동반 불가'가 되지 않게) */
export function supportsCompanion(rule: CompanionRule, quote: string, who: keyof typeof COMPANION_CONTEXT): boolean {
  const text = quote.normalize('NFKC')
  return rule !== 'unknown' && COMPANION_CONTEXT[who].test(text) && COMPANION_WORDS[rule].test(text)
}

const ALL_SESSIONS_WORDS = /모두\s*(?:참여|참석|출석|이수)|(?:전|전체|모든)\s*회차|매\s*회|\d+\s*회기|과정|연속|중도\s*(?:참여|참가|합류)\s*(?:불가|안)|개근|수료|출석/
const CHOOSE_ONE_WORDS = /중\s*(?:하루|한\s*(?:날|번|회|회차)|1\s*(?:일|회|회차))|택\s*1|택일|선택|골라|원하는\s*(?:날|날짜|회차|시간)|회차별\s*(?:신청|모집|접수)|각\s*회차/
const BARE_COUNT = /총\s*\d+\s*회|\d+\s*회\s*(?:운영|진행|교육|수업)/
/** 여러 사업을 묶은 이름 ('…지원사업', '…프로그램'으로 끝나는 이름) */
const UMBRELLA_TITLE = /사업|지원|프로그램\s*$/

/**
 * 참석 방식이 인용에 적혀 있는지. '총 N회'만 있으면 한 과정의 이름일 때만 전 회차 참석으로 본다
 * ('1인가구 지원사업' 같은 묶음 사업은 회차를 골라 오는지 알 수 없다).
 */
export function supportsAttendance(rule: AttendanceRule, quote: string, title: string): boolean {
  const text = quote.normalize('NFKC')
  if (rule === 'choose_one') return CHOOSE_ONE_WORDS.test(text)
  if (rule !== 'all_sessions') return false
  return ALL_SESSIONS_WORDS.test(text) || (BARE_COUNT.test(text) && !UMBRELLA_TITLE.test(title.normalize('NFKC').trim()))
}

const APPLY_WORDS = /신청|접수|예약|등록/
const APPLY_REFUSED = /(?:신청|접수|예약|등록)\s*(?:은|는)?\s*(?:전화\s*(?:로|으로)?\s*)?(?:받지\s*않|불가|안\s*(?:됩|돼|받))/

/** 인용이 그 방법으로 신청할 수 있다고 하는지 ('문의 : 031-…', '신청은 전화로 받지 않습니다'는 아님) */
export function supportsApplication(quote: string): boolean {
  const text = quote.normalize('NFKC')
  return APPLY_WORDS.test(text) && !APPLY_REFUSED.test(text)
}
