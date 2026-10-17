// ─────────────────────────────────────────────────────────────────────────────
// 시연용 가정 모음
// 이 파일의 숫자는 모두 시연 화면을 만들기 위한 가정이며 실제 통계가 아닙니다.
// 합성 데이터 생성, 시간대 변환, 소수 셀 억제, 추천 규칙이 모두 이 값을 읽습니다.
// 값을 바꾸면 화면과 테스트 결과가 함께 바뀝니다.
// ─────────────────────────────────────────────────────────────────────────────
import type { DayPart, Dong, Grade, Interest, KoreanLevel, ProgramPlan, ScreenLanguage, Weekday } from './types'

/** 시연용 가정: 고정 시드. 새로고침해도 같은 합성 데이터가 나옵니다. */
export const DEMO_SEED = 20261014

/** 시연용 가정: 합성 응답(가정) 수 */
export const DEMO_RECORD_COUNT = 400

/** 오산시 6개 행정동(화면 표시 순서) */
export const DONGS: Dong[] = ['중앙동', '대원동', '남촌동', '신장동', '세마동', '초평동']

/** 시연용 가정: 동별 응답 가구 비율(합 1). 실제 가구 수 통계가 아닙니다. 팀 확인 필요. */
export const DONG_HOUSEHOLD_WEIGHTS: Record<Dong, number> = {
  중앙동: 0.14,
  대원동: 0.2,
  남촌동: 0.14,
  신장동: 0.2,
  세마동: 0.22,
  초평동: 0.1,
}

/**
 * 시연용 가정: 동 인접 관계(대칭). 보호자는 같은 동 또는 여기 적힌 인접 동의 장소까지 갈 수 있다고 봅니다.
 * 남북으로 긴 시 모양을 2열 × 3행 격자로 단순화했습니다.
 *   서쪽 열(북→남): 세마동 · 신장동 · 남촌동 / 동쪽 열(북→남): 대원동 · 중앙동 · 초평동
 * 실제 지도와 맞는지 팀이 확인해야 합니다.
 */
export const DONG_ADJACENCY: Record<Dong, Dong[]> = {
  중앙동: ['대원동', '신장동', '초평동'],
  대원동: ['세마동', '중앙동'],
  남촌동: ['신장동', '초평동'],
  신장동: ['세마동', '중앙동', '남촌동'],
  세마동: ['대원동', '신장동'],
  초평동: ['중앙동', '남촌동'],
}

/** 시연용 가정: 시간대 경계(시). 오전 06~12시, 오후 12~18시, 저녁 18~22시. 팀 확인 필요. */
export const DAY_PART_HOURS: Record<DayPart, [number, number]> = {
  morning: [6, 12],
  afternoon: [12, 18],
  evening: [18, 22],
}

/**
 * 시연용 가정: 보호자 시간 범위가 한 칸과 이만큼(분) 이상 겹쳐야 그 칸을 가능으로 셉니다.
 * 모든 범위에 같은 기준을 써서, 범위를 넓혔는데 칸이 줄어드는 일이 없습니다.
 * 06~22시 안의 60분 이상 범위는 항상 1칸 이상이 됩니다(두 칸에 걸쳐도 한쪽은 30분 이상 겹침).
 */
export const MIN_SLOT_OVERLAP_MINUTES = 30

/**
 * 시연용 가정: 칸별 인기 가중치(상대값). 맞벌이 가정을 가정해 평일 저녁과 토요일 오전·오후를 높게,
 * 평일 오전은 낮게 둡니다. 수요일 오후는 이른 하교를 가정해 조금 높입니다.
 */
export const SLOT_WEIGHTS: Record<Weekday, Record<DayPart, number>> = {
  mon: { morning: 1, afternoon: 3, evening: 7 },
  tue: { morning: 1, afternoon: 3, evening: 8 },
  wed: { morning: 1, afternoon: 4, evening: 8 },
  thu: { morning: 1, afternoon: 3, evening: 7 },
  fri: { morning: 1, afternoon: 3, evening: 5 },
  sat: { morning: 9, afternoon: 8, evening: 3 },
  sun: { morning: 2, afternoon: 5, evening: 2 },
}

/** 시연용 가정: 한 가정이 고르는 가능 칸 수(1~5칸)의 분포 */
export const SLOTS_PER_HOUSEHOLD_WEIGHTS: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0.22, 2: 0.3, 3: 0.25, 4: 0.15, 5: 0.08 }

/** 시연용 가정: 화면 언어 비율 */
export const SCREEN_LANGUAGE_WEIGHTS: Record<ScreenLanguage, number> = { 'ko-easy': 0.45, vi: 0.3, zh: 0.25 }

/** 시연용 가정: 자녀 한국어 수준(선택 항목)에 답하는 비율 */
export const KOREAN_LEVEL_RESPONSE_RATE = 0.7

/** 시연용 가정: 한국어 수준에 답한 가정 안에서의 분포 */
export const KOREAN_LEVEL_WEIGHTS: Record<KoreanLevel, number> = { beginner: 0.3, intermediate: 0.45, fluent: 0.25 }

/** 시연용 가정: 자녀 학년 분포 */
export const GRADE_WEIGHTS: Record<Grade, number> = { 1: 0.19, 2: 0.18, 3: 0.18, 4: 0.16, 5: 0.15, 6: 0.14 }

/** 시연용 가정: 관심 분야별 선택 확률(분야마다 따로 뽑음). 넷 다 안 뽑히면 관심 분야를 비워 둔 응답이 됩니다. */
export const INTEREST_PROBABILITIES: Record<Interest, number> = {
  experience_culture: 0.45,
  korean_study: 0.35,
  sports_arts: 0.4,
  career: 0.2,
}

/** 개인정보 보호: 이 수보다 작은 1 이상 집계는 숫자 대신 "5 미만"으로 가립니다. */
export const SUPPRESSION_THRESHOLD = 5

/** 추천: 비교할 조합 수가 이 값 이하이면 전부 따지는 정확 탐색, 넘으면 탐욕 알고리즘으로 대체합니다. */
export const EXACT_SEARCH_COMBO_LIMIT = 2_000_000

/** 시연용 가정: 반에 닿는 가정 중 실제로 신청할 것으로 보는 비율(반별 예상 인원 계산용, 가정당 아동 1명) */
export const ENROLLMENT_RATE = 0.4

/** 시연용 가정: 참여 가정 중 한국어 초급 비율이 이 값 이상이면 보조교사를 제안합니다. */
export const BEGINNER_SHARE_FOR_ASSISTANT = 0.3

/** 시연용 가정: 참여 가정 중 유창 비율이 이 값 이상이면 심화 활동을 제안합니다. */
export const FLUENT_SHARE_FOR_ADVANCED = 0.4

/** 시연용 가정: 한국어 수준 응답률이 이 값보다 낮으면 신청 단계에서 다시 확인하라고 안내합니다. */
export const LOW_KOREAN_LEVEL_RESPONSE = 0.6

/** 반당 정원 입력 범위(명). 5명 미만 반은 예상 인원 표시(5명 미만은 가림)와 맞지 않아 받지 않습니다. */
export const MIN_CAPACITY = 5
export const MAX_CAPACITY = 100

/**
 * 시연 기본 입력: 일정·장소 추천 화면을 처음 열 때의 프로그램 조건.
 * 기존 계획은 "가장 붐비는 토요일 오전에 반을 모두 여는" 관행을 가정한 반 3개이며, 추천과 같은 반 수만큼 앞에서부터 씁니다.
 */
export const DEFAULT_PLAN: Omit<ProgramPlan, 'venueIds'> = {
  interest: 'experience_culture',
  gradeRange: [1, 6],
  classCount: 3,
  capacity: 15,
  baseline: [
    { slot: 'sat-morning', venueId: 'v-jungang-library' },
    { slot: 'sat-morning', venueId: 'v-sema-culture' },
    { slot: 'sat-morning', venueId: 'v-namchon-library' },
  ],
}
