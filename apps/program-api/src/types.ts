// 공고 구조화 데이터와 보호자 웹 API의 데이터 계약.
// API 응답(ProgramResponse)은 보호자 웹(apps/guardian-web/src/data/types.ts)의 Program을 그대로 만족하고
// (test/contract.test.ts가 타입으로 확인), 보호자 명세 v2.2 6장의 추가 필드를 덧붙인다.

export type MatchStatus = 'matched' | 'not_matched' | 'unknown' | 'not_applied'
export type ApplicationStatus = 'open' | 'upcoming' | 'closed' | 'unknown'
export type AttendanceRule = 'all_sessions' | 'choose_one' | 'unknown'
export type Interest = 'experience_culture' | 'korean_study' | 'sports_arts' | 'career'
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type DisplayLanguage = 'ko-easy' | 'vi' | 'zh'

/** 공고 원문이 밝힌 대상 구분. parent_only는 보호자만 참여하는 공고. */
export type TargetType = 'multicultural_family' | 'all' | 'parent_only' | 'unknown'

/** 실제로 참여하는 사람. 자녀 프로그램 목록에는 child·parent_child만 나온다. */
export type Audience = 'child' | 'parent_child' | 'parent_only' | 'adult' | 'unknown'

export type CompanionRule = 'required' | 'allowed' | 'not_allowed' | 'unknown'
/** 보호자 웹 계약의 동반 규칙. 미상은 null */
export type GuardianCompanionRule = Exclude<CompanionRule, 'unknown'> | null

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
  display_language?: DisplayLanguage
}

export interface ProgramSession {
  id: string
  /** YYYY-MM-DD, Asia/Seoul. 미상이면 null */
  date: string | null
  /** HH:MM. 미상이면 null */
  start_time: string | null
  end_time: string | null
  place_name: string | null
  /** 오산시 행정동(중앙동·대원동·남촌동·신장동·세마동·초평동). 오산 밖이거나 미상이면 null */
  dong: string | null
  online: boolean
  /** 원문에 적힌 주소. 확인되지 않으면 null */
  address?: string | null
}

/** 회차와 별도로 원문에 적힌 공통 장소. 회차가 없는 공고는 이 장소를 보여준다 */
export interface ProgramVenue {
  place_name: string | null
  address: string | null
  /** 오산시 행정동. 오산 밖이거나 미상이면 null */
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

/** 원문 근거. quote는 원문(웹 글 또는 포스터 판독문)에 그대로 있는 문장이어야 한다. */
export interface Evidence {
  field: string
  quote: string
  /** 원문에서 quote를 실제로 찾았는지 (코드가 검사) */
  verified: boolean
}

export type SummaryStatus = 'machine_draft' | 'machine_checked' | 'approved'

/** 목록·상세 머리에 쓰는 그 언어의 제목·기관·대상 (베트남어·중국어만 저장. 쉬운 한국어는 원문을 쓴다) */
export interface SummaryHeading {
  title: string
  institution: string
  target: string
}

export interface LanguageSummary {
  /** 3줄 안내. 구조화된 사실만으로 만든다 */
  lines: string[]
  /** 그 언어의 제목·기관·대상. 베트남어·중국어에서 이것이 없으면 보호자 웹에 그 언어 안내를 내보내지 않는다 */
  heading?: SummaryHeading
  status: SummaryStatus
  generated_at: string
  /** 자동 대조에서 발견한 문제. 비어 있어야 machine_checked */
  issues: string[]
  /** 이 언어의 최종 검수자 (approved일 때만) */
  reviewer?: string | null
  /** 사람이 승인한 시각 (ISO) */
  approved_at?: string | null
  /** 승인 때의 사실 해시·언어·문구의 해시. 사실이나 문구가 바뀌면 승인이 풀린 것으로 본다 */
  approved_hash?: string | null
}

export type SummariesByLanguage = Partial<Record<DisplayLanguage, LanguageSummary>>

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface ReviewState {
  status: ReviewStatus
  reviewed_at: string | null
  reviewer: string | null
  notes: string | null
  /** 승인할 때의 사실 해시. 사실이 바뀌면 다시 검수 대기로 본다 */
  facts_hash: string | null
}

export interface SourceInfo {
  /** 공고 원문 주소 */
  url: string | null
  /** 원문을 사람이 저장한 시각 또는 확인일 (YYYY-MM-DD) */
  retrieved_at: string | null
  /** inbox 안에서의 파일 이름들 (텍스트·이미지) */
  files: string[]
  /** 원문 텍스트 + 포스터 판독문의 SHA-256. 원문이 바뀌었는지 판단 */
  content_hash: string
  /** 시연용으로 만든 가상 공고 (inbox source.json의 demo: true). 보호자 웹이 실제 기관 링크로 보내지 않는다 */
  demo?: true
}

/**
 * 저장되는 공고 한 건. 검색 조건과 무관한 사실만 담는다.
 * 신청 상태·시간 일치 같은 판정은 요청 시점에 계산한다.
 */
export interface ProgramRecord {
  program_id: string
  title: string
  institution: string
  category: Interest
  audience: Audience
  target_type: TargetType
  /** 대상 원문 표현 그대로 */
  target_raw: string
  description: string
  grade_range: [number, number] | null
  age_range: [number, number] | null
  /** 학년·나이 외의 참여 자격 (예: '다문화가족', '오산시 거주'). 없다고 확인되면 [], 미상이면 null */
  eligibility_requirements: string[] | null
  guardian_companion: CompanionRule
  sibling_companion: CompanionRule
  /** 원문에 적힌 필요 한국어 수준. 미상이면 null */
  korean_level_required: string | null
  /** 기관이 실제로 진행·통역하는 언어. 미상 null, 확인 결과 없음 [] */
  support_languages: string[] | null
  /** 신청 페이지 언어. 미상 null */
  application_languages: string[] | null
  sessions: ProgramSession[]
  /** 원문의 공통 장소. 근거가 확인되지 않으면 null (이 필드가 생기기 전에 저장한 공고에는 없다) */
  venue?: ProgramVenue | null
  /** 회차도 운영 기간도 없이 일정을 대략만 밝힌 원문 표현 ('11월 중 운영 예정'). 이 필드가 생기기 전에 저장한 공고에는 없다 */
  schedule_note?: string | null
  /** 원문이 기간만 밝히고 회차별 일시를 밝히지 않은 경우의 운영 기간 */
  period_start: string | null
  period_end: string | null
  /** 원문에 적힌 총 회차 수 */
  session_count: number | null
  attendance_rule: AttendanceRule
  mid_join_allowed: boolean | null
  cost_krw: number | null
  cost_raw: string | null
  capacity: number | null
  /** YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM (Asia/Seoul). 시각이 없으면 날짜만 */
  application_start: string | null
  application_end: string | null
  application_methods: ApplicationMethod[]
  /** 신청 기간 없이 신청을 대략만 밝힌 원문 표현 ('일정 확정 후 별도 안내'). 이 필드가 생기기 전에 저장한 공고에는 없다 */
  application_note?: string | null
  /** 판정 없이도 확인이 필요한 사항 (원문에 없는 조건 등) */
  uncertain_items: string[]
  /** 보호자에게 알리는 안내 문장 (보호자 대기 장소, 준비물 등). 원문 그대로 */
  notices?: string[]
  evidence: Evidence[]
  summaries_by_language: SummariesByLanguage
  source: SourceInfo
  extracted_at: string
  model: string
  /** 정규화 중 발견한 경고 (원문과 맞지 않는 값, 근거 없는 값 등) */
  warnings: string[]
  review: ReviewState
  /** 게시 뒤 기관 담당자가 보호자 질문을 보고 덧붙인 안내. 이 필드가 생기기 전에 저장한 공고에는 없다 */
  addenda?: Addendum[]
}

/**
 * 기관 추가 안내: 공고에 없어 보호자들이 되물은 내용을 기관 담당자가 확정해 덧붙인 문장.
 * 원문이 아니라 담당자의 확인이므로 사실 해시(원문 검수)에 넣지 않고, 담당자 이름·시각을 함께 남긴다.
 */
export interface Addendum {
  id: string
  topic: UncertainTopic
  /** 담당자가 확정한 한국어 문장 */
  text: string
  /** 이 안내로 답이 된 보호자 질문 (질문 문장 그대로) */
  resolves_questions: string[]
  /** 이 안내로 더 이상 '기관에 확인할 점'이 아닌 항목 (확인 항목 문구 그대로) */
  resolves_items: string[]
  author: string
  /** ISO */
  added_at: string
  /** AI 초안에서 시작했는가 */
  drafted_by_ai: boolean
}

/** 보호자 웹이 받는 기관 추가 안내 (guardian-web Program.addenda). 담당자 이름과 보호자 질문 원문은 보내지 않는다 */
export interface GuardianAddendum {
  topic: UncertainTopic
  /** 담당자가 확정한 한국어 문장 */
  text: string
  /** 덧붙인 날 (서울 기준 YYYY-MM-DD). 보호자 웹 formatDate가 날짜만 받으므로 시각은 뺀다. 읽을 수 없으면 null */
  added_at: string | null
}

/** 보호자 웹의 '기관에 확인할 점' 주제 (guardian-web UncertainItem.topic) */
export type UncertainTopic = 'family_eligibility' | 'companion' | 'korean_level' | 'schedule' | 'age_grade' | 'materials' | 'other'

export interface UncertainItem {
  topic: UncertainTopic
  /** 원문에서 찾은 관련 표현. 없으면 null */
  note_ko: string | null
}

/** 문의 목적의 연락 방법. 운영 시간·상담 언어는 원문에서 따로 확인하지 않으므로 null */
export interface InquiryMethod {
  type: 'phone' | 'visit' | 'online'
  phone?: string
  address?: string
  url?: string
  hours: string | null
  languages: string[] | null
  /** 연락처를 확인한 날 (YYYY-MM-DD, 공고 검수일) */
  verified_at: string
}

/** 보호자 웹이 받는 언어별 안내 (guardian-web ReviewedSummary + 검수 상태·3줄) */
export interface GuardianSummary extends SummaryHeading {
  /** 3줄 안내를 이어 붙인 글 */
  description: string
  /** 사람이 승인한 시각, 자동 대조만 거친 시연용 요약이면 만든 시각 */
  reviewed_at: string
  status: Extract<SummaryStatus, 'approved' | 'machine_checked'>
  lines: string[]
}

/** 보호자 웹이 받는 프로그램 한 건 (guardian-web Program + 명세 v2.2 추가 필드) */
export interface ProgramResponse {
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
  /** 기관에 확인할 점 (보호자 웹이 화면 언어로 보여주는 주제) */
  uncertain_items: UncertainItem[]
  /** 같은 내용의 한국어 문구 (주제로 묶기 전 전부) */
  uncertain_items_ko: string[]
  matched_reasons: string[]
  attendance_rule: AttendanceRule
  mid_join_allowed?: boolean
  sessions: ProgramSession[]
  venue: ProgramVenue | null
  schedule_note: string | null
  matched_sessions: string[]
  /**
   * 대표 회차: 시간이 맞으면 가장 빠른 일치 회차, 아니면 앞으로 시작할 가장 빠른 회차.
   * 그런 회차가 없으면 끝난 공고는 마지막 회차, 날짜 미상이면 장소가 있는 회차나 원문의 공통 장소(날짜 null, id 'venue')
   */
  next_session: ProgramSession | null
  cost_krw: number | null
  cost_raw: string | null
  application_status: ApplicationStatus
  /** YYYY-MM-DD. 보호자 웹 formatDate가 날짜만 받으므로 날짜 부분만 보낸다 */
  application_start: string | null
  application_end: string | null
  /** 신청 방법 (문의만 받는 연락처는 inquiry_methods로 뺀다). 주소가 없는 온라인 신청은 원문 주소로 연결한다 */
  application_methods: ApplicationMethod[]
  inquiry_methods: InquiryMethod[]
  application_note: string | null
  notices: string[]
  /** 게시 뒤 기관 담당자가 확인해 덧붙인 안내 (공고 원문이 아니다). 없으면 [] */
  addenda: GuardianAddendum[]
  source_url: string | null
  verified_at: string | null
  /** 게시된 공고만 내보내므로 늘 current (승인 뒤 사실이 바뀐 공고는 410) */
  review_state: 'current' | 'recheck'
  /** 시연용으로 만든 가상 공고 (record.source.demo, inbox source.json의 "demo": true). 보호자 웹이 실제 기관 링크·전화로 보내지 않는다 */
  is_demo: boolean
  // 명세 v2.2 6장 추가 필드
  /** 원문에 시각까지 있으면 YYYY-MM-DDTHH:MM, 아니면 YYYY-MM-DD */
  application_start_at: string | null
  application_end_at: string | null
  target_type: TargetType
  audience: Audience
  eligibility_requirements: string[] | null
  guardian_companion: GuardianCompanionRule
  sibling_companion: GuardianCompanionRule
  korean_level_required: string | null
  support_languages: string[] | null
  /** 원문이 그 언어 지원을 '통역'이라고 밝힘 (수업 언어가 아니다) */
  support_interpretation: boolean
  application_languages: string[] | null
  period_start: string | null
  period_end: string | null
  session_count: number | null
  capacity: number | null
  /** 내보낼 수 있는 언어별 안내만 (명세 5.4: 없는 언어는 보호자 웹이 '안내 없음'으로 보여준다) */
  summaries_by_language: Partial<Record<DisplayLanguage, GuardianSummary>>
  /** 주요 사실의 원문 근거 (원문에서 찾은 인용만). field는 ProgramRecord.evidence와 같은 이름 */
  source_evidence: Pick<Evidence, 'field' | 'quote'>[]
}

export interface SearchResponse {
  results: ProgramResponse[]
  needs_confirmation: ProgramResponse[]
}

export const OSAN_DONGS = ['중앙동', '대원동', '남촌동', '신장동', '세마동', '초평동'] as const
export type OsanDong = (typeof OSAN_DONGS)[number]
export const INTERESTS: Interest[] = ['experience_culture', 'korean_study', 'sports_arts', 'career']
export const DISPLAY_LANGUAGES: DisplayLanguage[] = ['ko-easy', 'vi', 'zh']
