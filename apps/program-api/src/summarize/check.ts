import type { DisplayLanguage, Weekday } from '../types'
import { generateJson } from '../llm/gemini'
import { gradeRangeLabel } from '../match/labels'
import { factDates, factPhones, factTimes } from './facts'
import type { DateFact, SummaryFacts } from './facts'
import { listedRemaining, schoolGrade } from './format'
import { buildVerifyPrompt, VERIFY_SCHEMA, VERIFY_SYSTEM_PROMPT } from './prompt'
import type { VerifyKind } from './prompt'

// 요약 3줄을 구조화된 사실과 대조한다. checkSummary는 네트워크 없이 결정적으로, verifyWithModel은 Gemini로.

interface LanguageRules {
  /** 한 줄 최대 글자 수 (1줄은 제목 길이만큼, 베트남어·중국어는 번역까지 두 배 더 허용) */
  maxLine: number
  /** 줄마다 있어야 하는 그 언어의 글자 */
  script: RegExp
  free: RegExp
  /** '확인 필요'에 해당하는 말 */
  unknown: RegExp
  /** 원문의 '추후 안내'를 옮긴 말 (대략의 일정이 있을 때만 확인 필요 대신 받는다) */
  later: RegExp
  multicultural: RegExp
  /** 초등·중학교·고등학교 (한국 학제) */
  schools: [RegExp, RegExp, RegExp]
  /** 현재 신청 상태·참여 가능 여부를 단정하는 말 */
  judgement: RegExp
  anyone: RegExp
  /** 통역·다국어 진행 */
  interpretation: RegExp
  /** 신청한다는 말과 문의한다는 말 (문의 전화를 신청 방법처럼 썼는지 볼 때) */
  apply: RegExp
  inquiry: RegExp
  /** 특정 언어 이름 (지원 언어 코드별) */
  languageNames: Record<string, RegExp>
  /** 숫자를 글자로 쓴 경우 (검사할 수 없어 막는다) */
  wordNumber: RegExp | null
  weekdays: { pattern: RegExp; read: (match: RegExpMatchArray) => Weekday | null }
  dates: (text: string) => DateMention[]
}

interface DateMention {
  month: number
  day: number
  year: number | null
  weekday: Weekday | null
}

const KO_WEEKDAYS: Record<string, Weekday> = { 월: 'mon', 화: 'tue', 수: 'wed', 목: 'thu', 금: 'fri', 토: 'sat', 일: 'sun' }
const ZH_WEEKDAYS: Record<string, Weekday> = { 一: 'mon', 二: 'tue', 三: 'wed', 四: 'thu', 五: 'fri', 六: 'sat', 日: 'sun', 天: 'sun' }
const VI_WEEKDAYS: Record<string, Weekday> = {
  hai: 'mon', ba: 'tue', tư: 'wed', năm: 'thu', sáu: 'fri', bảy: 'sat',
  2: 'mon', 3: 'tue', 4: 'wed', 5: 'thu', 6: 'fri', 7: 'sat',
}

/** 서수 앞말('lần thứ 3', 'buổi thứ hai') 뒤가 아니고 다른 글자에 붙어 있지 않을 때 */
const VI_NOT_ORDINAL = '(?<!\\p{L})(?<!(?:[Ll]ần|[Bb]uổi|[Kk]hóa|[Kk]hoá|[Ss]ố|[Pp]hần|[Đđ]ợt|[Kk]ỳ|[Kk]ì|[Tt]uần|[Hh]ạng|[Gg]iải)\\s+)'

function viWeekday(token: string): Weekday | null {
  const lower = token.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
  if (/^chủ nhật$/.test(lower)) return 'sun'
  const match = lower.match(/^thứ (\S+)$/)
  return match ? VI_WEEKDAYS[match[1]] ?? null : null
}

/** 한국어·중국어: '10월 24일, 31일'처럼 월이 생략된 날은 앞의 월을 쓴다 */
function sequentialDates(text: string, pattern: RegExp, weekdays: Record<string, Weekday>): DateMention[] {
  const mentions: DateMention[] = []
  let month: number | null = null
  for (const match of text.matchAll(pattern)) {
    const [, year, fullMonth, fullDay, fullWeekday, bareDay, bareWeekday] = match
    if (fullMonth) month = Number(fullMonth)
    if (month === null) continue
    const weekday = fullWeekday ?? bareWeekday
    mentions.push({
      month,
      day: Number(fullDay ?? bareDay),
      year: year ? Number(year) : null,
      weekday: weekday ? weekdays[weekday] ?? null : null,
    })
  }
  return mentions
}

const KO_DATE = /(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:\s*\(\s*([월화수목금토일])\s*\))?|(?<![\d월])(\d{1,2})\s*일(?:\s*\(\s*([월화수목금토일])\s*\))?/g
const ZH_DATE = /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号](?:\s*\(\s*(?:周|星期)([一二三四五六日天])\s*\))?|(?<![\d月])(\d{1,2})\s*[日号](?:\s*\(\s*(?:周|星期)([一二三四五六日天])\s*\))?/g
const VI_DATE = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?![\d/])(?:\s*\(\s*([Tt]hứ\s+[^\s)]+|[Cc]hủ\s+[Nn]hật)\s*\))?|ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/gi

function viDates(text: string): DateMention[] {
  return [...text.matchAll(VI_DATE)].map(([, day, month, year, weekday, wordDay, wordMonth, wordYear]) => ({
    month: Number(month ?? wordMonth),
    day: Number(day ?? wordDay),
    year: year || wordYear ? Number(year ?? wordYear) : null,
    weekday: weekday ? viWeekday(weekday) : null,
  }))
}

const RULES: Record<DisplayLanguage, LanguageRules> = {
  'ko-easy': {
    maxLine: 140,
    script: /\p{Script=Hangul}/u,
    free: /무료/,
    unknown: /확인|물어|문의|알 수 없|미정|정해지지|나와 있지 않|적혀 있지 않/,
    later: /나중에\s*(?:알려|안내)|추후|따로\s*(?:알려|안내)/,
    multicultural: /다문화|결혼\s*이민|이주\s*배경|중도\s*입국/,
    schools: [/초등/, /중학|중등/, /고등학|고교/],
    judgement: /신청\s*중|접수\s*중|모집\s*중|마감(?:됐|되었|했|이에요|입니다|돼)|참여할 수 있|참여 가능/,
    anyone: /누구나/,
    interpretation: /통역|번역|다국어|외국어|모국어|이중\s*언어/,
    apply: /신청|접수/,
    inquiry: /문의|물어|연락|궁금/,
    languageNames: { vi: /베트남어/, zh: /중국어/, en: /영어/ },
    wordNumber: /(?<!\p{Script=Hangul})(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s?(?:번|회|명|살|가족|시간)/u,
    weekdays: { pattern: /([월화수목금토일])요일|\(\s*([월화수목금토일])\s*\)/g, read: (match) => KO_WEEKDAYS[match[1] ?? match[2]] ?? null },
    dates: (text) => sequentialDates(text, KO_DATE, KO_WEEKDAYS),
  },
  vi: {
    maxLine: 300,
    script: /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i,
    free: /miễn phí/i,
    unknown: /chưa rõ|chưa có thông tin|không có thông tin|chưa xác định|không rõ|không ghi|chưa ghi|cần (?:hỏi|xác nhận|kiểm tra)|hãy hỏi|vui lòng hỏi/i,
    later: /(?:thông báo|báo) sau|sẽ (?:được )?thông báo/i,
    multicultural: /đa văn h(?:óa|oá)|kết hôn|nhập cư|di trú|di cư/i,
    schools: [/tiểu học|cấp 1/i, /trung học cơ sở|THCS|cấp 2/i, /trung học phổ thông|THPT|cấp 3/i],
    judgement: /đang (?:nhận|mở|tiếp nhận) đăng ký|đã (?:hết hạn|đóng|kết thúc)|có thể tham gia|được tham gia/i,
    anyone: /bất kỳ ai|bất cứ ai|mọi người đều|ai cũng/i,
    interpretation: /phiên dịch|thông dịch|biên dịch|đa ngôn ngữ|song ngữ/i,
    apply: /đăng ký/i,
    inquiry: /hỏi|liên hệ|tư vấn|thắc mắc/i,
    languageNames: { vi: /tiếng Việt/i, zh: /tiếng Trung|tiếng Hoa/i, en: /tiếng Anh/i },
    wordNumber: null,
    weekdays: {
      // 숫자 요일('Thứ 3')은 괄호 안이나 날짜 바로 옆에서만 요일로 읽는다. 'lần thứ 3'(제3회) 같은 서수는 요일이 아니다
      pattern: new RegExp([
        `${VI_NOT_ORDINAL}(?:[Tt]hứ\\s+(?:Hai|Ba|Tư|Năm|Sáu|Bảy)|Thứ\\s+(?:hai|ba|tư|năm|sáu|bảy)|[Cc]hủ\\s+[Nn]hật)(?!\\p{L})`,
        '\\(\\s*[Tt]hứ\\s+[2-7]\\s*\\)',
        `${VI_NOT_ORDINAL}[Tt]hứ\\s+[2-7](?=\\s*[,:]?\\s*(?:ngày\\s+)?\\d{1,2}\\/\\d{1,2})`,
        `(?<=\\d{1,2}\\/\\d{1,2}(?:\\/\\d{4})?\\s*,?\\s*)[Tt]hứ\\s+[2-7](?![\\d\\p{L}])`,
      ].join('|'), 'gu'),
      read: (match) => viWeekday(match[0]),
    },
    dates: viDates,
  },
  zh: {
    maxLine: 120,
    script: /\p{Script=Han}/u,
    free: /免费/,
    unknown: /待确认|需确认|需要确认|请向|请咨询|需咨询|未注明|未公布|不详|未确定|尚未|不明/,
    later: /另行通知|稍后通知|后续通知|另行告知/,
    multicultural: /多元文化|多文化|移民|中途入[国境]/,
    schools: [/小学/, /初中|初级中学/, /高中/],
    judgement: /正在报名|报名中|已截止|报名已结束|已结束报名|可以参加|可参加|能参加/,
    anyone: /任何人|所有人都|人人都/,
    interpretation: /翻译|口译|多语|双语/,
    apply: /报名|申请/,
    inquiry: /咨询|询问|联系|问询/,
    languageNames: { vi: /越南语|越南文/, zh: /中文|汉语|普通话|华语/, en: /英语/ },
    wordNumber: /(?<![星期周礼拜同统唯第每])[一二三四五六七八九十两]+(?=次|个|名|人|岁|年级|韩元|元|月|日|号|点|节|期|天|小时|分钟|层|楼|周)/u,
    weekdays: { pattern: /(?:星期|礼拜|周)([一二三四五六日天])(?!次)/g, read: (match) => ZH_WEEKDAYS[match[1]] ?? null },
    dates: (text) => sequentialDates(text, ZH_DATE, ZH_WEEKDAYS),
  },
}

const TRADITIONAL = /[費時間學報電話請確認對參與動體驗課號週場機構線網給會為這個們來點歲級開設區樓層館辦關於選擇]/gu
/** 동 이름을 한자로 옮긴 말 ('大院洞'). 동 이름은 한자 표기가 여러 가지라 한국어 그대로 둔다 */
const HAN_DONG = /\p{Script=Han}{1,3}洞/gu

/** 머리글(제목·기관·대상 번역) 검사가 같이 쓰는 그 언어의 규칙 */
export function languageRules(language: DisplayLanguage): Pick<LanguageRules, 'script' | 'multicultural' | 'schools' | 'anyone' | 'judgement' | 'wordNumber'> {
  return RULES[language]
}

/** 중국어 글의 번체자와 한자로 옮긴 동 이름 */
export function chineseScriptIssues(text: string): string[] {
  const issues: string[] = []
  const traditional = [...new Set(text.match(TRADITIONAL) ?? [])]
  if (traditional.length) issues.push(`번체자를 씀: ${traditional.join('')}`)
  const hanDong = [...new Set(text.match(HAN_DONG) ?? [])]
  if (hanDong.length) issues.push(`동 이름을 한자로 옮김: ${hanDong.join(', ')}`)
  return issues
}
const QUOTED = /'[^'\n]*'|"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|『[^』\n]*』/g
const QUOTE_OPENERS = new Set(['\'', '"', '“', '‘', '「', '『'])
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/gi
const PHONE_PATTERN = /(?<!\d)(?:0\d{1,2}[-.)\s]\s*\d{3,4}[-.\s]\d{4}|1\d{3}-\d{4})(?!\d)/g
const TIME_PATTERN = /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g
const MIN_LINE = 8
/** 끝났다는 말 (끝난 프로그램에는 써도 된다) */
const ENDED_WORDS = /마감|hết hạn|đóng|kết thúc|截止|结束/
/** 온라인 신청 이름 중 어디서 신청하는지 가리키지 않는 말 */
const GENERIC_LABEL_WORD = /^(?:온라인|인터넷|홈페이지|프로그램|신청|접수|예약|등록|방법)$/

const compact = (text: string) => text.normalize('NFKC').replace(/\s+/g, '')
const withoutQuoted = (text: string) => text.replace(QUOTED, ' ')
const md = (fact: { month: number; day: number }) => `${fact.month}월 ${fact.day}일`
const monthDay = (fact: DateFact) => {
  const [, month, day] = fact.date.split('-').map(Number)
  return { month, day }
}
const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** 글 속 정수. '3만'·'1万'·'30,000'·'30.000'은 한 수로 읽는다 */
export function numberTokens(text: string): number[] {
  const values: number[] = []
  const rest = text.normalize('NFKC')
    .replace(/(\d+)\s*[만万](?:\s*(\d+)\s*[천千])?/g, (_, man: string, thousand?: string) => {
      values.push(Number(man) * 10000 + Number(thousand ?? 0) * 1000)
      return ' '
    })
    .replace(/(\d+)\s*[천千]/g, (_, thousand: string) => {
      values.push(Number(thousand) * 1000)
      return ' '
    })
    .replace(/(?<![\d.,])\d{1,3}(?:[.,]\d{3})+(?![\d])/g, (match) => {
      values.push(Number(match.replace(/[.,]/g, '')))
      return ' '
    })
  for (const match of rest.matchAll(/\d+/g)) values.push(Number(match[0]))
  return values
}

interface LineScan {
  phones: string[]
  times: string[]
  dates: DateMention[]
  weekdays: Weekday[]
  numbers: number[]
}

function scanLine(line: string, rules: LanguageRules): LineScan {
  const phones: string[] = []
  const times: string[] = []
  const stripped = line.normalize('NFKC')
    .replace(URL_PATTERN, ' ')
    .replace(PHONE_PATTERN, (match) => {
      phones.push(match.replace(/\D/g, ''))
      return ' '
    })
    .replace(TIME_PATTERN, (_, hours: string, minutes: string) => {
      times.push(`${hours.padStart(2, '0')}:${minutes}`)
      return ' '
    })
  const weekdays = [...stripped.matchAll(rules.weekdays.pattern)]
    .map((match) => rules.weekdays.read(match))
    .filter((weekday): weekday is Weekday => weekday !== null)
  const dates = rules.dates(stripped)
  const numbers = numberTokens(stripped.replace(rules.weekdays.pattern, ' '))
  return { phones, times, dates, weekdays, numbers }
}

/** 사실에서 끌어낼 수 있는 수: 날짜·시각 부분, 학년·나이, 횟수, 정원, 비용, 사실 문자열 속 숫자 */
function allowedNumbers(facts: SummaryFacts): Set<number> {
  const allowed = new Set<number>()
  const add = (...values: (number | null)[]) => {
    for (const value of values) if (value !== null && Number.isFinite(value)) allowed.add(value)
  }
  for (const fact of factDates(facts)) add(...fact.date.split('-').map(Number))
  for (const time of factTimes(facts)) {
    const [hours, minutes] = time.split(':').map(Number)
    add(hours, minutes, hours > 12 ? hours - 12 : null)
  }
  for (const grade of facts.grade_range ?? []) add(grade, schoolGrade(grade).grade)
  if (facts.age_range) add(facts.age_range[0] > 0 ? facts.age_range[0] : null, facts.age_range[1] < 99 ? facts.age_range[1] : null)
  add(facts.session_count, facts.sessions.length, facts.sessions.length + facts.undated_sessions, facts.capacity)
  if (facts.cost_krw) add(facts.cost_krw)
  const texts = [
    facts.title, facts.institution, facts.target_raw, facts.cost_raw, facts.korean_level_required, facts.venue,
    ...(facts.eligibility_requirements ?? []), ...facts.check_items,
    ...facts.sessions.flatMap((session) => [session.place, session.address]),
    ...facts.application_methods.flatMap((method) => [method.address, method.label]),
    facts.outside_osan, facts.schedule_note, facts.application_note, ...facts.notices,
  ]
  for (const text of texts) if (text) numberTokens(text).forEach((value) => allowed.add(value))
  return allowed
}

/** 요약에 원문 그대로 둘 수 있는 한국어 (제목·기관·장소·주소) */
function allowedKorean(facts: SummaryFacts): string {
  return compact([
    facts.title, facts.institution, facts.venue,
    ...facts.sessions.flatMap((session) => [session.place, session.address]),
    ...facts.application_methods.flatMap((method) => [method.address, method.label]),
    facts.outside_osan, facts.schedule_note, facts.application_note, ...facts.notices,
  ].filter(Boolean).join('\n'))
}

function hasDate(scans: LineScan[], fact: DateFact): boolean {
  const { month, day } = monthDay(fact)
  return scans.some((scan) => scan.dates.some((date) => date.month === month && date.day === day))
}

function lineIssues(line: string, index: number, facts: SummaryFacts, language: DisplayLanguage): string[] {
  const rules = RULES[language]
  const label = `${index + 1}줄`
  if (!line.trim()) return [`${label}이 비어 있음`]
  const issues: string[] = []
  const length = [...line].length
  // 1줄은 제목이 들어가므로 그만큼 더 허용한다 (베트남어·중국어는 제목 원문과 번역이 함께 들어간다)
  const max = rules.maxLine + (index === 0 ? facts.title.length * (language === 'ko-easy' ? 1 : 2) : 0)
  if (length > max) issues.push(`${label}이 너무 김 (${length}자, 최대 ${max}자)`)
  if (length < MIN_LINE) issues.push(`${label}이 너무 짧음 (${length}자)`)
  if (/\n/.test(line)) issues.push(`${label} 안에 줄바꿈이 있음`)
  if (!rules.script.test(withoutQuoted(line))) issues.push(`${label}이 ${language} 문장이 아님`)
  return issues
}

/** 각 줄의 숫자·날짜·요일·시각·전화번호가 사실에서 나왔는지 */
function valueIssues(scans: LineScan[], facts: SummaryFacts): string[] {
  const issues: string[] = []
  const allowed = allowedNumbers(facts)
  const dates = factDates(facts)
  const weekdays = new Set(dates.map((fact) => fact.weekday))
  const times = new Set(factTimes(facts).map(toMinutes))
  const phones = new Set(factPhones(facts).map((phone) => phone.replace(/\D/g, '')))

  scans.forEach((scan, index) => {
    const label = `${index + 1}줄`
    for (const phone of scan.phones) if (!phones.has(phone)) issues.push(`${label}: 사실에 없는 전화번호 ${phone}`)
    for (const time of scan.times) if (!times.has(toMinutes(time))) issues.push(`${label}: 사실에 없는 시각 ${time}`)
    for (const mention of scan.dates) {
      const matches = dates.filter((fact) => {
        const { month, day } = monthDay(fact)
        return month === mention.month && day === mention.day && (mention.year === null || fact.date.startsWith(`${mention.year}-`))
      })
      if (!matches.length) issues.push(`${label}: 사실에 없는 날짜 ${mention.year ? `${mention.year}년 ` : ''}${md(mention)}`)
      else if (mention.weekday && !matches.some((fact) => fact.weekday === mention.weekday)) {
        issues.push(`${label}: ${md(mention)}의 요일이 틀림 (${mention.weekday}, 실제 ${matches[0].weekday})`)
      }
    }
    for (const weekday of scan.weekdays) if (!weekdays.has(weekday)) issues.push(`${label}: 사실에 없는 요일 ${weekday}`)
    for (const value of scan.numbers) if (!allowed.has(value)) issues.push(`${label}: 사실에 없는 숫자 ${value}`)
  })
  return issues
}

/** 알려진 핵심 사실이 들어 있는지, 미상은 미상이라고 했는지 */
function requiredIssues(lines: string[], scans: LineScan[], facts: SummaryFacts, language: DisplayLanguage): string[] {
  const issues: string[] = []
  const rules = RULES[language]
  const [first = '', second = '', third = ''] = lines
  const all = lines.join('\n')
  const numbers = (index: number) => new Set(scans[index]?.numbers ?? [])
  const allNumbers = new Set(scans.flatMap((scan) => scan.numbers))
  const allTimes = new Set(scans.flatMap((scan) => scan.times.map(toMinutes)))

  // 1줄: 제목 원문(따옴표 안), 대상
  const title = compact(facts.title)
  const at = compact(first).indexOf(title)
  if (!title || at < 0) issues.push('1줄에 제목 원문이 없음')
  else if (!QUOTE_OPENERS.has(compact(first)[at - 1])) issues.push('제목 원문을 따옴표로 감싸지 않음')
  if (facts.grade_range) {
    const [from, to] = facts.grade_range.map(schoolGrade)
    const label = gradeRangeLabel(facts.grade_range)
    if (!numbers(0).has(from.grade) || !numbers(0).has(to.grade)) issues.push(`1줄에 대상 학년이 없음 (${label})`)
    rules.schools.forEach((pattern, school) => {
      const inRange = school >= from.school && school <= to.school
      // '고등학교 진학설명회'처럼 제목이 다른 학교급을 다루면 제목 번역에 그 학교급이 나올 수 있다
      const inTitle = RULES['ko-easy'].schools[school].test(facts.title)
      if (inRange && !pattern.test(withoutQuoted(first))) issues.push(`1줄에 대상 학교급이 없음 (${label})`)
      if (!inRange && !inTitle && pattern.test(withoutQuoted(all))) issues.push(`대상(${label})에 없는 학교급을 씀`)
    })
  }
  if (facts.age_range) {
    const [min, max] = facts.age_range
    if ((min > 0 && !numbers(0).has(min)) || (max < 99 && !numbers(0).has(max))) issues.push('1줄에 대상 나이가 없음')
  }
  if (facts.target_type === 'multicultural_family' && !rules.multicultural.test(withoutQuoted(first))) {
    issues.push('1줄에 다문화가족 대상이라는 말이 없음')
  }

  // 2줄: 다음 회차(또는 기간), 시각, 미상
  if (facts.sessions.length) {
    const next = facts.next_session
    if (next && !hasDate(scans, next)) issues.push(`다음 회차 날짜(${md(monthDay(next))})가 없음`)
    if (next?.start_time && !allTimes.has(toMinutes(next.start_time))) issues.push(`다음 회차 시작 시각(${next.start_time})이 없음`)
    if (next && !next.start_time && !rules.unknown.test(second)) issues.push('2줄에 시간 확인 필요라는 말이 없음')
    for (const session of listedRemaining(facts) ?? []) {
      if (!hasDate(scans, session)) issues.push(`남은 회차 날짜(${md(monthDay(session))})가 없음`)
    }
    for (const fact of facts.skipped_dates) if (!hasDate(scans, fact)) issues.push(`쉬는 날(${md(monthDay(fact))})이 없음`)
  } else if (facts.period_start || facts.period_end) {
    for (const fact of [facts.period_start, facts.period_end]) {
      if (fact && !hasDate(scans, fact)) issues.push(`운영 기간 날짜(${md(monthDay(fact))})가 없음`)
    }
    // 끝난 프로그램은 요일·시간을 물을 필요가 없다
    if (!facts.operation_ended && !rules.unknown.test(second)) issues.push('2줄에 회차 요일·시간 확인 필요라는 말이 없음')
  } else {
    if (!rules.unknown.test(second) && !(facts.schedule_note && rules.later.test(second))) issues.push('2줄에 일정 확인 필요라는 말이 없음')
    const noteNumbers = facts.schedule_note ? numberTokens(facts.schedule_note) : []
    if (noteNumbers.some((value) => !numbers(1).has(value))) issues.push(`2줄에 대략의 일정(${facts.schedule_note})이 없음`)
  }

  // 3줄: 비용, 신청 기간, 전화번호
  const freeClaim = rules.free.test(all) && !facts.cost_raw?.includes('무료')
  if (facts.cost_krw === 0 && !rules.free.test(all)) issues.push(`무료라는 말(${rules.free.source})이 없음`)
  if (facts.cost_krw !== null && facts.cost_krw > 0) {
    if (!allNumbers.has(facts.cost_krw)) issues.push(`비용 ${facts.cost_krw}원이 없음`)
    if (freeClaim) issues.push('비용이 있는데 무료라고 씀')
  }
  if (facts.cost_krw === null) {
    if (freeClaim) issues.push('비용이 확인되지 않았는데 무료라고 씀')
    if (!rules.unknown.test(third)) issues.push('3줄에 비용 확인 필요라는 말이 없음')
  }
  const { application_start: start, application_end: end } = facts
  if (end && !hasDate(scans, end)) issues.push(`신청 마감 날짜(${md(monthDay(end))})가 없음`)
  if (start && start.date > facts.today && !hasDate(scans, start)) issues.push(`신청 시작 날짜(${md(monthDay(start))})가 없음`)
  if (!start && !end && !facts.application_note && !rules.unknown.test(third)) issues.push('3줄에 신청 기간 확인 필요라는 말이 없음')
  // 온라인 신청은 어디서 신청하는지('오산시가족센터 홈페이지')가 빠지면 '온라인으로 신청'만 남는다
  for (const method of facts.application_methods) {
    if (method.purpose !== 'apply' || method.type !== 'online' || !method.label) continue
    const words = (method.label.match(/\p{Script=Hangul}{3,}/gu) ?? []).filter((word) => !GENERIC_LABEL_WORD.test(word))
    if (words.length && !words.some((word) => compact(third).includes(word))) issues.push(`3줄에 온라인 신청 이름(${method.label})이 없음`)
  }
  const unnamed = (facts.support_languages ?? []).filter((code) => rules.languageNames[code] && !rules.languageNames[code].test(withoutQuoted(all)))
  if (unnamed.length) issues.push(`기관 지원 언어(${unnamed.join(', ')})를 쓰지 않음`)
  const phones = factPhones(facts).map((phone) => phone.replace(/\D/g, ''))
  if (phones.length && !scans.some((scan) => scan.phones.some((phone) => phones.includes(phone)))) {
    issues.push(`전화번호(${factPhones(facts).join(', ')})가 없음`)
  }
  return issues
}

/** 문장 나누기. 영문 문장부호는 뒤에 빈칸이 있을 때만 (전화번호·금액의 '.'은 나누지 않는다) */
const SENTENCE = /(?<=[.!?;])\s+|(?<=[。！？；])\s*/

/** 문의만 받는 전화번호를 신청 방법처럼 쓴 문장 ('전화 031-…로 신청해요'). 같은 문장에 문의라는 말이 있으면 괜찮다 */
function inquiryIssues(lines: string[], facts: SummaryFacts, language: DisplayLanguage): string[] {
  const rules = RULES[language]
  const digits = (phone: string | null) => phone?.replace(/\D/g, '') ?? ''
  const applyPhones = new Set(facts.application_methods.filter((method) => method.purpose === 'apply').map((method) => digits(method.phone)))
  const inquiryPhones = new Set(facts.application_methods
    .filter((method) => method.purpose === 'inquiry' && method.phone && !applyPhones.has(digits(method.phone)))
    .map((method) => digits(method.phone)))
  if (!inquiryPhones.size) return []
  const issues: string[] = []
  lines.forEach((line, index) => {
    for (const clause of line.normalize('NFKC').split(SENTENCE)) {
      const phones = [...clause.matchAll(PHONE_PATTERN)].map((match) => match[0].replace(/\D/g, '')).filter((phone) => inquiryPhones.has(phone))
      if (phones.length && rules.apply.test(clause) && !rules.inquiry.test(clause)) {
        issues.push(`${index + 1}줄: 문의 전화(${phones.join(', ')})를 신청 방법처럼 씀`)
      }
    }
  })
  return issues
}

/** 원문에 없는 주장: 언어 지원, 신청 상태·참여 가능 단정, 누구나, 사실 밖 한국어, 번체자, 글자로 쓴 숫자 */
function claimIssues(lines: string[], facts: SummaryFacts, language: DisplayLanguage): string[] {
  const issues: string[] = []
  const rules = RULES[language]
  const all = lines.join('\n').normalize('NFKC')
  const outside = withoutQuoted(all)
  const support = facts.support_languages ?? []

  if (!support.length && rules.interpretation.test(outside)) issues.push('기관의 언어 지원이 확인되지 않았는데 통역·언어 지원을 언급함')
  for (const [code, pattern] of Object.entries(rules.languageNames)) {
    if (pattern.test(outside) && !support.includes(code)) issues.push(`확인되지 않은 언어 지원(${code})을 언급함`)
  }
  const judgement = outside.match(rules.judgement)
  // 이미 끝난 프로그램이 끝났다는 말은 시간이 지나도 틀리지 않는다
  if (judgement && !((facts.operation_ended || facts.application_closed) && ENDED_WORDS.test(judgement[0]))) issues.push(`신청 상태나 참여 가능 여부를 단정함: "${judgement[0]}"`)
  if (facts.target_type !== 'all' && rules.anyone.test(outside)) issues.push('대상 제한이 없다고 확인되지 않았는데 누구나라고 씀')
  const wordNumber = rules.wordNumber ? outside.match(rules.wordNumber) : null
  if (wordNumber) issues.push(`숫자를 글자로 씀: "${wordNumber[0]}"`)

  if (language !== 'ko-easy') {
    const korean = allowedKorean(facts)
    const unknownKorean = [...new Set(all.match(/\p{Script=Hangul}+/gu) ?? [])].filter((word) => !korean.includes(word))
    if (unknownKorean.length) issues.push(`사실에 없는 한국어 문구: ${unknownKorean.slice(0, 5).join(', ')}`)
  }
  // 동 이름은 한국어 그대로 둔다 (제목 번역 괄호 안도 마찬가지)
  if (language === 'zh') issues.push(...chineseScriptIssues(outside))
  return issues
}

/**
 * 결정적 검사. 빈 배열이면 통과.
 * 줄 수·길이·언어, 사실 밖의 숫자·날짜·요일·시각·전화번호, 핵심 사실 누락, 미상을 확정한 표현, 언어 지원 단정,
 * 문의 전화를 신청 방법처럼 쓴 것을 본다.
 */
export function checkSummary(lines: string[], facts: SummaryFacts, language: DisplayLanguage): string[] {
  const texts = lines.map((line) => String(line ?? '').normalize('NFKC').trim())
  const issues: string[] = []
  if (texts.length !== 3) issues.push(`줄 수가 3이 아님 (${texts.length}줄)`)
  texts.forEach((line, index) => issues.push(...lineIssues(line, index, facts, language)))
  const scans = texts.map((line) => scanLine(line, RULES[language]))
  issues.push(
    ...valueIssues(scans, facts), ...requiredIssues(texts, scans, facts, language), ...claimIssues(texts, facts, language),
    ...inquiryIssues(texts, facts, language),
  )
  return [...new Set(issues)]
}

// ---- 모델 대조 ----

interface ModelIssue {
  line: number
  kind: VerifyKind
  quote: string
  detail: string
}

const KIND_LABELS: Record<VerifyKind, string> = {
  contradiction: '사실과 다름',
  addition: '사실에 없는 내용',
  unknown_as_known: '미상을 확정함',
  omission: '핵심 사실 빠짐',
  language_support: '언어 지원 단정',
}

function formatModelIssue(issue: ModelIssue): string {
  const quote = issue.quote?.trim() ? ` "${issue.quote.trim()}"` : ''
  return `모델 대조 ${issue.line}줄 ${KIND_LABELS[issue.kind] ?? issue.kind}:${quote} ${issue.detail?.trim() ?? ''}`.trim()
}

/** Gemini가 요약을 사실과 대조해 모순·추가·누락을 찾는다. 빈 배열이면 문제 없음 */
export async function verifyWithModel(lines: string[], facts: SummaryFacts, language: DisplayLanguage): Promise<string[]> {
  const response = await generateJson<{ issues?: ModelIssue[] }>({
    system: VERIFY_SYSTEM_PROMPT,
    parts: [{ text: buildVerifyPrompt(lines, facts, language) }],
    schema: VERIFY_SCHEMA,
  })
  return (response.issues ?? []).map(formatModelIssue)
}
