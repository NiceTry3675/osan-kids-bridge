import { DONGS, SUPPRESSION_THRESHOLD } from './assumptions'
import { KOREAN_LEVELS, LANGUAGES } from './labels'
import { SLOTS } from './slots'
import type { DemandResponse, Dong, Grade, Interest, KoreanLevel, SafeCount, ScreenLanguage, SlotKey } from './types'

export interface DemandFilters {
  /** 비어 있으면 6개 동 전체 */
  dongs: Dong[]
  gradeRange: [Grade, Grade]
  interest: Interest | 'all'
  language: ScreenLanguage | 'all'
}

export const defaultFilters = (): DemandFilters => ({ dongs: [], gradeRange: [1, 6], interest: 'all', language: 'all' })

/** 소수 셀 억제: 1~4는 값을 감추고, 0과 5 이상은 그대로 둡니다. */
export const suppress = (value: number): SafeCount =>
  value >= 1 && value < SUPPRESSION_THRESHOLD ? { suppressed: true } : { suppressed: false, value }

export interface PartitionOptions {
  /** 합계가 화면에 그대로 보이는지. 합계가 가려져 있으면 빼서 알아낼 수 없으므로 보조 억제를 하지 않습니다. */
  totalShown?: boolean
  /** 함께 가릴 0이 아닌 칸이 없을 때 0인 칸을 가릴지. 0이 다른 곳(경고 문구 등)에 드러나는 값이면 false로 둡니다. */
  maskZeros?: boolean
}

/**
 * 합계와 함께 보이는 분포(동별·화면 언어·한국어 수준 등)의 소수 셀 억제.
 * 1~4인 칸을 가린 뒤, 합계에서 보이는 칸을 빼면 가린 칸의 값이 하나로 정해지면(가린 칸이 하나뿐이거나, 모두 1이거나 모두 4)
 * 보이는 칸 중 0이 아닌 가장 작은 값의 칸(같은 값이면 모두)을 함께 가리고, 가린 칸을 모두 "가림"으로 표시합니다(보조 억제).
 * 어느 칸이 1~4였는지 드러나지 않도록 같은 표시를 쓰고, 함께 가릴 칸을 값으로만 고르므로 가린 칸끼리 값을 바꿔도 화면이 똑같습니다.
 * 합계가 칸 수 × 4 또는 칸 수와 같으면 모든 칸이 4(또는 1)일 수 있어 무엇을 가려도 역산되므로, 값과 상관없이 분포 전체를 가립니다.
 */
export function suppressPartition<K extends string>(keys: readonly K[], raw: Record<K, number>, { totalShown = true, maskZeros = true }: PartitionOptions = {}): Record<K, SafeCount> {
  const total = keys.reduce((sum, key) => sum + raw[key], 0)
  if (totalShown && keys.length > 1 && (total === keys.length || total === keys.length * (SUPPRESSION_THRESHOLD - 1))) {
    return Object.fromEntries(keys.map((key) => [key, { suppressed: true, masked: true }])) as Record<K, SafeCount>
  }
  const safe = Object.fromEntries(keys.map((key) => [key, suppress(raw[key])])) as Record<K, SafeCount>
  const hidden = keys.filter((key) => safe[key].suppressed)
  const hiddenSum = hidden.reduce((sum, key) => sum + raw[key], 0)
  const pinned = hidden.length === 1 || hiddenSum === hidden.length || hiddenSum === hidden.length * (SUPPRESSION_THRESHOLD - 1)
  if (!totalShown || !hidden.length || !pinned) return safe
  const visible = keys.filter((key) => !safe[key].suppressed && raw[key] > 0)
  const smallest = Math.min(...visible.map((key) => raw[key]))
  const extra = visible.length ? visible.filter((key) => raw[key] === smallest) : maskZeros ? keys.filter((key) => raw[key] === 0) : []
  if (!extra.length) return safe
  for (const key of [...hidden, ...extra]) safe[key] = { suppressed: true, masked: true }
  return safe
}

export const MASKED_LABEL = '가림'
/** "가림" 설명 문구 */
export const MASKED_NOTE = '가림: 개인 식별 방지를 위해 비공개'

/** 히트맵 칸 등 짧은 표시: "132", "5 미만" 또는 "가림" */
export const formatCount = (count: SafeCount): string =>
  count.suppressed ? (count.masked ? MASKED_LABEL : `${SUPPRESSION_THRESHOLD} 미만`) : count.value.toLocaleString('ko-KR')

/** 문장 속 표시: "132가정", "5가정 미만" 또는 "가림" */
export const formatHouseholds = (count: SafeCount): string =>
  count.suppressed ? (count.masked ? MASKED_LABEL : `${SUPPRESSION_THRESHOLD}가정 미만`) : `${count.value.toLocaleString('ko-KR')}가정`

/**
 * 반별 예상 신청 인원(모형으로 낸 소수) 표시: "약 16명", 1~4명이면 "5명 미만", 닿는 가정이 없으면 "0명".
 * 정원 초과 판단도 이 반올림 값으로 해서 표와 경고 문구가 어긋나지 않게 합니다.
 */
export const roundPeople = (value: number): number => Math.round(value)
export const formatPeople = (value: number): string => {
  if (value <= 0) return '0명'
  const rounded = roundPeople(value)
  return rounded < SUPPRESSION_THRESHOLD ? `${SUPPRESSION_THRESHOLD}명 미만` : `약 ${rounded.toLocaleString('ko-KR')}명`
}

/** 억제되지 않은 경우에만 비율(%)을 돌려줍니다. */
export const safePercent = (count: SafeCount, whole: number): number | null =>
  count.suppressed || whole <= 0 ? null : Math.round((count.value / whole) * 100)

/** 분야를 정했다면 관심 분야에 그 분야가 있거나 관심 분야를 비워 둔 응답만 남깁니다(추천의 대상 수요와 같은 규칙). */
export const matchesInterest = (response: DemandResponse, interest: Interest | 'all'): boolean =>
  interest === 'all' || response.interests.length === 0 || response.interests.includes(interest)

export const inGradeRange = (response: DemandResponse, [min, max]: [Grade, Grade]): boolean =>
  response.child_grade >= Math.min(min, max) && response.child_grade <= Math.max(min, max)

export function filterResponses(responses: DemandResponse[], filters: DemandFilters): DemandResponse[] {
  return responses.filter((response) =>
    (filters.dongs.length === 0 || filters.dongs.includes(response.dong))
    && inGradeRange(response, filters.gradeRange)
    && matchesInterest(response, filters.interest)
    && (filters.language === 'all' || response.screen_language === filters.language))
}

/** 칸별 가능 가정 수(한 가정이 여러 칸을 고를 수 있어 합계는 가정 수보다 큽니다) */
export function countSlots(responses: DemandResponse[]): Record<SlotKey, number> {
  const counts = Object.fromEntries(SLOTS.map((slot) => [slot, 0])) as Record<SlotKey, number>
  for (const response of responses) for (const slot of new Set(response.available_slots)) counts[slot] += 1
  return counts
}

export const suppressSlots = (counts: Record<SlotKey, number>): Record<SlotKey, SafeCount> =>
  Object.fromEntries(SLOTS.map((slot) => [slot, suppress(counts[slot])])) as Record<SlotKey, SafeCount>

export interface DemandAggregate {
  status: 'ok'
  total: number
  slots: Record<SlotKey, SafeCount>
  /** 히트맵 색 단계 계산용: 억제되지 않은 칸 중 최댓값 */
  maxSlotValue: number
  topSlots: { slot: SlotKey; count: SafeCount }[]
  dongs: { dong: Dong; count: SafeCount }[]
  languages: { language: ScreenLanguage; count: SafeCount }[]
  koreanLevels: { level: KoreanLevel | 'none'; count: SafeCount }[]
  /** 가정당 가능 칸 수 평균. 화면에 보이는 히트맵 숫자로만 계산하고, 가린 칸(1~4)은 2.5로 어림합니다. */
  averageSlots: number
  /** averageSlots에 가린 칸 어림이 들어갔는지 */
  averageSlotsEstimated: boolean
  /** 한국어 수준 응답률. 미응답 칸이 가려져 있으면 비율로 역산되지 않도록 null */
  koreanLevelResponseRate: number | null
}

/** 대상이 5가정 미만이면 숫자를 하나도 내보내지 않습니다. */
export type DemandSummary = { status: 'insufficient' } | DemandAggregate

/**
 * 필터를 거친 응답을 집계합니다. 화면의 비율·평균은 모두 억제를 거친 숫자로만 계산해, 숫자끼리 맞춰 보아도 가린 칸이 드러나지 않게 합니다.
 * scope에 필터를 주면 필터로 제외된 동·화면 언어는 구조적으로 0이므로 보조 억제 대상에서 뺍니다.
 */
export function summarize(responses: DemandResponse[], scope: Pick<DemandFilters, 'dongs' | 'language'> = { dongs: [], language: 'all' }): DemandSummary {
  const total = responses.length
  if (total < SUPPRESSION_THRESHOLD) return { status: 'insufficient' }
  const slotCounts = countSlots(responses)
  const slots = suppressSlots(slotCounts)
  const visible = SLOTS.filter((slot) => !slots[slot].suppressed)
  const partition = <K extends string>(keys: readonly K[], inScope: readonly K[], pick: (response: DemandResponse) => K) => {
    const raw = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>
    for (const response of responses) raw[pick(response)] += 1
    const safe = suppressPartition(inScope, raw)
    return keys.map((key) => [key, safe[key] ?? suppress(raw[key])] as const)
  }
  const dongs = partition(DONGS, scope.dongs.length ? DONGS.filter((dong) => scope.dongs.includes(dong)) : DONGS, (response) => response.dong)
  const languages = partition(LANGUAGES, scope.language === 'all' ? LANGUAGES : [scope.language], (response) => response.screen_language)
  const levelKeys: (KoreanLevel | 'none')[] = [...KOREAN_LEVELS, 'none']
  const koreanLevels = partition(levelKeys, levelKeys, (response) => response.korean_level ?? 'none')
  const none = koreanLevels[levelKeys.length - 1][1]
  const hiddenSlots = SLOTS.length - visible.length
  return {
    status: 'ok',
    total,
    slots,
    maxSlotValue: Math.max(0, ...visible.map((slot) => slotCounts[slot])),
    topSlots: [...visible].sort((a, b) => slotCounts[b] - slotCounts[a]).slice(0, 3).filter((slot) => slotCounts[slot] > 0).map((slot) => ({ slot, count: slots[slot] })),
    dongs: dongs.map(([dong, count]) => ({ dong, count })),
    languages: languages.map(([language, count]) => ({ language, count })),
    koreanLevels: koreanLevels.map(([level, count]) => ({ level, count })),
    averageSlots: (visible.reduce((sum, slot) => sum + slotCounts[slot], 0) + hiddenSlots * (SUPPRESSION_THRESHOLD / 2)) / total,
    averageSlotsEstimated: hiddenSlots > 0,
    koreanLevelResponseRate: none.suppressed ? null : (total - none.value) / total,
  }
}

export const HEAT_LEVELS = 5

/** 억제 기준(5)부터 최댓값까지를 5단계로 나눈 색 단계(1~5). 0은 0단계입니다. */
export function heatLevel(value: number, max: number): number {
  if (value <= 0 || max < SUPPRESSION_THRESHOLD) return 0
  const span = max - SUPPRESSION_THRESHOLD + 1
  return Math.min(HEAT_LEVELS, Math.max(1, 1 + Math.floor(((value - SUPPRESSION_THRESHOLD) * HEAT_LEVELS) / span)))
}

/** 범례용 단계별 범위. 값이 들어갈 수 없는 단계는 뺍니다. */
export function heatLegend(max: number): { level: number; from: number; to: number }[] {
  if (max < SUPPRESSION_THRESHOLD) return []
  const span = max - SUPPRESSION_THRESHOLD + 1
  return Array.from({ length: HEAT_LEVELS }, (_, index) => ({
    level: index + 1,
    from: SUPPRESSION_THRESHOLD + Math.ceil((index * span) / HEAT_LEVELS),
    to: SUPPRESSION_THRESHOLD + Math.ceil(((index + 1) * span) / HEAT_LEVELS) - 1,
  })).filter(({ from, to }) => from <= to)
}
