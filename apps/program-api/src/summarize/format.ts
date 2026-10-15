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

/** 무료·금액 표기. 미상은 null (모델이 언어별 '확인 필요' 문장으로 쓴다) */
export function costLabel(krw: number | null, language: DisplayLanguage): string | null {
  if (krw === null) return null
  if (krw === 0) return WORDS[language].free
  if (language === 'vi') return `${grouped(krw, '.')} won`
  if (language === 'zh') return `${grouped(krw, ',')}韩元`
  return `${grouped(krw, ',')}원`
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

/** 상한 99·하한 0은 열린 범위 ('8세 이상') */
export function ageLabel([min, max]: [number, number], language: DisplayLanguage): string {
  const openMax = max >= 99
  const openMin = min <= 0
  if (language === 'vi') {
    if (openMax) return `từ ${min} tuổi trở lên`
    if (openMin) return `từ ${max} tuổi trở xuống`
    return min === max ? `${min} tuổi` : `${min}–${max} tuổi`
  }
  if (language === 'zh') {
    if (openMax) return `${min}岁以上`
    if (openMin) return `${max}岁以下`
    return min === max ? `${min}岁` : `${min}至${max}岁`
  }
  if (openMax) return `${min}세 이상`
  if (openMin) return `${max}세 이하`
  return min === max ? `${min}세` : `${min}~${max}세`
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
  return words.onlineApply
}

function sessionWhen(session: SessionFact, language: DisplayLanguage, today: string): string {
  const time = timeRangeLabel(session.start_time, session.end_time, language)
  return time ? `${dateLabel(session, language, today)} ${time}` : dateLabel(session, language, today)
}

const unique = <T>(values: T[]) => [...new Set(values)]

/**
 * 모델에게 주는 언어별 사실. ISO 날짜 대신 그 언어의 표기만 담아 계산·환산할 여지를 없앤다.
 * null은 원문에서 확인되지 않은 값이다.
 */
export function localizeFacts(facts: SummaryFacts, language: DisplayLanguage) {
  const { today } = facts
  const sessions = facts.sessions
  const times = unique(sessions.map((session) => timeRangeLabel(session.start_time, session.end_time, language)))
  const places = unique(sessions.map((session) => (session.online ? WORDS[language].online : session.place)))
  return {
    title: facts.title,
    institution: facts.institution,
    target: {
      raw: facts.target_raw,
      type: facts.target_type,
      audience: facts.audience,
      grade: facts.grade_range ? gradeLabel(facts.grade_range, language) : null,
      age: facts.age_range ? ageLabel(facts.age_range, language) : null,
      eligibility: facts.eligibility_requirements,
      guardian_companion: facts.guardian_companion,
      korean_level: facts.korean_level_required,
    },
    schedule: {
      sessions: sessions.map((session) => ({
        when: sessionWhen(session, language, today),
        place: session.online ? WORDS[language].online : session.place,
        address: session.address,
      })),
      /** 회차가 없을 때 원문의 공통 장소 (한국어 원문 표기) */
      venue: facts.venue,
      weekdays: unique(sessions.map((session) => WEEKDAY_NAMES[language][session.weekday])),
      same_time: sessions.length > 1 && times.length === 1 ? times[0] : null,
      same_place: sessions.length > 1 && places.length === 1 ? places[0] : null,
      undated_sessions: facts.undated_sessions,
      next_session: facts.next_session ? sessionWhen(facts.next_session, language, today) : null,
      period_start: facts.period_start ? dateLabel(facts.period_start, language, today) : null,
      period_end: facts.period_end ? dateLabel(facts.period_end, language, today) : null,
      session_count: facts.session_count,
      attendance_rule: facts.attendance_rule,
    },
    cost: { label: costLabel(facts.cost_krw, language), raw: facts.cost_raw },
    capacity: facts.capacity,
    application: {
      start: facts.application_start ? dateTimeLabel(facts.application_start, language, today) : null,
      end: facts.application_end ? dateTimeLabel(facts.application_end, language, today) : null,
      /** 신청할 수 있는 방법 */
      methods: facts.application_methods.filter((method) => method.purpose === 'apply').map((method) => methodLabel(method, language)),
      /** 문의만 받는 연락처. 신청 방법이 아니다 */
      inquiry: facts.application_methods.filter((method) => method.purpose === 'inquiry').map((method) => methodLabel(method, language)),
    },
    support_languages: facts.support_languages?.map((code) => LANGUAGE_CODE_NAMES[language][code] ?? code) ?? null,
    check_items: facts.check_items,
  }
}

export type LocalizedFacts = ReturnType<typeof localizeFacts>
