import {
  BEGINNER_SHARE_FOR_ASSISTANT, DONGS, DONG_ADJACENCY, ENROLLMENT_RATE, EXACT_SEARCH_COMBO_LIMIT, FLUENT_SHARE_FOR_ADVANCED,
  LOW_KOREAN_LEVEL_RESPONSE, SUPPRESSION_THRESHOLD,
} from './assumptions'
import { formatHouseholds, formatPeople, inGradeRange, matchesInterest, roundPeople, suppress, suppressPartition } from './aggregate'
import { KOREAN_LEVELS, LANGUAGES, LANGUAGE_LABELS, percent } from './labels'
import { SLOTS, SLOT_INDEX, slotLabel, slotLongLabel } from './slots'
import type {
  BaselineClass, BaselineResult, ClassResult, DemandResponse, Dong, KoreanLevel, ProgramOption, ProgramPlan, Recommendation,
  RecommendResult, SafeCount, ScreenLanguage, SearchMethod, SlotKey, Venue,
} from './types'

export interface RecommendOptions {
  adjacency?: Record<Dong, Dong[]>
  /** 정확 탐색을 허용하는 최대 조합 수 */
  comboLimit?: number
  /** 추천 카드 수 */
  topN?: number
}

/** 같은 칸·같은 동의 선택지 묶음. 닿는 가정이 똑같으므로 한 번만 따집니다. */
interface OptionGroup {
  slot: SlotKey
  dong: Dong
  venues: Venue[]
  bits: Uint32Array
  reach: number
}

interface Combo { picks: number[]; covered: number; set: Uint32Array }

export function popcount32(value: number): number {
  let x = value - ((value >>> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24
}

const countBits = (bits: Uint32Array): number => { let total = 0; for (let w = 0; w < bits.length; w++) total += popcount32(bits[w]); return total }
const hasBit = (bits: Uint32Array, index: number): boolean => (bits[index >>> 5] & (1 << (index & 31))) !== 0
const sameBits = (a: Uint32Array, b: Uint32Array): boolean => a.every((word, w) => word === b[w])

/** n개 중 k개를 고르는 조합 수 */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i
  return Math.round(result)
}

/** 가정이 갈 수 있는 동: 같은 동 + 인접 동 */
export const reachableDongs = (dong: Dong, adjacency: Record<Dong, Dong[]> = DONG_ADJACENCY): Set<Dong> => new Set([dong, ...adjacency[dong]])

/** 대상 수요: 학년이 범위 안이고, 분야를 정했다면 관심 분야에 그 분야가 있거나 관심 분야를 비워 둔 응답 */
export const selectEligible = (responses: DemandResponse[], plan: Pick<ProgramPlan, 'interest' | 'gradeRange'>): DemandResponse[] =>
  responses.filter((response) => inGradeRange(response, plan.gradeRange) && matchesInterest(response, plan.interest))

/** 칸·동 하나에 닿는 가정 비트셋 */
function reachBits(households: DemandResponse[], ranges: Set<Dong>[], slot: SlotKey, dong: Dong): Uint32Array {
  const bits = new Uint32Array(Math.ceil(households.length / 32))
  households.forEach((household, index) => {
    if (household.available_slots.includes(slot) && ranges[index].has(dong)) bits[index >>> 5] |= 1 << (index & 31)
  })
  return bits
}

/**
 * 정확 탐색: k개 묶음 조합을 모두 따져 닿는 가정 집합이 서로 다른 상위 topN개를 냅니다. 동점이면 먼저 나온(사전순) 조합이 앞섭니다.
 * accept를 주면 그 조건을 만족하는 조합만 남깁니다.
 */
function exactTop(bits: Uint32Array[], k: number, topN: number, accept?: (picks: number[]) => boolean): Combo[] {
  const n = bits.length
  const words = bits[0]?.length ?? 0
  const top: Combo[] = []
  const prefix = Array.from({ length: k }, () => new Uint32Array(words))
  const picks: number[] = new Array(k)
  const visit = (start: number, depth: number) => {
    const base = prefix[depth]
    if (depth === k - 1) {
      for (let i = start; i < n; i++) {
        const candidate = bits[i]
        let covered = 0
        for (let w = 0; w < words; w++) covered += popcount32(base[w] | candidate[w])
        if (top.length === topN && covered <= top[topN - 1].covered) continue
        picks[depth] = i
        if (accept && !accept(picks)) continue
        const set = new Uint32Array(words)
        for (let w = 0; w < words; w++) set[w] = base[w] | candidate[w]
        if (top.some((entry) => entry.covered === covered && sameBits(entry.set, set))) continue
        const position = top.findIndex((entry) => entry.covered < covered)
        top.splice(position === -1 ? top.length : position, 0, { picks: picks.slice(), covered, set })
        if (top.length > topN) top.pop()
      }
      return
    }
    const next = prefix[depth + 1]
    for (let i = start; i <= n - (k - depth); i++) {
      const candidate = bits[i]
      for (let w = 0; w < words; w++) next[w] = base[w] | candidate[w]
      picks[depth] = i
      visit(i + 1, depth + 1)
    }
  }
  if (k > 0 && n >= k) visit(0, 0)
  return top
}

/**
 * 정확 탐색 후보 전체: 반 수만큼 서로 다른 묶음을 고르는 조합에 더해, 더 적은 묶음을 고르고 남는 반을 같은 묶음의 다른 장소나
 * 닿는 가정이 없는 선택지로 채울 수 있는 조합(fits)도 따집니다. 크기별 상위 topN을 모아 닿는 가정 집합이 같은 것은 한 번만 남기고,
 * 커버리지가 같으면 묶음이 많은(시간·장소가 더 다양한) 조합이 앞섭니다.
 */
function exactCandidates(bits: Uint32Array[], k: number, topN: number, fits: (picks: number[]) => boolean): Combo[] {
  const merged: Combo[] = []
  for (let size = k; size >= 1; size--) {
    for (const combo of exactTop(bits, size, topN, fits)) {
      if (!merged.some((entry) => entry.covered === combo.covered && sameBits(entry.set, combo.set))) merged.push(combo)
    }
  }
  return merged.sort((a, b) => b.covered - a.covered).slice(0, topN)
}

/** 탐욕 알고리즘: 매번 새로 더하는 가정이 가장 많은 묶음을 고릅니다(동점이면 앞 번호). first를 주면 첫 반을 고정합니다. */
function greedy(bits: Uint32Array[], k: number, first?: number): Combo {
  const words = bits[0]?.length ?? 0
  const set = new Uint32Array(words)
  const picks: number[] = []
  const add = (index: number) => { picks.push(index); for (let w = 0; w < words; w++) set[w] |= bits[index][w] }
  if (first !== undefined) add(first)
  while (picks.length < k) {
    let best = -1
    let bestGain = -1
    for (let i = 0; i < bits.length; i++) {
      if (picks.includes(i)) continue
      let gain = 0
      for (let w = 0; w < words; w++) gain += popcount32(bits[i][w] & ~set[w])
      if (gain > bestGain) { best = i; bestGain = gain }
    }
    if (best === -1) break
    add(best)
  }
  return { picks, covered: countBits(set), set }
}

/** 탐욕 대체 경로의 상위 후보: 첫 반을 바꿔 가며 탐욕으로 채우고, 닿는 집합이 다른 것만 남깁니다. */
function greedyTop(bits: Uint32Array[], k: number, topN: number): Combo[] {
  const results: Combo[] = []
  for (let first = 0; first < bits.length; first++) {
    const combo = greedy(bits, k, first)
    if (!results.some((entry) => entry.covered === combo.covered && sameBits(entry.set, combo.set))) results.push(combo)
  }
  return results.sort((a, b) => b.covered - a.covered).slice(0, topN)
}

const josa = (word: string, withBatchim: string, without: string): string => {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return withBatchim
  return code % 28 === 0 ? without : withBatchim
}
const iGa = (word: string) => `${word}${josa(word, '이', '가')}`
/** 으로/로: 받침이 없거나 ㄹ 받침이면 '로' */
const euro = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return `${word}${code >= 0 && code <= 11171 && code % 28 !== 0 && code % 28 !== 8 ? '으로' : '로'}`
}

/** 참여 가정의 분포. 닿는 가정 합계가 카드에 보이므로 합계에서 빼서 가린 칸을 알아내지 못하도록 보조 억제를 거칩니다. */
function breakdown<K extends string>(keys: K[], covered: DemandResponse[], pick: (response: DemandResponse) => K, total: SafeCount): Record<K, SafeCount> {
  const raw = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>
  for (const response of covered) raw[pick(response)] += 1
  return suppressPartition(keys, raw, { totalShown: !total.suppressed })
}

/** "38가정" 또는 "5가정 미만". 보조 억제로 가린 칸은 수를 말하지 않습니다. */
const householdsNote = (count: SafeCount): string => (count.suppressed && count.masked ? '(가정 수는 가림)' : ` ${formatHouseholds(count)}`)

/** 통역·번역 준비 제안. 화면에 보이는(억제를 거친) 숫자만 씁니다. */
function languageSuggestions(safe: Record<ScreenLanguage, SafeCount>): string[] {
  const suggestions: string[] = []
  for (const language of ['vi', 'zh'] as ScreenLanguage[]) {
    const count = safe[language]
    if (!count.suppressed && count.value === 0) continue
    suggestions.push(count.suppressed && !count.masked
      ? `${LANGUAGE_LABELS[language]} 안내 필요${householdsNote(count)}: 번역 안내문과 통역 연락처를 준비해 두세요.`
      : `${LANGUAGE_LABELS[language]} 안내 필요${householdsNote(count)}: 모집 안내문·공지를 번역하고 첫 수업에 통역을 두세요.`)
  }
  const easy = safe['ko-easy']
  if (easy.suppressed || easy.value > 0) suggestions.push(`쉬운 한국어 안내${householdsNote(easy)}: 어려운 한자어를 줄인 짧은 안내문을 쓰세요.`)
  return suggestions
}

/**
 * 수업 난이도·보조교사 제안. 화면에 보이는(억제를 거친) 숫자만 써서 계산하므로, 비율(%)이나 문장 선택으로 가린 칸이 드러나지 않습니다.
 * 응답 수는 "닿는 가정 − 미응답"으로 화면에서 계산되는 값일 때만 씁니다.
 */
function teachingSuggestions(levels: Record<KoreanLevel | 'none', SafeCount>, covered: SafeCount): string[] {
  const none = levels.none
  if (covered.suppressed) return ['참여 가정이 적어 수업 난이도는 신청 단계에서 확인해 주세요.']
  if (none.suppressed) return ['한국어 수준 미응답 수를 가려 비율은 표시하지 않아요. 수업 난이도는 신청 단계에서 확인해 주세요.']
  const answered = covered.value - none.value
  if (answered < SUPPRESSION_THRESHOLD) return ['한국어 수준에 답한 가정이 적어 수업 난이도는 신청 단계에서 확인해 주세요.']
  const shown = (level: KoreanLevel): number | null => { const count = levels[level]; return count.suppressed ? null : count.value }
  const beginner = shown('beginner')
  const fluent = shown('fluent')
  const suggestions: string[] = []
  if (beginner !== null && beginner / answered >= BEGINNER_SHARE_FOR_ASSISTANT) suggestions.push(`한국어 수준 응답 중 초급이 ${percent(beginner, answered)}%예요. 보조교사를 두고 그림·시연 중심으로 진행하길 권해요.`)
  if (fluent !== null && fluent / answered >= FLUENT_SHARE_FOR_ADVANCED) suggestions.push(`유창 응답이 ${percent(fluent, answered)}%라 수준별 모둠이나 심화 활동을 함께 준비하면 좋아요.`)
  if (!suggestions.length) {
    suggestions.push(beginner === null || fluent === null
      ? '일부 수준은 가정 수가 적어 가렸어요. 수업 난이도는 신청 단계에서 한 번 더 확인해 주세요.'
      : '중급 응답이 중심이라 일반 진행에 쉬운 설명 자료를 곁들이면 충분해 보여요.')
  }
  if (answered / covered.value < LOW_KOREAN_LEVEL_RESPONSE) suggestions.push(`한국어 수준 미응답이 ${percent(none.value, covered.value)}%예요. 신청서에서 한 번 더 물어보세요.`)
  return suggestions
}

/** 왜 이 조합인지 규칙으로 만든 한두 문장(외부 LLM 호출 없음) */
function explain(classes: ClassResult[], rank: number, best: Recommendation | undefined, covered: number, eligible: number, gainedDongs: Dong[]): string {
  const [first, ...rest] = classes
  const place = (item: ClassResult) => `${slotLongLabel(item.option.slot)} ${item.venue.name}`
  const gained = rest.reduce((sum, item) => sum + item.marginal, 0)
  const restSlots = [...new Set(rest.filter((item) => item.marginal > 0).map((item) => slotLabel(item.option.slot)))]
  const restNames = rest.map((_, at) => `${at + 2}`).join('·')
  const reachText = suppress(first.reach).suppressed ? formatHouseholds(suppress(first.reach)) : `대상 가정의 ${percent(first.reach, eligible)}%인 ${formatHouseholds(suppress(first.reach))}`
  const dongText = gainedDongs.length ? `${gainedDongs.join('·')} 가정 등 ` : ''
  // 더 모은 수는 "닿는 가정 − 1반"이라 카드의 두 숫자로 계산되므로, 1~4이면 가린 척하는 "5가정 미만" 대신 숫자 없이 씁니다.
  const gainedText = suppress(gained).suppressed ? '가정을 조금' : `${dongText}${formatHouseholds(suppress(gained))}을`
  const combine = rest.length === 0
    ? `${rank === 1 ? `${iGa(place(first))} 보호자들의 가능 시간과 이동 범위에 가장 많이 겹쳐, ` : ''}반 하나로 ${reachText}에 닿아요.`
    : gained > 0
      ? `1반 ${iGa(place(first))} ${reachText}에 닿고, ${restNames}반은 ${euro(restSlots.join('·'))} 시간이나 장소를 달리해 1반이 닿지 못한 ${gainedText} 더 모아요.`
      : `1반 ${iGa(place(first))} ${reachText}에 닿고, ${restNames}반은 새 가정을 더하지 못해 인원을 나누는 역할만 해요.`
  if (rank === 1 || !best) return combine
  const bestKeys = new Set(best.options.map((option) => `${option.slot}|${option.venueId}`))
  const different = classes.filter((item) => !bestKeys.has(`${item.option.slot}|${item.option.venueId}`)).map(place)
  const diff = best.covered - covered
  const diffText = suppress(best.covered).suppressed || suppress(covered).suppressed ? '1위보다 조금 적게 닿지만' : diff === 0 ? '1위와 같은 수의 가정에 닿으며' : `1위보다 ${diff}가정 적게 닿지만`
  const alternative = different.length ? `${different.join(', ')}${josa(different[different.length - 1], '을', '를')} 쓰는` : '다른 가정 조합에 닿는'
  return `${diffText} ${alternative} 대안이에요. ${combine}`
}

interface PickedClass { option: ProgramOption; venue: Venue; alternatives: Venue[]; bits: Uint32Array }

/** 반 순서: 새로 더하는 가정이 많은 순(동점이면 묶음 번호 순) */
function orderByGain(groupIndexes: number[], groups: OptionGroup[]): number[] {
  const words = groups[0]?.bits.length ?? 0
  const remaining = [...groupIndexes].sort((a, b) => a - b)
  const ordered: number[] = []
  const running = new Uint32Array(words)
  while (remaining.length) {
    let bestAt = 0
    let bestGain = -1
    remaining.forEach((index, at) => {
      let gain = 0
      for (let w = 0; w < words; w++) gain += popcount32(groups[index].bits[w] & ~running[w])
      if (gain > bestGain) { bestAt = at; bestGain = gain }
    })
    const [index] = remaining.splice(bestAt, 1)
    ordered.push(index)
    for (let w = 0; w < words; w++) running[w] |= groups[index].bits[w]
  }
  return ordered
}

function buildRecommendation(
  rank: number, picked: PickedClass[], households: DemandResponse[], plan: ProgramPlan,
  best: Recommendation | undefined, baseline: BaselineResult | undefined,
): Recommendation {
  const words = picked[0]?.bits.length ?? 0
  const union = new Uint32Array(words)
  const marginals = picked.map(({ bits }) => {
    let gain = 0
    for (let w = 0; w < words; w++) { gain += popcount32(bits[w] & ~union[w]); union[w] |= bits[w] }
    return gain
  })
  const coveredHouseholds = households.filter((_, index) => hasBit(union, index))
  // 2반 이후가 새로 더한 가정이 많은 동(5가정 이상인 동만, 많은 순 최대 2개)
  const gainedByDong = new Map<Dong, number>()
  households.forEach((household, index) => {
    if (picked.length > 1 && !hasBit(picked[0].bits, index) && picked.slice(1).some(({ bits }) => hasBit(bits, index))) gainedByDong.set(household.dong, (gainedByDong.get(household.dong) ?? 0) + 1)
  })
  const gainedDongs = [...gainedByDong].filter(([, count]) => count >= SUPPRESSION_THRESHOLD).sort((a, b) => b[1] - a[1] || DONGS.indexOf(a[0]) - DONGS.indexOf(b[0])).slice(0, 2).map(([dong]) => dong)
  const shares = picked.map(() => 0)
  households.forEach((_, index) => {
    const reaching = picked.map(({ bits }, at) => (hasBit(bits, index) ? at : -1)).filter((at) => at >= 0)
    for (const at of reaching) shares[at] += 1 / reaching.length
  })
  const covered = coveredHouseholds.length
  const coveredSafe = suppress(covered)
  // '새로 더함': 1반 값은 '닿는 가정'과 같아 이미 보이므로, 2반 이후가 둘 이상이면 그들끼리 보조 억제를 합니다.
  // 2반 하나뿐이면 "닿는 가정 합계 − 1반"으로 계산되는 값이라 가릴 수 없습니다(README 참고).
  const later = marginals.slice(1)
  const laterKeys = later.map((_, at) => String(at))
  const laterSafe = later.length >= 2
    ? suppressPartition(laterKeys, Object.fromEntries(later.map((value, at) => [String(at), value])), { totalShown: !coveredSafe.suppressed && !suppress(marginals[0]).suppressed, maskZeros: false })
    : Object.fromEntries(later.map((value, at) => [String(at), suppress(value)]))
  const classes: ClassResult[] = picked.map(({ option, venue, alternatives, bits }, at) => {
    const expectedHeadcount = shares[at] * ENROLLMENT_RATE
    return {
      option, venue, alternatives, reach: countBits(bits), marginal: marginals[at], marginalSafe: at === 0 ? suppress(marginals[0]) : laterSafe[String(at - 1)],
      share: shares[at], expectedHeadcount, overCapacity: roundPeople(expectedHeadcount) > plan.capacity,
    }
  })
  const languages = breakdown(LANGUAGES, coveredHouseholds, (response) => response.screen_language, coveredSafe)
  const levels = breakdown<KoreanLevel | 'none'>([...KOREAN_LEVELS, 'none'], coveredHouseholds, (response) => response.korean_level ?? 'none', coveredSafe)
  const warnings: string[] = []
  classes.forEach((item, at) => {
    const name = `${at + 1}반(${slotLabel(item.option.slot)} · ${item.venue.name})`
    if (item.overCapacity) warnings.push(`${name}: 예상 신청 ${formatPeople(item.expectedHeadcount)}으로 정원 ${plan.capacity}명을 넘어요. 같은 시간에 반을 하나 더 열거나 정원을 늘려 보세요.`)
    if (at > 0 && item.marginal === 0) warnings.push(`${name}: 앞선 반이 이미 닿은 가정만 닿아 새로 더하는 가정이 없어요.`)
  })
  const recommendation: Recommendation = {
    rank,
    options: classes.map((item) => item.option),
    classes,
    covered,
    coverageRate: households.length ? covered / households.length : 0,
    languageBreakdown: languages,
    koreanLevelBreakdown: levels,
    languageSuggestions: languageSuggestions(languages),
    teachingSuggestions: teachingSuggestions(levels, coveredSafe),
    warnings,
    explanation: '',
    baselineDelta: baseline ? covered - baseline.covered : undefined,
  }
  recommendation.explanation = explain(classes, rank, best, covered, households.length, gainedDongs)
  return recommendation
}

/**
 * 최대 커버리지 추천(계획서 5절).
 * 선택지 = (칸, 장소). 가정이 선택지에 닿으려면 그 칸이 가정의 가능 칸이고 장소의 동이 가정의 이동 범위(같은 동+인접 동)에 있어야 합니다.
 * k개 선택지(중복 없음)로 적어도 하나에 닿는 가정 수를 최대화합니다. 같은 칸·같은 동의 장소는 닿는 가정이 같으므로 묶어서 따지고,
 * 묶음 조합 수가 한도 이하이면 정확 탐색, 넘으면 탐욕 알고리즘으로 대체합니다.
 * 정확 탐색의 상위 1~3위는 k개 선택지로 만들 수 있는 모든 조합 중 닿는 가정 집합이 서로 다른 상위 3개와 같습니다
 * (같은 시간·같은 동의 다른 장소나 닿는 가정이 없는 선택지로 남는 반을 채우는 조합 포함). 탐욕 대체는 서로 다른 묶음 k개만 따집니다.
 */
export function recommend(responses: DemandResponse[], venues: Venue[], plan: ProgramPlan, settings: RecommendOptions = {}): RecommendResult {
  const adjacency = settings.adjacency ?? DONG_ADJACENCY
  const comboLimit = settings.comboLimit ?? EXACT_SEARCH_COMBO_LIMIT
  const topN = settings.topN ?? 3
  const households = selectEligible(responses, plan)
  const empty: RecommendResult = {
    status: 'insufficient', method: 'exact', eligibleCount: households.length, optionCount: 0, groupCount: 0, comboCount: 0, comboLimit,
    classCount: 0, recommendations: [], bestSingleCovered: 0, notices: [],
  }
  if (households.length < SUPPRESSION_THRESHOLD) return empty
  const ranges = households.map((household) => reachableDongs(household.dong, adjacency))
  const candidates = venues.filter((venue) => plan.venueIds.includes(venue.id))
  const options: { option: ProgramOption; venue: Venue }[] = []
  for (const venue of candidates) {
    for (const slot of SLOTS) if (venue.bookable.includes(slot)) options.push({ option: { slot, venueId: venue.id }, venue })
  }
  const groupMap = new Map<string, OptionGroup>()
  for (const { option, venue } of options) {
    const key = `${option.slot}|${venue.dong}`
    const group = groupMap.get(key)
    if (group) group.venues.push(venue)
    else {
      const bits = reachBits(households, ranges, option.slot, venue.dong)
      groupMap.set(key, { slot: option.slot, dong: venue.dong, venues: [venue], bits, reach: countBits(bits) })
    }
  }
  const allGroups = [...groupMap.values()].sort((a, b) => b.reach - a.reach || SLOT_INDEX[a.slot] - SLOT_INDEX[b.slot] || DONGS.indexOf(a.dong) - DONGS.indexOf(b.dong))
  const groups = allGroups.filter((group) => group.reach > 0)

  let baseline: BaselineResult | undefined
  const baselineClasses: BaselineClass[] = (plan.baseline ?? []).flatMap((option) => {
    const venue = venues.find((item) => item.id === option.venueId)
    return venue ? [{ option, venue, bookable: venue.bookable.includes(option.slot) }] : []
  })
  if (baselineClasses.length) {
    const union = new Uint32Array(Math.ceil(households.length / 32))
    for (const { option, venue } of baselineClasses) reachBits(households, ranges, option.slot, venue.dong).forEach((word, w) => { union[w] |= word })
    const covered = countBits(union)
    baseline = { classes: baselineClasses, covered, coverageRate: covered / households.length }
  }
  const notices: string[] = []
  baselineClasses.forEach(({ option, venue, bookable }, at) => {
    if (!bookable) notices.push(`기존 계획 ${at + 1}반의 ${venue.name}${josa(venue.name, '은', '는')} ${slotLongLabel(option.slot)}에 대관 가능으로 등록되어 있지 않아 비교용으로만 계산했어요.`)
  })
  const base = { ...empty, status: 'ok' as const, optionCount: options.length, groupCount: groups.length, baseline, bestSingleCovered: groups[0]?.reach ?? 0, notices }
  if (!options.length) return { ...base, status: 'no_options' }
  if (!groups.length) return { ...base, status: 'no_reach' }

  const requested = Math.max(1, Math.floor(plan.classCount))
  const classCount = Math.min(requested, options.length)
  const searchK = Math.min(classCount, groups.length)
  if (classCount < requested) notices.push(`고른 장소의 대관 가능 선택지가 ${options.length}개뿐이라 ${classCount}개 반만 추천해요.`)
  if (searchK < classCount) notices.push(`대상 가정에 닿는 시간·동네 묶음이 ${groups.length}개뿐이에요. 나머지 반은 같은 시간대의 다른 장소로 채워 인원을 나눠요.`)
  // 묶음을 반 수보다 적게 고르는 조합은 남는 반을 고른 묶음의 다른 장소나 닿는 가정이 없는 선택지로 채울 수 있을 때만 따집니다.
  const zeroReachOptions = allGroups.filter((group) => group.reach === 0).reduce((sum, group) => sum + group.venues.length, 0)
  const fits = (picks: number[]) => picks.length >= classCount || picks.reduce((sum, index) => sum + groups[index].venues.length - 1, zeroReachOptions) >= classCount - picks.length
  let comboCount = 0
  for (let size = 1; size <= searchK; size++) comboCount += choose(groups.length, size)
  const method: SearchMethod = comboCount <= comboLimit ? 'exact' : 'greedy'
  const bits = groups.map((group) => group.bits)
  const combos = method === 'exact' ? exactCandidates(bits, searchK, topN, fits) : greedyTop(bits, searchK, topN)
  if (method === 'greedy') notices.push(`비교할 조합이 ${comboCount.toLocaleString('ko-KR')}개로 많아 탐욕 알고리즘으로 찾았어요. 최적의 약 63% 이상을 보장하지만 최적이 아닐 수 있어요.`)

  const recommendations: Recommendation[] = []
  combos.forEach((combo, at) => {
    const ordered = orderByGain(combo.picks, groups)
    const padding: PickedClass[] = []
    if (combo.picks.length < classCount) {
      // 묶음보다 반이 많을 때 남는 반: 고른 묶음의 다른 장소(인원 나누기)부터, 그다음 닿는 가정이 없는 선택지로 채웁니다.
      const extras = [
        ...ordered.flatMap((index) => groups[index].venues.slice(1).map((venue) => ({ group: groups[index], venue }))),
        ...allGroups.filter((group) => group.reach === 0).flatMap((group) => group.venues.map((venue) => ({ group, venue }))),
      ]
      for (const { group, venue } of extras.slice(0, classCount - combo.picks.length)) padding.push({ option: { slot: group.slot, venueId: venue.id }, venue, alternatives: [], bits: group.bits })
    }
    const isPadded = (slot: SlotKey, venue: Venue) => padding.some((item) => item.option.slot === slot && item.venue.id === venue.id)
    const picked: PickedClass[] = [
      ...ordered.map((index) => {
        const { slot, venues: groupVenues, bits: groupBits } = groups[index]
        return { option: { slot, venueId: groupVenues[0].id }, venue: groupVenues[0], alternatives: groupVenues.slice(1).filter((venue) => !isPadded(slot, venue)), bits: groupBits }
      }),
      ...padding,
    ]
    recommendations.push(buildRecommendation(at + 1, picked, households, plan, recommendations[0], baseline))
  })
  return { ...base, method, comboCount, classCount, recommendations }
}
