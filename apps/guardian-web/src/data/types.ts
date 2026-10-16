/**
 * 보호자 서비스 명세 v2.2 6장의 데이터 계약을 프론트엔드 타입으로 옮긴 것.
 * 서버 계약이 확정되면 이 파일과 명세 6장을 함께 고칩니다.
 */
export type Locale = 'ko-easy' | 'vi' | 'zh'
export type MatchStatus = 'matched' | 'not_matched' | 'unknown' | 'not_applied'
export type ApplicationStatus = 'open' | 'upcoming' | 'closed' | 'unknown'
export type AttendanceRule = 'all_sessions' | 'choose_one' | 'unknown'
export type Interest = 'experience_culture' | 'korean_study' | 'sports_arts' | 'career'
export type TargetType = 'multicultural_family' | 'all' | 'parent_only' | 'unknown'
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type AvailableWindow =
  | { day_of_week: Weekday; start_time: string; end_time: string }
  | { date: string; start_time: string; end_time: string }

export interface SearchFilters {
  child_grade?: number
  child_age?: number
  available_windows: AvailableWindow[]
  interests: Interest[]
  dong?: string
  free_only: boolean
}

export const emptyFilters = (): SearchFilters => ({ available_windows: [], interests: [], free_only: false })

export interface ProgramSession {
  id: string
  date: string | null
  start_time: string | null
  end_time: string | null
  place_name: string | null
  dong: string | null
  online: boolean
}

export interface ApplicationMethod {
  type: 'online' | 'phone' | 'visit'
  url?: string
  phone?: string
  address?: string
}

/** 문의 목적의 연락 방법. 운영 시간·상담 언어는 기관 자료에서 확인된 경우에만 채웁니다. */
export interface InquiryMethod {
  type: 'phone' | 'visit' | 'online'
  phone?: string
  address?: string
  url?: string
  /** 원문 표기 그대로(한국어). 없으면 null */
  hours: string | null
  /** 확인된 상담 언어 코드('ko', 'vi', 'zh' …). 미상이면 null */
  languages: string[] | null
  verified_at: string
}

/** 원문 대조를 마친 언어별 핵심 안내. 이 객체가 있으면 그 언어는 검수본이 있다는 뜻입니다. */
export interface ReviewedSummary {
  title: string
  institution: string
  target: string
  description: string
  reviewed_at: string
}

/** 기관에 확인해야 할 항목. topic으로 화면 언어의 문구를 고르고, note_ko는 원문에 적힌 관련 표현입니다. */
export interface UncertainItem {
  topic: 'family_eligibility' | 'companion' | 'korean_level' | 'schedule' | 'age_grade' | 'materials' | 'other'
  note_ko: string | null
}

export type CompanionRule = 'required' | 'allowed' | 'not_allowed' | null

export interface Program {
  program_id: string
  /** 한국어 원문 */
  title: string
  institution: string
  category: Interest
  target_raw: string
  target_type: TargetType
  description: string
  grade_range: [number, number] | null
  age_range: [number, number] | null
  age_grade_match_status: MatchStatus
  eligibility_status: MatchStatus
  time_match_status: MatchStatus
  uncertain_items: UncertainItem[]
  matched_reasons: string[]
  attendance_rule: AttendanceRule
  mid_join_allowed?: boolean
  sessions: ProgramSession[]
  matched_sessions: string[]
  next_session: ProgramSession | null
  cost_krw: number | null
  cost_raw: string | null
  application_status: ApplicationStatus
  application_start: string | null
  application_end: string | null
  application_methods: ApplicationMethod[]
  application_languages: string[] | null
  inquiry_methods: InquiryMethod[]
  support_languages: string[] | null
  guardian_companion: CompanionRule
  sibling_companion: CompanionRule
  /** 공고에 적힌 필요 한국어 수준(원문). 미상이면 null */
  korean_level_required: string | null
  summaries_by_language: Partial<Record<Locale, ReviewedSummary>>
  source_url: string | null
  verified_at: string | null
  /** current: 게시 중 / recheck: 원문 변경을 알아 재검수 중 */
  review_state: 'current' | 'recheck'
  /** 시연용 가상 공고 */
  is_demo: boolean
}

export interface SearchResponse {
  results: Program[]
  needs_confirmation: Program[]
}
