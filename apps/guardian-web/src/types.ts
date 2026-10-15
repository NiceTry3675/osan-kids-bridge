export type MatchStatus = 'matched' | 'not_matched' | 'unknown' | 'not_applied'
export type ApplicationStatus = 'open' | 'upcoming' | 'closed' | 'unknown'
export type AttendanceRule = 'all_sessions' | 'choose_one' | 'unknown'
export type Interest = 'experience_culture' | 'korean_study' | 'sports_arts' | 'career'
export type CompanionRule = 'required' | 'allowed' | 'not_allowed' | 'unknown'

export type AvailableWindow =
  | { day_of_week: Weekday; start_time: string; end_time: string }
  | { date: string; start_time: string; end_time: string }

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface SearchFilters {
  child_grade?: number
  child_age?: number
  available_windows: AvailableWindow[]
  interests: Interest[]
  dong?: string
  free_only: boolean
}

export interface ProgramSession {
  id: string
  date: string | null
  start_time: string | null
  end_time: string | null
  place_name: string | null
  /** 원문의 주소 (오산시 밖 장소를 알리는 데 쓴다) */
  address?: string | null
  dong: string | null
  online: boolean
}

/** 회차와 별도로 공고에 적힌 공통 장소. 회차가 없는 공고의 장소로 쓴다 */
export interface ProgramVenue {
  place_name: string | null
  address: string | null
  dong: string | null
  online: boolean
}

export interface ApplicationMethod {
  type: 'online' | 'phone' | 'visit'
  label: string
  url?: string
  phone?: string
  address?: string
}

export type SummaryStatus = 'machine_draft' | 'machine_checked' | 'approved'

/** 프로그램 API가 구조화된 사실로 만든 언어별 3줄 요약. 승인 전이면 status로 구분한다 */
export interface LanguageSummary {
  lines: string[]
  status: SummaryStatus
}

export interface Program {
  program_id: string
  title: string
  institution: string
  category: Interest
  target_raw: string
  description: string
  grade_range: [number, number] | null
  age_range: [number, number] | null
  age_grade_match_status: MatchStatus
  eligibility_status: MatchStatus
  time_match_status: MatchStatus
  uncertain_items: string[]
  matched_reasons: string[]
  attendance_rule: AttendanceRule
  mid_join_allowed?: boolean
  sessions: ProgramSession[]
  venue?: ProgramVenue | null
  /** 회차도 기간도 없을 때 원문이 밝힌 대략의 일정 ('11월 중 운영 예정') */
  schedule_note?: string | null
  matched_sessions: string[]
  next_session: ProgramSession | null
  cost_krw: number | null
  cost_raw: string | null
  application_status: ApplicationStatus
  application_start: string | null
  application_end: string | null
  application_methods: ApplicationMethod[]
  /** 보호자에게 알리는 안내 문장 (원문 그대로) */
  notices?: string[]
  guardian_companion?: CompanionRule
  sibling_companion?: CompanionRule
  korean_level_required?: string | null
  /** 기관이 통역·진행하는 언어 코드. 미상이면 null */
  support_languages?: string[] | null
  source_url: string | null
  verified_at: string | null
  summaries_by_language?: Partial<Record<'ko-easy' | 'vi' | 'zh', LanguageSummary>>
}

export interface SearchResponse {
  results: Program[]
  needs_confirmation: Program[]
}

export const emptyFilters = (): SearchFilters => ({
  available_windows: [],
  interests: [],
  free_only: false,
})
