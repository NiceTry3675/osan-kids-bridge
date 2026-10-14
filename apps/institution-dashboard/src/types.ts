// 데이터 항목 초안 v0.2(계획서 3절). 초안이 바뀌면 이 파일과 src/data/generate.ts를 함께 바꿉니다.
export type Dong = '중앙동' | '대원동' | '남촌동' | '신장동' | '세마동' | '초평동'
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
/** 오전 06~12시, 오후 12~18시, 저녁 18~22시 (경계 시각은 src/data/assumptions.ts) */
export type DayPart = 'morning' | 'afternoon' | 'evening'
export type SlotKey = `${Weekday}-${DayPart}`
/** 보호자 웹과 같은 관심 분야 값 */
export type Interest = 'experience_culture' | 'korean_study' | 'sports_arts' | 'career'
/** 자녀 한국어 수준. 선택 항목이라 비어 있을 수 있습니다. */
export type KoreanLevel = 'beginner' | 'intermediate' | 'fluent'
/** 보호자 웹의 화면 언어. 출신국 대신 이 값만 씁니다. */
export type ScreenLanguage = 'ko-easy' | 'vi' | 'zh'
export type Grade = 1 | 2 | 3 | 4 | 5 | 6

/** 보호자 한 가정이 익명으로 남긴 희망 조건. 이름·연락처·정확한 주소·출신국은 없습니다. */
export interface DemandResponse {
  id: string
  dong: Dong
  child_grade: Grade
  available_slots: SlotKey[]
  interests: Interest[]
  korean_level?: KoreanLevel
  screen_language: ScreenLanguage
}

/** 보호자 웹 src/types.ts의 AvailableWindow와 같은 모양(앱끼리 직접 가져오지 않도록 복사해 둠) */
export type GuardianAvailableWindow =
  | { day_of_week: Weekday; start_time: string; end_time: string }
  | { date: string; start_time: string; end_time: string }

/** 기관이 고를 수 있는 후보 장소(시연용 가상 장소) */
export interface Venue {
  id: string
  name: string
  dong: Dong
  /** 대관 가능한 칸(21칸 중 일부) */
  bookable: SlotKey[]
}

/** 선택지 하나 = (요일·시간대 칸, 장소) */
export interface ProgramOption {
  slot: SlotKey
  venueId: string
}

/** 기관이 화면에서 정하는 프로그램 조건 */
export interface ProgramPlan {
  interest: Interest | 'all'
  gradeRange: [Grade, Grade]
  classCount: number
  capacity: number
  venueIds: string[]
  /** 비교할 기존 계획: 반마다 (칸, 장소) 하나. 추천과 같은 반 수로 비교합니다. */
  baseline?: ProgramOption[]
}

export type SearchMethod = 'exact' | 'greedy'

export interface ClassResult {
  option: ProgramOption
  venue: Venue
  /** 같은 칸·같은 동이라 닿는 가정이 똑같은 다른 후보 장소 */
  alternatives: Venue[]
  /** 이 반에 닿는 대상 가정 수 */
  reach: number
  /** 앞선 반들에 더해 이 반이 새로 더하는 가정 수 */
  marginal: number
  /** 화면 표시용 '새로 더함'. 2반 이후가 둘 이상이면 합계에서 빼서 알아내지 못하도록 보조 억제를 거칩니다. */
  marginalSafe: SafeCount
  /** 여러 반에 닿는 가정을 고르게 나눴을 때 이 반 몫(가정 수, 소수) */
  share: number
  /** share × 신청 전환율(시연용 가정) */
  expectedHeadcount: number
  overCapacity: boolean
}

export interface SafeCountValue { suppressed: false; value: number }
/** masked: 합계에서 빼서 알아내지 못하도록 함께 가린 칸(보조 억제). 1~4인지 아닌지도 드러내지 않고 "가림"으로 표시합니다. */
export interface SafeCountSuppressed { suppressed: true; masked?: true }
/** 소수 셀 억제를 거친 집계 숫자. 1~4는 값을 감춥니다. */
export type SafeCount = SafeCountValue | SafeCountSuppressed

export interface Recommendation {
  rank: number
  options: ProgramOption[]
  classes: ClassResult[]
  covered: number
  coverageRate: number
  languageBreakdown: Record<ScreenLanguage, SafeCount>
  koreanLevelBreakdown: Record<KoreanLevel | 'none', SafeCount>
  languageSuggestions: string[]
  teachingSuggestions: string[]
  warnings: string[]
  explanation: string
  /** 기존 계획 대비 커버리지 차이(가정 수). 기존 계획이 없으면 undefined */
  baselineDelta?: number
}

export interface BaselineClass {
  option: ProgramOption
  venue: Venue
  /** 그 장소가 그 칸에 대관 가능으로 등록되어 있는지 */
  bookable: boolean
}

export interface BaselineResult {
  classes: BaselineClass[]
  covered: number
  coverageRate: number
}

export type RecommendStatus = 'ok' | 'insufficient' | 'no_options' | 'no_reach'

export interface RecommendResult {
  status: RecommendStatus
  method: SearchMethod
  eligibleCount: number
  /** (칸, 장소) 선택지 수 */
  optionCount: number
  /** 같은 칸·같은 동으로 묶은 뒤 실제로 비교한 묶음 수 */
  groupCount: number
  /** 따져 본 묶음 조합 수(반 수보다 적은 묶음 + 같은 시간 다른 장소 조합 포함) */
  comboCount: number
  /** 정확 탐색을 허용한 최대 조합 수 */
  comboLimit: number
  classCount: number
  recommendations: Recommendation[]
  baseline?: BaselineResult
  /** 반 하나만 열 때 가장 많이 닿는 선택지의 커버리지 */
  bestSingleCovered: number
  notices: string[]
}
