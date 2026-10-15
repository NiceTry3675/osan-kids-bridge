import type { DisplayLanguage, Weekday } from '../types'
import { gradeRangeLabel } from '../match/labels'
import type { DateFact, DateTimeFact, MethodFact, SessionFact, SummaryFacts } from './facts'

// 언어별 표기. 날짜·요일·시각·비용·학년은 코드가 만들고 모델은 그대로 옮긴다.

export const LANGUAGE_LABELS: Record<DisplayLanguage, string> = {
  'ko-easy': '쉬운 한국어',
  vi: '베트남어',
  zh: '중국어(간체)',
}

export const WEEKDAY_NAMES: Record<DisplayLanguage, Record<Weekday, string>> = {
  'ko-easy': { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' },
  vi: { mon: 'Thứ Hai', tue: 'Thứ Ba', wed: 'Thứ Tư', thu: 'Thứ Năm', fri: 'Thứ Sáu', sat: 'Thứ Bảy', sun: 'Chủ Nhật' },
  zh: { mon: '周一', tue: '周二', wed: '周三', thu: '周四', fri: '周五', sat: '周六', sun: '周日' },
}

interface Words {
  free: string
  online: string
  phone: string
  onlineApply: string
  visitApply: string
  /** 문의만 받는 연락처 */
  inquiryPhone: string
  inquiry: string
}

export const WORDS: Record<DisplayLanguage, Words> = {
  'ko-easy': { free: '무료', online: '온라인', phone: '전화', onlineApply: '온라인 신청', visitApply: '방문 신청', inquiryPhone: '문의 전화', inquiry: '문의' },
  vi: {
    free: 'miễn phí', online: 'trực tuyến', phone: 'điện thoại', onlineApply: 'đăng ký trực tuyến', visitApply: 'đăng ký trực tiếp',
    inquiryPhone: 'điện thoại hỏi thông tin', inquiry: 'hỏi thông tin',
  },
  zh: { free: '免费', online: '线上', phone: '电话', onlineApply: '网上报名', visitApply: '现场报名', inquiryPhone: '咨询电话', inquiry: '咨询' },
}

/** 기관 지원 언어 코드의 언어별 이름 */
const LANGUAGE_CODE_NAMES: Record<DisplayLanguage, Record<string, string>> = {
  'ko-easy': { ko: '한국어', en: '영어', vi: '베트남어', zh: '중국어', ja: '일본어', th: '태국어', tl: '필리핀어', ru: '러시아어', uz: '우즈베크어', mn: '몽골어', km: '크메르어', ne: '네팔어', id: '인도네시아어', my: '미얀마어' },
  vi: { ko: 'tiếng Hàn', en: 'tiếng Anh', vi: 'tiếng Việt', zh: 'tiếng Trung', ja: 'tiếng Nhật', th: 'tiếng Thái', tl: 'tiếng Philippines', ru: 'tiếng Nga', uz: 'tiếng Uzbek', mn: 'tiếng Mông Cổ', km: 'tiếng Khmer', ne: 'tiếng Nepal', id: 'tiếng Indonesia', my: 'tiếng Myanmar' },
  zh: { ko: '韩语', en: '英语', vi: '越南语', zh: '中文', ja: '日语', th: '泰语', tl: '菲律宾语', ru: '俄语', uz: '乌兹别克语', mn: '蒙古语', km: '高棉语', ne: '尼泊尔语', id: '印尼语', my: '缅甸语' },
}

function grouped(value: number, separator: string): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, separator)
}

/** 'ko-easy' 10월 24일(토) · vi 24/10 (Thứ Bảy) · zh 10月24日（周六）. 올해가 아니면 연도를 붙인다 */
export function dateLabel(fact: DateFact, language: DisplayLanguage, today: string): string {
  const [year, month, day] = fact.date.split('-').map(Number)
  const showYear = fact.date.slice(0, 4) !== today.slice(0, 4)
  const weekday = WEEKDAY_NAMES[language][fact.weekday]
  if (language === 'vi') return `${day}/${month}${showYear ? `/${year}` : ''} (${weekday})`
  if (language === 'zh') return `${showYear ? `${year}年` : ''}${month}月${day}日（${weekday}）`
  return `${showYear ? `${year}년 ` : ''}${month}월 ${day}일(${weekday})`
}

export function dateTimeLabel(fact: DateTimeFact, language: DisplayLanguage, today: string): string {
  return fact.time ? `${dateLabel(fact, language, today)} ${fact.time}` : dateLabel(fact, language, today)
}

export function timeRangeLabel(start: string | null, end: string | null, language: DisplayLanguage): string | null {
  if (!start) return null
  if (end) return `${start}${language === 'ko-easy' ? '~' : '–'}${end}`
  return language === 'vi' ? `từ ${start}` : language === 'zh' ? `${start}开始` : `${start}부터`
}

/** 원문 비용 표현의 기준 ('가족당 재료비 8,000원' → 가족당·재료비). 금액만 옮기면 1인당으로 읽힐 수 있다 */
const COST_BASES: { pattern: RegExp; label: Record<DisplayLanguage, string> }[] = [
  { pattern: /가족\s*당|가정\s*당|가구\s*당/, label: { 'ko-easy': '가족당', vi: 'mỗi gia đình', zh: '每个家庭' } },
  { pattern: /(?:1\s*)?인\s*당|1\s*명\s*당/, label: { 'ko-easy': '한 사람당', vi: 'mỗi người', zh: '每人' } },
  { pattern: /(?:1\s*)?회\s*당|매\s*회/, label: { 'ko-easy': '한 번에', vi: 'mỗi buổi', zh: '每次' } },
]
const MATERIAL_FEE: Record<DisplayLanguage, string> = { 'ko-easy': '재료비', vi: 'tiền nguyên liệu', zh: '材料费' }

/** 무료·금액 표기. 원문 표현(raw)에 가족당·재료비 같은 기준이 있으면 붙인다. 미상은 null (모델이 언어별 '확인 필요' 문장으로 쓴다) */
export function costLabel(krw: number | null, language: DisplayLanguage, raw: string | null = null): string | null {
  if (krw === null) return null
  if (krw === 0) return WORDS[language].free
  const text = raw?.normalize('NFKC') ?? ''
  const basis = COST_BASES.find((item) => item.pattern.test(text))?.label[language] ?? null
  const material = /재료비/.test(text) ? MATERIAL_FEE[language] : null
  if (language === 'vi') return [`${grouped(krw, '.')} won`, basis, material && `(${material})`].filter(Boolean).join(' ')
  if (language === 'zh') return `${basis ?? ''}${material ?? ''}${grouped(krw, ',')}韩元`
  return [basis, material, `${grouped(krw, ',')}원`].filter(Boolean).join(' ')
}

// 학년 규칙: 초등 1~6, 중학교 7~9, 고등학교 10~12 (한국 학제 그대로 쓴다)
export function schoolGrade(grade: number): { school: 0 | 1 | 2; grade: number } {
  if (grade <= 6) return { school: 0, grade }
  if (grade <= 9) return { school: 1, grade: grade - 6 }
  return { school: 2, grade: grade - 9 }
}

const VI_SCHOOLS = ['tiểu học lớp', 'trung học cơ sở năm', 'trung học phổ thông năm']
const ZH_SCHOOLS = ['小学', '初中', '高中']

export function gradeLabel(range: [number, number], language: DisplayLanguage): string {
  if (language === 'ko-easy') return gradeRangeLabel(range)
  const valid = range.every((grade) => Number.isInteger(grade) && grade >= 1 && grade <= 12)
  if (!valid) return language === 'vi' ? `lớp ${range[0]}–${range[1]}` : `${range[0]}至${range[1]}年级`
  const [from, to] = range.map(schoolGrade)
  if (language === 'vi') {
    if (range[0] === range[1]) return `học sinh ${VI_SCHOOLS[from.school]} ${from.grade}`
    if (from.school === to.school) return `học sinh ${VI_SCHOOLS[from.school]} ${from.grade}–${to.grade}`
    return `học sinh từ ${VI_SCHOOLS[from.school]} ${from.grade} đến ${VI_SCHOOLS[to.school]} ${to.grade}`
  }
  if (range[0] === range[1]) return `${ZH_SCHOOLS[from.school]}${from.grade}年级`
  if (from.school === to.school) return `${ZH_SCHOOLS[from.school]}${from.grade}至${to.grade}年级`
  return `${ZH_SCHOOLS[from.school]}${from.grade}年级至${ZH_SCHOOLS[to.school]}${to.grade}年级`
}

/** 상한 99·하한 0은 열린 범위 ('8세 이상'). completed면 원문의 '만 N세'를 살린다 (만 나이·세는 나이를 헷갈리지 않게) */
export function ageLabel([min, max]: [number, number], language: DisplayLanguage, completed = false): string {
  const openMax = max >= 99
  const openMin = min <= 0
  if (language === 'vi') {
    const note = completed ? ' (tuổi tròn)' : ''
    if (openMax) return `từ ${min} tuổi trở lên${note}`
    if (openMin) return `từ ${max} tuổi trở xuống${note}`
    return min === max ? `${min} tuổi${note}` : `${min}–${max} tuổi${note}`
  }
  if (language === 'zh') {
    const unit = completed ? '周岁' : '岁'
    if (openMax) return `${min}${unit}以上`
    if (openMin) return `${max}${unit}以下`
    return min === max ? `${min}${unit}` : `${min}至${max}${unit}`
  }
  const prefix = completed ? '만 ' : ''
  if (openMax) return `${prefix}${min}세 이상`
  if (openMin) return `${prefix}${max}세 이하`
  return min === max ? `${prefix}${min}세` : `${prefix}${min}~${max}세`
}

function methodLabel(method: MethodFact, language: DisplayLanguage): string {
  const words = WORDS[language]
  if (method.purpose === 'inquiry') {
    if (method.type === 'phone') return method.phone ? `${words.inquiryPhone} ${method.phone}` : words.inquiryPhone
    if (method.type === 'visit') return method.address ? `${words.inquiry} (${method.address})` : words.inquiry
    return `${words.online} ${words.inquiry}`
  }
  if (method.type === 'phone') return method.phone ? `${words.phone} ${method.phone}` : words.phone
  if (method.type === 'visit') return method.address ? `${words.visitApply} (${method.address})` : words.visitApply
  // 'XX 홈페이지 프로그램 신청'처럼 어디서 신청하는지 밝힌 원문 표현은 붙인다
  return method.label && !/^(?:온라인|인터넷)?\s*(?:신청|접수)$/.test(method.label) ? `${words.onlineApply} (${method.label})` : words.onlineApply
}

function sessionWhen(session: SessionFact, language: DisplayLanguage, today: string): string {
  const time = timeRangeLabel(session.start_time, session.end_time, language)
  return time ? `${dateLabel(session, language, today)} ${time}` : dateLabel(session, language, today)
}

const unique = <T>(values: T[]) => [...new Set(values)]
const WEEKDAY_ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
/** 요약 2줄에 회차 날짜를 모두 쓰는 최대 회차 수 */
export const MAX_LISTED_SESSIONS = 4

/** 다음 회차부터 남은 회차. 다음 회차가 없으면 null */
function remainingSessions(facts: SummaryFacts): SessionFact[] | null {
  const { sessions, next_session: next } = facts
  const from = next ? sessions.findIndex((session) => session.date === next.date && session.start_time === next.start_time) : -1
  return from >= 0 ? sessions.slice(from) : null
}

/** 앞으로 남은 회차(없으면 전체)의 요일. 월요일부터 순서대로 (지난 첫날만의 요일을 넣지 않는다) */
function upcomingWeekdays(facts: SummaryFacts): Weekday[] {
  const relevant = remainingSessions(facts) ?? facts.sessions
  return WEEKDAY_ORDER.filter((weekday) => relevant.some((session) => session.weekday === weekday))
}

/** 회차가 5개 이상인데 남은 회차가 4개 이하면 남은 회차를 하나씩 보여 준다 (격주·장소가 바뀌는 회차도 그대로 보이게) */
export function listedRemaining(facts: SummaryFacts): SessionFact[] | null {
  const remaining = remainingSessions(facts)
  return facts.sessions.length > MAX_LISTED_SESSIONS && remaining && remaining.length <= MAX_LISTED_SESSIONS ? remaining : null
}

/**
 * 모델에게 주는 언어별 사실. ISO 날짜 대신 그 언어의 표기만 담아 계산·환산할 여지를 없앤다.
 * null은 원문에서 확인되지 않은 값이다.
 */
export function localizeFacts(facts: SummaryFacts, language: DisplayLanguage) {
  const { today } = facts
  const sessions = facts.sessions
  const times = unique(sessions.map((session) => timeRangeLabel(session.start_time, session.end_time, language)))
  const places = unique(sessions.map((session) => (session.online ? WORDS[language].online : session.place)))
  const sessionFact = (session: SessionFact) => ({
    when: sessionWhen(session, language, today),
    place: session.online ? WORDS[language].online : session.place,
    address: session.address,
  })
  const remaining = listedRemaining(facts)
  const inquiry = facts.application_methods.filter((method) => method.purpose === 'inquiry').map((method) => methodLabel(method, language))
  return {
    title: facts.title,
    institution: facts.institution,
    target: {
      raw: facts.target_raw,
      type: facts.target_type,
      audience: facts.audience,
      grade: facts.grade_range ? gradeLabel(facts.grade_range, language) : null,
      age: facts.age_range ? ageLabel(facts.age_range, language, facts.age_completed) : null,
      eligibility: facts.eligibility_requirements,
      guardian_companion: facts.guardian_companion,
      sibling_companion: facts.sibling_companion,
      korean_level: facts.korean_level_required,
    },
    schedule: {
      sessions: sessions.map(sessionFact),
      /** 회차가 많을 때 다음 회차부터 남은 회차 (4개 이하일 때만) */
      remaining_sessions: remaining ? remaining.map(sessionFact) : null,
      /** 같은 요일마다 하다가 쉬는 날 */
      skipped_dates: facts.skipped_dates.map((fact) => dateLabel(fact, language, today)),
      /** 회차가 없을 때 원문의 공통 장소 (한국어 원문 표기) */
      venue: facts.venue,
      weekdays: upcomingWeekdays(facts).map((weekday) => WEEKDAY_NAMES[language][weekday]),
      same_time: sessions.length > 1 && times.length === 1 ? times[0] : null,
      same_place: sessions.length > 1 && places.length === 1 ? places[0] : null,
      undated_sessions: facts.undated_sessions,
      /** 회차도 기간도 없을 때 원문이 밝힌 대략의 일정 (한국어 원문 표기) */
      note: facts.schedule_note,
      next_session: facts.next_session ? sessionWhen(facts.next_session, language, today) : null,
      /** 이미 끝난 프로그램 */
      ended: facts.operation_ended,
      period_start: facts.period_start ? dateLabel(facts.period_start, language, today) : null,
      period_end: facts.period_end ? dateLabel(facts.period_end, language, today) : null,
      session_count: facts.session_count,
      attendance_rule: facts.attendance_rule,
      mid_join_allowed: facts.mid_join_allowed,
      /** 장소가 오산시 밖이면 그 주소 (한국어 원문 표기) */
      outside_osan: facts.outside_osan,
    },
    cost: { label: costLabel(facts.cost_krw, language, facts.cost_raw), raw: facts.cost_raw },
    capacity: facts.capacity,
    application: {
      start: facts.application_start ? dateTimeLabel(facts.application_start, language, today) : null,
      end: facts.application_end ? dateTimeLabel(facts.application_end, language, today) : null,
      /** 신청할 수 있는 방법 */
      methods: facts.application_methods.filter((method) => method.purpose === 'apply').map((method) => methodLabel(method, language)),
      /** 문의만 받는 연락처. 신청 방법이 아니다. 없으면 null */
      inquiry: inquiry.length ? inquiry : null,
      /** 신청 기간 없이 원문이 신청을 대략만 밝힌 표현 (한국어 원문 표기) */
      note: facts.application_note,
    },
    support_languages: facts.support_languages?.map((code) => LANGUAGE_CODE_NAMES[language][code] ?? code) ?? null,
    /** 원문이 언어 지원을 '통역'이라고 밝힘 */
    support_interpretation: facts.support_interpretation,
    /** 보호자에게 알리는 안내 (한국어 원문 그대로) */
    notices: facts.notices,
    check_items: facts.check_items,
  }
}

export type LocalizedFacts = ReturnType<typeof localizeFacts>
