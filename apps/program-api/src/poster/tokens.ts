// 포스터 글에서 '바뀌면 안 되는 값'(전화번호·시각·날짜·숫자·주소)을 언어별 표기 차이를 걷어내고 뽑는다.
// 번역표의 각 문구(원문 ↔ 번역)와, 생성된 포스터를 다시 읽은 글(번역표 ↔ 판독문)을 코드로 대조하는 데 쓴다.
// 날짜는 한국어·중국어의 '10/19'(월/일)와 베트남어의 '19/10'(일/월)을 같은 날로 본다.

export type PosterLanguage = 'vi' | 'zh'
export type TextLanguage = 'ko' | PosterLanguage

export interface LockedTokens {
  phones: string[]
  /** HH:MM */
  times: string[]
  /** M-D (연도는 numbers에 들어간다). 달·날이 범위를 벗어나면 'invalid:원문' */
  dates: string[]
  /** 나머지 정수 (연도, 인원, 나이, 학년, 층 등) */
  numbers: string[]
  urls: string[]
}

export type TokenKind = keyof LockedTokens

export const TOKEN_LABELS: Record<TokenKind, string> = {
  phones: '전화번호', times: '시각', dates: '날짜', numbers: '숫자', urls: '주소',
}

const pad = (value: string | number) => String(value).padStart(2, '0')
const unique = (values: string[]) => [...new Set(values)].sort()
const integer = (value: string) => String(Number(value))
/** 달·날이 범위를 벗어난 날짜 값의 머리 (뒤에 원문 표기) */
const INVALID = 'invalid:'

function monthDay(month: number, day: number, raw: string): string {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${month}-${day}` : `${INVALID}${raw.trim()}`
}

/** 정규식에 걸린 부분을 지우면서 값을 모은다. 지운 자리는 공백으로 둬 앞뒤 숫자가 붙지 않게 한다 */
function take(text: string, pattern: RegExp, read: (match: RegExpExecArray) => string | null, into: string[]): string {
  return text.replace(pattern, (...args) => {
    const match = args.slice(0, -2) as unknown as RegExpExecArray
    const value = read(match)
    if (value !== null) into.push(value)
    return ' '
  })
}

export function extractTokens(input: string, language: TextLanguage): LockedTokens {
  const phones: string[] = []
  const times: string[] = []
  const dates: string[] = []
  const numbers: string[] = []
  const urls: string[] = []
  let text = input.normalize('NFC')

  text = take(text, /\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+/gi, (m) => m[0].replace(/[.,]+$/, '').toLowerCase(), urls)
  // 지역번호·휴대전화 (031-376-3428, 010-1234-5678), 대표번호 (1577-1366)
  text = take(text, /(?<!\d)(0\d{1,2})\s*[-.)]\s*(\d{3,4})\s*[-.]\s*(\d{4})(?!\d)/g, (m) => `${m[1]}-${m[2]}-${m[3]}`, phones)
  text = take(text, /(?<![\d-])(1\d{3})-(\d{4})(?![\d-])/g, (m) => `${m[1]}-${m[2]}`, phones)

  // 연-월-일 (모든 언어: 2026. 9. 28. / 2026-10-31 / 2026年10月31日 / 2026년 10월 31일)
  text = take(text, /(?<!\d)(20\d{2})\s*(?:[.\-/年]|년)\s*(\d{1,2})\s*(?:[.\-/月]|월)\s*(\d{1,2})(?!\d)\s*[.日일号]?/g, (m) => {
    numbers.push(m[1])
    return monthDay(Number(m[2]), Number(m[3]), m[0])
  }, dates)

  if (language === 'vi') {
    // 일/월/연 (28/09/2026), '19 tháng 10'
    text = take(text, /(?<!\d)(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(20\d{2})(?!\d)/g, (m) => {
      numbers.push(m[3])
      return monthDay(Number(m[2]), Number(m[1]), m[0])
    }, dates)
    text = take(text, /(?:ngày\s*)?(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*(?:năm\s*)?(20\d{2}))?/gi, (m) => {
      if (m[3]) numbers.push(m[3])
      return monthDay(Number(m[2]), Number(m[1]), m[0])
    }, dates)
    // 요일 약어(T2~T7, CN, Thứ 2)는 숫자로 세지 않는다
    text = text.replace(/\b(?:Thứ\s*[2-7]|T[2-7]|CN)\b/gi, ' ')
  } else {
    // 월 일 (10월 19일, 10月19日)
    text = take(text, /(?<!\d)(\d{1,2})\s*(?:월|月)\s*(\d{1,2})\s*(?:일|日|号)?/g, (m) => monthDay(Number(m[1]), Number(m[2]), m[0]), dates)
  }

  // 시각 (15:30, 10시 30분, 10点30分, 10 giờ 30, 10h30)
  text = take(text, /(?<!\d)(\d{1,2})\s*:\s*(\d{2})(?!\d)/g, (m) => `${pad(m[1])}:${m[2]}`, times)
  if (language === 'ko') text = take(text, /(?<!\d)(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/g, (m) => `${pad(m[1])}:${pad(m[2] ?? 0)}`, times)
  if (language === 'zh') text = take(text, /(?<!\d)(\d{1,2})\s*[点點时時](?:\s*(\d{1,2})\s*分)?/g, (m) => `${pad(m[1])}:${pad(m[2] ?? 0)}`, times)
  if (language === 'vi') text = take(text, /(?<!\d)(\d{1,2})\s*(?:giờ|h)(?:\s*(\d{1,2})(?:\s*phút)?)?(?![a-zà-ỹ])/gi, (m) => `${pad(m[1])}:${pad(m[2] ?? 0)}`, times)

  // 월/일 짧은 표기 (한국어·중국어 10/19, 10. 14. / 베트남어 19/10)
  text = take(text, /(?<![\d.])(\d{1,2})\s*[./]\s*(\d{1,2})(?![\d:])\.?/g, (m) => {
    const [a, b] = [Number(m[1]), Number(m[2])]
    return language === 'vi' ? monthDay(b, a, m[0]) : monthDay(a, b, m[0])
  }, dates)

  for (const match of text.matchAll(/\d+/g)) numbers.push(integer(match[0]))

  return { phones: unique(phones), times: unique(times), dates: unique(dates), numbers: unique(numbers.map(integer)), urls: unique(urls) }
}

export interface TokenDiff {
  kind: TokenKind
  /** 기대한 쪽에는 있는데 실제 쪽에 없는 값 */
  missing: string[]
  /** 실제 쪽에만 있는 값 */
  extra: string[]
}

export function diffTokens(expected: LockedTokens, actual: LockedTokens): TokenDiff[] {
  const diffs: TokenDiff[] = []
  for (const kind of Object.keys(TOKEN_LABELS) as TokenKind[]) {
    const missing = expected[kind].filter((value) => !actual[kind].includes(value))
    const extra = actual[kind].filter((value) => !expected[kind].includes(value))
    if (missing.length || extra.length) diffs.push({ kind, missing, extra })
  }
  return diffs
}

export function mergeTokens(list: LockedTokens[]): LockedTokens {
  const merged: LockedTokens = { phones: [], times: [], dates: [], numbers: [], urls: [] }
  for (const tokens of list) for (const kind of Object.keys(merged) as TokenKind[]) merged[kind].push(...tokens[kind])
  for (const kind of Object.keys(merged) as TokenKind[]) merged[kind] = unique(merged[kind])
  return merged
}

/** 담당자가 읽을 날짜: 'M-D'는 'M월 D일'로 */
const dateLabel = (value: string) => value.replace(/^(\d{1,2})-(\d{1,2})$/, '$1월 $2일')

/**
 * 빠진 값·없던 값을 한 줄로 적는다. 담당자 화면과 모델에 그대로 가므로 날짜는 'M월 D일'로 쓰고,
 * 읽을 수 없는 날짜(invalid:원문)는 따로 '날짜를 읽지 못함 (원문)'으로 적는다
 */
function describeValues(kind: TokenKind, missing: string[], extra: string[]): string {
  const label = TOKEN_LABELS[kind]
  const readable = (values: string[]) => values.filter((value) => !value.startsWith(INVALID)).map((value) => (kind === 'dates' ? dateLabel(value) : value))
  const unreadable = [...missing, ...extra].filter((value) => value.startsWith(INVALID)).map((value) => value.slice(INVALID.length))
  const parts: string[] = []
  if (readable(missing).length) parts.push(`빠진 ${label} ${readable(missing).join(', ')}`)
  if (readable(extra).length) parts.push(`원래 없던 ${label} ${readable(extra).join(', ')}`)
  if (unreadable.length) parts.push(`날짜를 읽지 못함 (${unreadable.join(', ')})`)
  return parts.join(' · ')
}

export function describeDiff(diff: TokenDiff): string {
  return describeValues(diff.kind, diff.missing, diff.extra)
}

/**
 * 예전 검증 기록에 저장된 값 대조 문구('빠진 날짜 10-31 · 원래 없던 날짜 invalid:10/31/2026')를
 * 지금 describeDiff와 같은 말('빠진 날짜 10월 31일 · 날짜를 읽지 못함 (10/31/2026)')로 바꾼다. 날짜가 아닌 부분은 그대로 둔다
 */
export function readableTokenMessage(message: string): string {
  const parts = message.split(' · ')
  const dates = { missing: [] as string[], extra: [] as string[] }
  const others = parts.filter((part) => {
    const match = part.match(/^(빠진|원래 없던) 날짜 (.+)$/)
    if (!match) return true
    dates[match[1] === '빠진' ? 'missing' : 'extra'].push(...match[2].split(', '))
    return false
  })
  // 이미 사람이 읽는 말이면 그대로 둔다
  if (![...dates.missing, ...dates.extra].some((value) => value.startsWith(INVALID) || /^\d{1,2}-\d{1,2}$/.test(value))) return message
  return [...others, describeValues('dates', dates.missing, dates.extra)].filter(Boolean).join(' · ')
}

/** 한글 낱말(음절 2자 이상 또는 1자)을 모두 뽑는다 */
export function hangulWords(text: string): string[] {
  return [...text.normalize('NFC').matchAll(/[가-힣]+/g)].map((match) => match[0])
}
