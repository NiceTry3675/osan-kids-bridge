export type MatchStatus = 'matched' | 'not_matched' | 'unknown' | 'not_applied'
export type ApplicationStatus = 'open' | 'upcoming' | 'closed' | 'unknown'
export type AttendanceRule = 'all_sessions' | 'choose_one' | 'unknown'
export type Interest = 'experience_culture' | 'korean_study' | 'sports_arts' | 'career'

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
  matched_sessions: string[]
  next_session: ProgramSession | null
  cost_krw: number | null
  cost_raw: string | null
  application_status: ApplicationStatus
  application_start: string | null
  application_end: string | null
  application_methods: ApplicationMethod[]
  source_url: string | null
  verified_at: string | null
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
