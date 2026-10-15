import { INTERESTS } from '../types'
import type { Audience, AttendanceRule, CompanionRule, Interest, TargetType, Weekday } from '../types'
import { LANGUAGE_NAMES } from './evidence'

// Gemini 추출 응답 형식. 값마다 원문 인용(*_evidence)을 먼저 적게 해 근거에서 값을 끌어내도록 한다.

export const LANGUAGE_CODES = Object.keys(LANGUAGE_NAMES)
export const AUDIENCES: Audience[] = ['child', 'parent_child', 'parent_only', 'adult', 'unknown']
export const TARGET_TYPES: TargetType[] = ['multicultural_family', 'all', 'parent_only', 'unknown']
export const COMPANION_RULES: CompanionRule[] = ['required', 'allowed', 'not_allowed', 'unknown']
export const ATTENDANCE_RULES: AttendanceRule[] = ['all_sessions', 'choose_one', 'unknown']
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const METHOD_TYPES = ['online', 'phone', 'visit'] as const

export interface RawSession {
  date_evidence: string[]
  date: string | null
  weekday_stated: Weekday | null
  time_evidence: string[]
  start_time: string | null
  end_time: string | null
  place_evidence: string[]
  place_name: string | null
  address: string | null
  online: boolean | null
}

export interface RawApplicationMethod {
  evidence: string[]
  type: (typeof METHOD_TYPES)[number]
  label: string | null
  url: string | null
  phone: string | null
  address: string | null
}

/** 모델이 돌려주는 날것의 추출 결과. normalize.ts가 검증해 ProgramRecord로 바꾼다 */
export interface RawExtraction {
  title_evidence: string[]
  title: string | null
  institution_evidence: string[]
  institution: string | null
  category: Interest
  target_evidence: string[]
  target_raw: string | null
  target_type: TargetType
  audience_evidence: string[]
  audience: Audience
  description: string | null
  grade_evidence: string[]
  grade_min: number | null
  grade_max: number | null
  age_evidence: string[]
  age_min: number | null
  age_max: number | null
  eligibility_evidence: string[]
  eligibility_requirements: string[] | null
  guardian_companion_evidence: string[]
  guardian_companion: CompanionRule
  sibling_companion_evidence: string[]
  sibling_companion: CompanionRule
  korean_level_evidence: string[]
  korean_level_required: string | null
  support_languages_evidence: string[]
  support_languages: string[] | null
  application_languages_evidence: string[]
  application_languages: string[] | null
  venue_evidence: string[]
  venue_place_name: string | null
  venue_address: string | null
  venue_online: boolean | null
  sessions: RawSession[]
  schedule_note: string | null
  period_evidence: string[]
  period_start: string | null
  period_end: string | null
  session_count_evidence: string[]
  session_count: number | null
  attendance_evidence: string[]
  attendance_rule: AttendanceRule
  mid_join_evidence: string[]
  mid_join_allowed: boolean | null
  cost_evidence: string[]
  cost_krw: number | null
  cost_raw: string | null
  capacity_evidence: string[]
  capacity: number | null
  application_period_evidence: string[]
  application_start: string | null
  application_end: string | null
  application_methods: RawApplicationMethod[]
  application_note: string | null
  notices: string[]
  uncertain_items: string[]
}

type Schema = Record<string, unknown>

const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] })
const text = (description: string): Schema => nullable({ type: 'string', description })
const integer = (description: string): Schema => nullable({ type: 'integer', description })
const flag = (description: string): Schema => nullable({ type: 'boolean', description })
const choice = (values: readonly string[], description: string): Schema => ({ type: 'string', enum: [...values], description })
const quotes = (what: string): Schema => ({
  type: 'array',
  items: { type: 'string' },
  maxItems: 3,
  description: `${what}의 근거. 원문에서 글자 그대로 복사한 짧은 구절(80자 이하). 값이 null/unknown이면 빈 배열`,
})

function object(properties: Record<string, Schema>): Schema {
  return { type: 'object', properties, required: Object.keys(properties) }
}

const DATE = 'YYYY-MM-DD'

const sessionSchema = object({
  date_evidence: quotes('이 회차 날짜'),
  date: { type: 'string', description: `원문에 적힌 이 회차의 날짜 (${DATE})` },
  weekday_stated: nullable(choice(WEEKDAYS, '원문이 이 날짜에 붙여 적은 요일. 적혀 있지 않으면 null')),
  time_evidence: quotes('이 회차 시작·종료 시각'),
  start_time: text('원문에 적힌 이 회차 시작 시각 HH:MM (24시간). 시각이 없으면 null'),
  end_time: text('원문에 적힌 이 회차 종료 시각 HH:MM (24시간). 없으면 null'),
  place_evidence: quotes('이 회차 장소'),
  place_name: text('이 회차 장소 이름. 프로그램 전체 장소(venue)와 같으면 null'),
  address: text('이 회차 장소 주소 (원문 그대로). 없으면 null'),
  online: flag('원문이 온라인 진행이라고 밝혔으면 true'),
})

const methodSchema = object({
  evidence: quotes('이 신청·문의 방법'),
  type: choice(METHOD_TYPES, 'online: 웹 신청, phone: 전화, visit: 방문'),
  label: text('원문의 신청 방법 표현 그대로 (예: 오산시가족센터 홈페이지 프로그램 신청, 전화 신청·문의, 방문 신청)'),
  url: text('원문에 적힌 신청 URL. 원문에 없으면 null'),
  phone: text('원문에 적힌 전화번호'),
  address: text('방문 신청 장소·주소'),
})

/** responseJsonSchema로 넘기는 추출 스키마 */
export const EXTRACTION_SCHEMA: Schema = object({
  title_evidence: quotes('프로그램 이름'),
  title: text('프로그램 이름 (원문 그대로)'),
  institution_evidence: quotes('운영 기관'),
  institution: text('운영 기관 이름 (원문 그대로)'),
  category: choice(INTERESTS, '가장 가까운 관심 분야 하나'),
  target_evidence: quotes('대상'),
  target_raw: text('원문의 대상 표현 그대로'),
  target_type: choice(TARGET_TYPES, '원문이 밝힌 대상 구분'),
  audience_evidence: quotes('실제 참여자'),
  audience: choice(AUDIENCES, '실제로 참여하는 사람'),
  description: text('명시된 사실만으로 쓴 1~2문장 중립적 한국어 소개'),
  grade_evidence: quotes('학년 범위'),
  grade_min: integer('최저 학년 (초1~6=1~6, 중1~3=7~9, 고1~3=10~12)'),
  grade_max: integer('최고 학년 (같은 규칙)'),
  age_evidence: quotes('나이 범위'),
  age_min: integer('최저 나이 (원문에 나이로 적힌 경우만)'),
  age_max: integer('최고 나이 (원문에 나이로 적힌 경우만)'),
  eligibility_evidence: quotes('참여 자격'),
  eligibility_requirements: nullable({ type: 'array', items: { type: 'string' }, description: '학년·나이 외의 참여 자격 (예: 다문화가족, 오산시 거주). 제한이 없다고 명시되면 []. 언급이 없으면 null' }),
  guardian_companion_evidence: quotes('보호자 동반 규칙'),
  guardian_companion: choice(COMPANION_RULES, '보호자 동반 규칙'),
  sibling_companion_evidence: quotes('형제자매 동반 규칙'),
  sibling_companion: choice(COMPANION_RULES, '형제자매 동반 규칙'),
  korean_level_evidence: quotes('필요 한국어 수준'),
  korean_level_required: text('원문에 적힌 필요 한국어 수준'),
  support_languages_evidence: quotes('기관의 통역·진행 언어'),
  support_languages: nullable({ type: 'array', items: { type: 'string', enum: LANGUAGE_CODES }, description: '기관이 실제로 통역·진행하는 언어 코드' }),
  application_languages_evidence: quotes('신청 페이지·신청서 언어'),
  application_languages: nullable({ type: 'array', items: { type: 'string', enum: LANGUAGE_CODES }, description: '신청 페이지·신청서가 지원한다고 적힌 언어 코드' }),
  venue_evidence: quotes('프로그램 전체 장소'),
  venue_place_name: text('프로그램 전체(모든 회차)의 장소 이름'),
  venue_address: text('프로그램 전체 장소의 주소 (원문 그대로)'),
  venue_online: flag('프로그램 전체가 온라인이면 true'),
  sessions: { type: 'array', items: sessionSchema, description: '원문에 구체적인 날짜가 적힌 운영 회차만' },
  schedule_note: text('회차 날짜도 운영 기간도 없이 일정을 대략만 밝힌 원문 표현 그대로 (예: 11월 중 운영 예정 (날짜·시간 추후 안내)). 회차나 운영 기간을 적었으면 null'),
  period_evidence: quotes('운영 기간'),
  period_start: text(`운영(행사·교육) 기간 시작일 ${DATE}`),
  period_end: text(`운영(행사·교육) 기간 종료일 ${DATE}`),
  session_count_evidence: quotes('총 회차 수'),
  session_count: integer('원문에 적힌 총 회차 수'),
  attendance_evidence: quotes('참석 방식'),
  attendance_rule: choice(ATTENDANCE_RULES, 'all_sessions: 전 회차 과정, choose_one: 원하는 회차를 골라 참여, unknown: 판단 불가'),
  mid_join_evidence: quotes('중도 참여 허용 여부'),
  mid_join_allowed: flag('중도 참여 허용 여부 (명시된 경우만)'),
  cost_evidence: quotes('비용'),
  cost_krw: integer('참가비(원). 무료면 0. 적혀 있지 않으면 null'),
  cost_raw: text('비용 원문 표현 그대로'),
  capacity_evidence: quotes('정원'),
  capacity: integer('정원(명·가족 수)'),
  application_period_evidence: quotes('신청(접수·모집) 기간'),
  application_start: text(`신청 시작 ${DATE} 또는 ${DATE}THH:MM (시각이 적힌 경우)`),
  application_end: text(`신청 마감 ${DATE} 또는 ${DATE}THH:MM (시각이 적힌 경우)`),
  application_methods: { type: 'array', items: methodSchema, description: '원문에 적힌 신청·문의 방법만' },
  application_note: text('신청 기간을 밝히지 않고 신청을 대략만 안내한 원문 표현 그대로 (예: 일정 확정 후 별도 안내). 신청 기간을 적었으면 null'),
  notices: { type: 'array', items: { type: 'string' }, maxItems: 4, description: '보호자에게 알리는 안내 문장(보호자 대기 장소, 준비물, 복장, 만든 것을 가져가는지 등)을 원문 그대로. 다른 항목이 다루는 일정·비용·대상·신청 문장은 넣지 않는다. 없으면 []' },
  uncertain_items: { type: 'array', items: { type: 'string' }, description: '원문이 모호하거나 서로 맞지 않아 보호자가 기관에 확인해야 할 점 (짧은 한국어 명사구)' },
})
