import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN, DONGS, DONG_ADJACENCY, ENROLLMENT_RATE, MIN_CAPACITY } from './data/assumptions'
import { DEMO_RESPONSES, mulberry32 } from './data/generate'
import { VENUES } from './data/venues'
import { roundPeople, suppress } from './lib/aggregate'
import { GRADES, INTERESTS, KOREAN_LEVELS, LANGUAGES } from './lib/labels'
import { SLOTS } from './lib/slots'
import { choose, popcount32, recommend } from './lib/recommend'
import { recoverableCells, subtractableCells } from './testing/disclosure'
import type { DemandResponse, Dong, Grade, Interest, KoreanLevel, ProgramPlan, RecommendResult, SlotKey, Venue } from './types'

// ── 독립 무차별 대입 기준값: 비트셋·묶음 없이 정의 그대로 계산 ──────────────────────────
interface RawOption { slot: SlotKey; venue: Venue }

const eligibleOf = (responses: DemandResponse[], plan: ProgramPlan) => responses.filter((response) => {
  const [low, high] = [Math.min(...plan.gradeRange), Math.max(...plan.gradeRange)]
  if (response.child_grade < low || response.child_grade > high) return false
  return plan.interest === 'all' || response.interests.length === 0 || response.interests.includes(plan.interest)
})
const reaches = (response: DemandResponse, option: RawOption) =>
  response.available_slots.includes(option.slot) && (option.venue.dong === response.dong || DONG_ADJACENCY[response.dong].includes(option.venue.dong))
const coveredBy = (households: DemandResponse[], options: RawOption[]) => households.filter((response) => options.some((option) => reaches(response, option)))
const rawOptions = (venues: Venue[], plan: ProgramPlan): RawOption[] =>
  venues.filter((venue) => plan.venueIds.includes(venue.id)).flatMap((venue) => venue.bookable.map((slot) => ({ slot, venue })))

function* subsets<T>(items: T[], k: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === k) { yield prefix; return }
  for (let i = start; i <= items.length - (k - prefix.length); i++) yield* subsets(items, k, i + 1, [...prefix, items[i]])
}

/** 모든 k개 선택지 조합 중 최대 커버리지 */
function bruteBest(responses: DemandResponse[], venues: Venue[], plan: ProgramPlan): number {
  const households = eligibleOf(responses, plan)
  const options = rawOptions(venues, plan)
  let best = 0
  for (const combo of subsets(options, Math.min(plan.classCount, options.length))) best = Math.max(best, coveredBy(households, combo).length)
  return best
}

/**
 * 제한 없는 무차별 대입: 서로 다른 (칸, 장소) 선택지 k개로 만들 수 있는 모든 조합 중, 닿는 가정 집합이 서로 다르고 비어 있지 않은 상위 3개의 커버리지.
 * 같은 시간·같은 동의 다른 장소나 닿는 가정이 없는 선택지가 섞인 조합도 모두 따집니다(구현의 묶음·비트셋 규칙을 쓰지 않음).
 */
function bruteTopCoverages(responses: DemandResponse[], venues: Venue[], plan: ProgramPlan): number[] {
  const households = eligibleOf(responses, plan)
  const options = rawOptions(venues, plan)
  const reached = options.map((option) => households.map((response) => reaches(response, option)))
  const sets = new Map<string, number>()
  for (const combo of subsets(options.map((_, at) => at), Math.min(plan.classCount, options.length))) {
    const flags = households.map((_, index) => combo.some((at) => reached[at][index]))
    const covered = flags.filter(Boolean).length
    if (covered > 0) sets.set(flags.map((flag) => (flag ? '1' : '0')).join(''), covered)
  }
  return [...sets.values()].sort((a, b) => b - a).slice(0, 3)
}

// ── 손으로 만든 작은 예제 ────────────────────────────────────────────────────────
const fixtureVenues: Venue[] = [
  { id: 'a', name: '가상 중앙동 도서관', dong: '중앙동', bookable: ['sat-morning', 'tue-evening', 'sun-afternoon'] },
  { id: 'b', name: '가상 세마동 센터', dong: '세마동', bookable: ['sat-morning', 'wed-evening'] },
  { id: 'c', name: '가상 초평동 센터', dong: '초평동', bookable: ['tue-evening', 'sat-afternoon'] },
  { id: 'd', name: '가상 남촌동 도서관', dong: '남촌동', bookable: ['wed-evening', 'sat-afternoon', 'sat-morning'] },
  { id: 'e', name: '가상 중앙동 강당', dong: '중앙동', bookable: ['sat-morning', 'fri-evening'] },
]
let serial = 0
const h = (dong: Dong, slots: SlotKey[], extra: Partial<DemandResponse> = {}): DemandResponse => ({
  id: `f-${String(serial++).padStart(3, '0')}`, dong, child_grade: 3, available_slots: slots, interests: [], screen_language: 'vi', ...extra,
})
const fixture: DemandResponse[] = [
  h('중앙동', ['sat-morning']), h('중앙동', ['sat-morning', 'tue-evening'], { screen_language: 'zh', korean_level: 'beginner' }),
  h('대원동', ['tue-evening']), h('대원동', ['sat-afternoon'], { interests: ['career'] }), h('남촌동', ['wed-evening']),
  h('남촌동', ['wed-evening', 'sat-afternoon'], { korean_level: 'fluent' }), h('세마동', ['wed-evening']), h('세마동', ['sat-morning'], { screen_language: 'ko-easy' }),
  h('초평동', ['tue-evening'], { interests: ['sports_arts'] }), h('초평동', ['sat-afternoon']), h('신장동', ['sat-afternoon', 'tue-evening']),
  h('신장동', ['sun-afternoon'], { child_grade: 6 }), h('신장동', ['fri-evening']), h('중앙동', ['fri-evening', 'sat-morning'], { interests: ['korean_study'] }),
  h('세마동', ['sat-morning', 'wed-evening'], { child_grade: 1 }), h('남촌동', ['sat-morning']),
]
const fixturePlan = (overrides: Partial<ProgramPlan> = {}): ProgramPlan => ({
  interest: 'all', gradeRange: [1, 6], classCount: 2, capacity: 3, venueIds: fixtureVenues.map((venue) => venue.id), ...overrides,
})

/** 시드로 만든 작은 무작위 예제(속성 테스트용) */
function randomInstance(seed: number) {
  const random = mulberry32(seed)
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]
  const slots = SLOTS.filter(() => random() < 0.3).slice(0, 7)
  const usable: SlotKey[] = slots.length ? slots : ['sat-morning']
  const venues: Venue[] = Array.from({ length: 2 + Math.floor(random() * 3) }, (_, index) => ({
    id: `r${index}`, name: `가상 장소 ${index}`, dong: pick(DONGS), bookable: [...new Set(Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick(usable)))],
  }))
  // 32·64가정을 넘는 예제도 섞어 비트셋이 여러 워드에 걸치는 경우를 확인합니다.
  const responses = Array.from({ length: 20 + Math.floor(random() * 80) }, (_, index) => ({
    id: `x${index}`, dong: pick(DONGS), child_grade: (1 + Math.floor(random() * 6)) as Grade,
    available_slots: [...new Set(Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick(usable)))],
    interests: (['career', 'korean_study'] as Interest[]).filter(() => random() < 0.4), screen_language: pick(['ko-easy', 'vi', 'zh'] as const),
  }))
  const plan: ProgramPlan = {
    interest: pick(['all', 'career'] as const), gradeRange: [1, 6], classCount: 1 + Math.floor(random() * 3), capacity: 5,
    venueIds: venues.map((venue) => venue.id),
  }
  return { responses, venues, plan }
}

describe('비트 계산 도구', () => {
  it('popcount와 조합 수', () => {
    expect(popcount32(0)).toBe(0)
    expect(popcount32(0xffffffff | 0)).toBe(32)
    expect(popcount32(0b1011)).toBe(3)
    expect(popcount32(1 << 31)).toBe(1)
    expect(choose(10, 3)).toBe(120)
    expect(choose(126, 3)).toBe(325_500)
    expect(choose(2, 3)).toBe(0)
  })
})

describe('최대 커버리지 추천: 정확 탐색', () => {
  it.each([1, 2, 3])('손 예제 k=%i에서 무차별 대입과 최댓값·상위 3개가 같다', (classCount) => {
    const plan = fixturePlan({ classCount })
    const result = recommend(fixture, fixtureVenues, plan)
    expect(result.status).toBe('ok')
    expect(result.method).toBe('exact')
    expect(result.recommendations[0].covered).toBe(bruteBest(fixture, fixtureVenues, plan))
    expect(result.recommendations.map((item) => item.covered)).toEqual(bruteTopCoverages(fixture, fixtureVenues, plan))
  })

  it('분야·학년 조건을 대상 수요에 반영한다', () => {
    const plan = fixturePlan({ interest: 'career', gradeRange: [2, 5], classCount: 2 })
    const result = recommend(fixture, fixtureVenues, plan)
    expect(result.eligibleCount).toBe(eligibleOf(fixture, plan).length)
    expect(result.eligibleCount).toBe(fixture.length - 4)
    expect(result.recommendations[0].covered).toBe(bruteBest(fixture, fixtureVenues, plan))
  })

  it('무작위 예제 300개(최대 99가정)에서도 무차별 대입과 1~3위가 같다', () => {
    let compared = 0
    let overOneWord = 0
    let overTwoWords = 0
    for (let seed = 1; seed <= 300; seed++) {
      const { responses, venues, plan } = randomInstance(seed)
      const result = recommend(responses, venues, plan)
      const eligible = eligibleOf(responses, plan).length
      if (eligible < 5) { expect(result.status).toBe('insufficient'); continue }
      if (result.status !== 'ok') { expect(bruteBest(responses, venues, plan)).toBe(0); continue }
      expect(result.recommendations[0].covered, `seed ${seed}`).toBe(bruteBest(responses, venues, plan))
      expect(result.recommendations.map((item) => item.covered), `seed ${seed}`).toEqual(bruteTopCoverages(responses, venues, plan))
      compared += 1
      if (eligible > 32) overOneWord += 1
      if (eligible > 64) overTwoWords += 1
    }
    expect(compared).toBeGreaterThanOrEqual(250)
    expect(overOneWord).toBeGreaterThanOrEqual(100)
    expect(overTwoWords).toBeGreaterThanOrEqual(20)
  })

  it('실제 시연 데이터(최대 400가정, 장소 9곳 전체)에서도 무차별 대입과 1~3위가 같다', () => {
    for (const interest of ['experience_culture', 'all', 'career'] as const) {
      for (const classCount of [1, 2, 3]) {
        const plan: ProgramPlan = { interest, gradeRange: [1, 6], classCount, capacity: 15, venueIds: VENUES.map((venue) => venue.id) }
        const result = recommend(DEMO_RESPONSES, VENUES, plan)
        expect(result.eligibleCount).toBeGreaterThan(64)
        expect(result.recommendations.map((item) => item.covered), `${interest} k=${classCount}`).toEqual(bruteTopCoverages(DEMO_RESPONSES, VENUES, plan))
      }
    }
  })

  it('2~3위는 같은 시간·같은 동의 다른 장소로 반을 채우는 조합도 따진다(리뷰 손 예제)', () => {
    let id = 0
    const many = (count: number, dong: Dong, slot: SlotKey) => Array.from({ length: count }, () => ({ id: `m-${id++}`, dong, child_grade: 3 as Grade, available_slots: [slot], interests: [], screen_language: 'vi' as const }))
    const responses = [...many(12, '세마동', 'sat-morning'), ...many(5, '초평동', 'tue-evening'), ...many(5, '초평동', 'wed-evening')]
    const venues: Venue[] = [
      { id: 'a', name: '가상 세마동 도서관', dong: '세마동', bookable: ['sat-morning'] },
      { id: 'a2', name: '가상 세마동 강당', dong: '세마동', bookable: ['sat-morning'] },
      { id: 'b', name: '가상 초평동 센터', dong: '초평동', bookable: ['tue-evening'] },
      { id: 'c', name: '가상 초평동 도서관', dong: '초평동', bookable: ['wed-evening'] },
    ]
    const plan: ProgramPlan = { interest: 'all', gradeRange: [1, 6], classCount: 2, capacity: 15, venueIds: venues.map((venue) => venue.id) }
    const result = recommend(responses, venues, plan)
    expect(result.recommendations.map((item) => item.covered)).toEqual([17, 17, 12])
    expect(result.recommendations[2].options).toEqual([{ slot: 'sat-morning', venueId: 'a' }, { slot: 'sat-morning', venueId: 'a2' }])
    expect(result.recommendations[2].warnings.some((line) => line.includes('새로 더하는 가정이 없어요'))).toBe(true)
    // 시연 데이터 예: 진로 · 1학년 · 가상 남촌동 작은도서관만 · 2개 반 → 3위는 토 오후 + 토 오전(6가정)
    const namchon: ProgramPlan = { interest: 'career', gradeRange: [1, 1], classCount: 2, capacity: 15, venueIds: ['v-namchon-library'] }
    const demo = recommend(DEMO_RESPONSES, VENUES, namchon)
    expect(demo.recommendations.map((item) => item.covered)).toEqual(bruteTopCoverages(DEMO_RESPONSES, VENUES, namchon))
    expect(demo.recommendations[2].covered).toBe(6)
  })

  it('같은 선택지를 두 번 고르지 않고, 반 수·대관 가능 칸·커버리지가 정의와 맞는다', () => {
    for (const classCount of [1, 2, 3]) {
      const plan = fixturePlan({ classCount })
      const households = eligibleOf(fixture, plan)
      for (const item of recommend(fixture, fixtureVenues, plan).recommendations) {
        const keys = item.options.map((option) => `${option.slot}|${option.venueId}`)
        expect(new Set(keys).size).toBe(keys.length)
        expect(item.options).toHaveLength(classCount)
        for (const option of item.options) expect(fixtureVenues.find((venue) => venue.id === option.venueId)?.bookable).toContain(option.slot)
        const options = item.classes.map((entry) => ({ slot: entry.option.slot, venue: entry.venue }))
        expect(item.covered).toBe(coveredBy(households, options).length)
        expect(item.classes.reduce((total, entry) => total + entry.marginal, 0)).toBe(item.covered)
        expect(item.classes.reduce((total, entry) => total + entry.share, 0)).toBeCloseTo(item.covered, 9)
        item.classes.forEach((entry, at) => {
          expect(entry.reach).toBe(coveredBy(households, [options[at]]).length)
          if (at > 0) expect(entry.marginal).toBeLessThanOrEqual(item.classes[at - 1].marginal)
          expect(entry.expectedHeadcount).toBeCloseTo(entry.share * ENROLLMENT_RATE, 9)
          expect(entry.overCapacity).toBe(roundPeople(entry.expectedHeadcount) > plan.capacity)
        })
      }
    }
  })

  it('상위 추천들은 닿는 가정 집합이 서로 다르고 커버리지 순서다', () => {
    const plan = fixturePlan({ classCount: 2 })
    const households = eligibleOf(fixture, plan)
    const result = recommend(fixture, fixtureVenues, plan)
    const sets = result.recommendations.map((item) => coveredBy(households, item.classes.map((entry) => ({ slot: entry.option.slot, venue: entry.venue }))).map((response) => response.id).join(','))
    expect(new Set(sets).size).toBe(sets.length)
    result.recommendations.forEach((item, at) => { if (at > 0) expect(item.covered).toBeLessThanOrEqual(result.recommendations[at - 1].covered) })
    expect(result.recommendations.map((item) => item.rank)).toEqual([1, 2, 3].slice(0, result.recommendations.length))
  })

  it('같은 칸·같은 동의 다른 장소는 대체 장소로 알려 준다', () => {
    const venues: Venue[] = [
      { id: 'p', name: '가상 중앙동 도서관', dong: '중앙동', bookable: ['sat-morning'] },
      { id: 'q', name: '가상 중앙동 강당', dong: '중앙동', bookable: ['fri-evening', 'sat-morning'] },
    ]
    const result = recommend(fixture, venues, fixturePlan({ classCount: 1, venueIds: ['p', 'q'] }))
    const top = result.recommendations[0].classes[0]
    expect(result.optionCount).toBe(3)
    expect(result.groupCount).toBe(2)
    expect(top.option).toEqual({ slot: 'sat-morning', venueId: 'p' })
    expect(top.alternatives.map((venue) => venue.id)).toEqual(['q'])
  })

  it('같은 입력이면 항상 같은 결과를 낸다', () => {
    expect(DEFAULT_PLAN.baseline).toHaveLength(3)
    const plan = { ...DEFAULT_PLAN, venueIds: VENUES.map((venue) => venue.id) }
    expect(recommend(DEMO_RESPONSES, VENUES, plan)).toEqual(recommend(DEMO_RESPONSES, VENUES, plan))
    const reversed = recommend([...DEMO_RESPONSES].reverse(), VENUES, plan)
    expect(reversed.recommendations.map((item) => item.covered)).toEqual(recommend(DEMO_RESPONSES, VENUES, plan).recommendations.map((item) => item.covered))
  })
})

describe('최대 커버리지 추천: 탐욕 대체', () => {
  it('조합 한도를 넘으면 탐욕 알고리즘으로 바꾸고 그 사실을 알린다', () => {
    const plan = { ...DEFAULT_PLAN, venueIds: VENUES.map((venue) => venue.id) }
    const exact = recommend(DEMO_RESPONSES, VENUES, plan)
    const greedy = recommend(DEMO_RESPONSES, VENUES, plan, { comboLimit: 10 })
    expect(exact.method).toBe('exact')
    expect(greedy.method).toBe('greedy')
    expect(greedy.notices.some((notice) => notice.includes('탐욕'))).toBe(true)
    const best = exact.recommendations[0].covered
    expect(greedy.recommendations[0].covered).toBeLessThanOrEqual(best)
    expect(greedy.recommendations[0].covered).toBeGreaterThanOrEqual(Math.ceil((1 - 1 / Math.E) * best))
    for (const item of greedy.recommendations) {
      const keys = item.options.map((option) => `${option.slot}|${option.venueId}`)
      expect(new Set(keys).size).toBe(3)
    }
  })

  it('손 예제에서도 탐욕 결과는 최적 이하, 63% 이상이다', () => {
    for (const classCount of [2, 3]) {
      const plan = fixturePlan({ classCount })
      const greedy = recommend(fixture, fixtureVenues, plan, { comboLimit: 0 })
      const best = bruteBest(fixture, fixtureVenues, plan)
      expect(greedy.method).toBe('greedy')
      expect(greedy.recommendations[0].covered).toBeLessThanOrEqual(best)
      expect(greedy.recommendations[0].covered).toBeGreaterThanOrEqual((1 - 1 / Math.E) * best)
    }
  })
})

describe('기존 계획 비교와 예외 상황', () => {
  it('기존 계획의 커버리지를 같은 규칙으로 계산해 차이를 낸다', () => {
    const plan = fixturePlan({ classCount: 2, baseline: [{ slot: 'wed-evening', venueId: 'b' }] })
    const result = recommend(fixture, fixtureVenues, plan)
    const households = eligibleOf(fixture, plan)
    const expected = coveredBy(households, [{ slot: 'wed-evening', venue: fixtureVenues[1] }]).length
    expect(result.baseline).toMatchObject({ covered: expected, classes: [{ bookable: true }] })
    expect(result.baseline?.coverageRate).toBeCloseTo(expected / households.length, 9)
    for (const item of result.recommendations) expect(item.baselineDelta).toBe(item.covered - expected)
  })

  it('기존 계획도 반 여러 개를 받아 추천과 같은 반 수로 비교한다', () => {
    const baseline = [{ slot: 'sat-morning' as SlotKey, venueId: 'a' }, { slot: 'sat-morning' as SlotKey, venueId: 'b' }, { slot: 'wed-evening' as SlotKey, venueId: 'd' }]
    const plan = fixturePlan({ classCount: 3, baseline })
    const result = recommend(fixture, fixtureVenues, plan)
    const expected = coveredBy(eligibleOf(fixture, plan), baseline.map(({ slot, venueId }) => ({ slot, venue: fixtureVenues.find((venue) => venue.id === venueId)! }))).length
    expect(result.baseline?.classes).toHaveLength(3)
    expect(result.baseline?.covered).toBe(expected)
    // 시연 기본값: 반 3개를 모두 토요일 오전에 여는 기존 계획과 추천 1위(반 3개)
    const demo = recommend(DEMO_RESPONSES, VENUES, { ...DEFAULT_PLAN, venueIds: VENUES.map((venue) => venue.id) })
    expect(demo.baseline?.classes.map((item) => item.option.slot)).toEqual(['sat-morning', 'sat-morning', 'sat-morning'])
    expect(demo.baseline?.classes.every((item) => item.bookable)).toBe(true)
    expect(demo.recommendations[0].classes).toHaveLength(3)
    expect(demo.recommendations[0].covered).toBeGreaterThan(demo.baseline?.covered ?? Infinity)
  })

  it('기존 계획 장소가 그 칸에 대관 가능하지 않아도 비교값은 내고, 장소 이름에 맞는 조사로 안내한다', () => {
    const result = recommend(fixture, fixtureVenues, fixturePlan({ baseline: [{ slot: 'mon-morning', venueId: 'a' }] }))
    expect(result.baseline).toMatchObject({ covered: 0, classes: [{ bookable: false }] })
    expect(result.notices.some((notice) => notice.includes('가상 중앙동 도서관은 월요일 오전에 대관 가능으로 등록되어 있지 않아'))).toBe(true)
    const center = recommend(DEMO_RESPONSES, VENUES, { ...DEFAULT_PLAN, venueIds: VENUES.map((venue) => venue.id), baseline: [{ slot: 'sat-morning', venueId: 'v-sinjang-family' }] })
    expect(center.notices.some((notice) => notice.includes('가상 신장동 가족센터는 토요일 오전에'))).toBe(true)
    expect(center.notices.join(' ')).not.toContain('센터은')
  })

  it('대상이 5가정 미만이면 추천 대신 부족 상태를 낸다', () => {
    const result = recommend(fixture, fixtureVenues, fixturePlan({ gradeRange: [6, 6] }))
    expect(result.status).toBe('insufficient')
    expect(result.recommendations).toEqual([])
  })

  it('장소를 고르지 않거나 닿는 가정이 없으면 상태로 알린다', () => {
    expect(recommend(fixture, fixtureVenues, fixturePlan({ venueIds: [] })).status).toBe('no_options')
    const nowhere: Venue[] = [{ id: 'z', name: '가상 빈 장소', dong: '초평동', bookable: ['mon-morning'] }]
    expect(recommend(fixture, nowhere, fixturePlan({ venueIds: ['z'] })).status).toBe('no_reach')
  })

  it('닿는 묶음이 반 수보다 적으면 같은 시간대 다른 장소로 채우고 알린다', () => {
    const venues: Venue[] = [
      { id: 'p', name: '가상 중앙동 도서관', dong: '중앙동', bookable: ['sat-morning', 'mon-morning'] },
      { id: 'q', name: '가상 중앙동 강당', dong: '중앙동', bookable: ['sat-morning'] },
    ]
    const plan = fixturePlan({ classCount: 3, venueIds: ['p', 'q'] })
    const result = recommend(fixture, venues, plan)
    const top = result.recommendations[0]
    expect(result.classCount).toBe(3)
    expect(top.options).toEqual([{ slot: 'sat-morning', venueId: 'p' }, { slot: 'sat-morning', venueId: 'q' }, { slot: 'mon-morning', venueId: 'p' }])
    expect(top.classes[0].alternatives).toEqual([])
    expect(top.classes.map((entry) => entry.marginal)).toEqual([3, 0, 0])
    expect(top.covered).toBe(bruteBest(fixture, venues, plan))
    expect(result.notices.some((notice) => notice.includes('묶음이 1개뿐'))).toBe(true)
    expect(top.warnings.filter((warning) => warning.includes('새로 더하는 가정이 없어요'))).toHaveLength(2)
  })

  it('선택지가 반 수보다 적으면 반 수를 줄인다', () => {
    const result = recommend(fixture, fixtureVenues, fixturePlan({ classCount: 3, venueIds: ['b'] }))
    expect(result.classCount).toBe(2)
    expect(result.recommendations[0].options).toHaveLength(2)
  })

  it('참여 가정의 언어·한국어 수준 분포도 소수 셀 억제를 거친다', () => {
    const result = recommend(fixture, fixtureVenues, fixturePlan({ classCount: 3 }))
    const top = result.recommendations[0]
    expect(top.languageBreakdown.zh.suppressed).toBe(true)
    expect(top.koreanLevelBreakdown.beginner.suppressed).toBe(true)
    expect(top.explanation.length).toBeGreaterThan(10)
    expect(top.languageSuggestions.some((line) => line.includes('5가정 미만') || line.includes('가정 수는 가림'))).toBe(true)
  })

  it('정원 초과 경고는 표와 같은 반올림 값으로 판단하고, 경고 속 인원은 언제나 정원보다 크다', () => {
    const at16 = recommend(DEMO_RESPONSES, VENUES, { ...DEFAULT_PLAN, capacity: 16, venueIds: VENUES.map((venue) => venue.id) })
    const first = at16.recommendations[0].classes[0]
    expect(roundPeople(first.expectedHeadcount)).toBe(16)
    expect(first.overCapacity).toBe(false)
    expect(at16.recommendations[0].warnings.join(' ')).not.toContain('정원 16명을 넘어요')
    for (let capacity = MIN_CAPACITY; capacity <= 30; capacity++) {
      const result = recommend(DEMO_RESPONSES, VENUES, { ...DEFAULT_PLAN, capacity, venueIds: VENUES.map((venue) => venue.id) })
      for (const item of result.recommendations) {
        for (const line of item.warnings.filter((warning) => warning.includes('정원'))) {
          const people = Number(/예상 신청 약 (\d+)명/.exec(line)?.[1])
          expect(people, line).toBeGreaterThan(capacity)
          expect(line).toContain('같은 시간에 반을 하나 더 열거나 정원을 늘려 보세요.')
          expect(line).not.toContain('정원 초과 예상, 반 추가 고려')
        }
      }
    }
  })
})

// 추천 화면에서 고를 수 있는 조건(장소는 전체·한 곳·두 곳)
function* recommendPlans(): Generator<ProgramPlan> {
  const venueSets = [VENUES.map((venue) => venue.id), ...VENUES.map((venue) => [venue.id]), ...VENUES.flatMap((venue, at) => VENUES.slice(at + 1).map((other) => [venue.id, other.id]))]
  for (const venueIds of venueSets) for (const interest of ['all', ...INTERESTS] as const) for (const low of GRADES) for (const high of GRADES) {
    if (high < low) continue
    for (const classCount of [1, 2, 3]) yield { interest, gradeRange: [low, high], classCount, capacity: 15, venueIds }
  }
}

describe('추천 카드: 화면 숫자로 가린 칸을 역산할 수 없다', () => {
  const runs: { plan: ProgramPlan; result: RecommendResult }[] = []
  for (const plan of recommendPlans()) runs.push({ plan, result: recommend(DEMO_RESPONSES, VENUES, plan) })
  const coveredOf = (plan: ProgramPlan, options: { slot: SlotKey; venueId: string }[]) =>
    coveredBy(eligibleOf(DEMO_RESPONSES, plan), options.map(({ slot, venueId }) => ({ slot, venue: VENUES.find((venue) => venue.id === venueId)! })))

  it('참여 가정의 화면 언어·한국어 수준 분포는 닿는 가정 합계와 규칙을 알아도 1~4 칸이 정해지지 않는다', () => {
    let cards = 0
    for (const { plan, result } of runs) {
      for (const item of result.recommendations) {
        const covered = coveredOf(plan, item.options)
        expect(item.covered).toBe(covered.length)
        // 닿는 가정이 1~4면 합계도 "5가정 미만"으로 가려져 빼서 알아낼 수 없습니다(분포는 모두 "5 미만" 또는 0).
        if (suppress(covered.length).suppressed) continue
        const languages = Object.fromEntries(LANGUAGES.map((language) => [language, covered.filter((response) => response.screen_language === language).length])) as Record<(typeof LANGUAGES)[number], number>
        const levelKeys: (KoreanLevel | 'none')[] = [...KOREAN_LEVELS, 'none']
        const levels = Object.fromEntries(levelKeys.map((level) => [level, covered.filter((response) => (response.korean_level ?? 'none') === level).length])) as Record<KoreanLevel | 'none', number>
        expect(recoverableCells(LANGUAGES, languages), JSON.stringify(plan)).toEqual([])
        expect(recoverableCells(levelKeys, levels), JSON.stringify(plan)).toEqual([])
        cards += 1
      }
    }
    expect(cards).toBeGreaterThan(10_000)
  })

  it('3개 반의 "새로 더함"은 2·3반을 함께 가려 합계에서 빼도 정해지지 않는다', () => {
    let masked = 0
    for (const { result } of runs) {
      for (const item of result.recommendations.filter((card) => card.classes.length === 3)) {
        // 3반이 새로 더하는 가정이 0이면 "새로 더하는 가정이 없어요" 경고로 드러나므로 2반 하나만 남은 것과 같습니다(README 참고).
        if (item.classes.some((entry) => entry.marginal === 0)) continue
        const later = { 0: item.classes[1].marginal, 1: item.classes[2].marginal }
        // 닿는 가정 합계나 1반이 가려져 있으면 2·3반의 합도 정확히 알 수 없습니다.
        if (suppress(item.covered).suppressed || suppress(item.classes[0].reach).suppressed) continue
        expect(subtractableCells(['0', '1'] as const, later, { maskZeros: false })).toEqual([])
        if (item.classes.some((entry) => entry.marginalSafe.suppressed && entry.marginalSafe.masked)) masked += 1
      }
    }
    expect(masked).toBeGreaterThan(0)
  })

  it('비율·제안 문장은 보이는 숫자로만 만든다: 가린 칸끼리 응답을 옮겨도 카드 문구가 똑같다', () => {
    let perturbed = 0
    for (const { plan, result } of runs.filter(({ plan }) => plan.venueIds.length === VENUES.length)) {
      const top = result.recommendations[0]
      if (!top) continue
      const hidden = ([...KOREAN_LEVELS, 'none'] as const).filter((level) => top.koreanLevelBreakdown[level].suppressed)
      if (hidden.length < 2) continue
      const [from, to] = hidden.includes('none') ? ['none', hidden.find((level) => level !== 'none')!] : [hidden[0], hidden[1]]
      const coveredIds = new Set(coveredOf(plan, top.options).map((response) => response.id))
      const target = DEMO_RESPONSES.find((response) => coveredIds.has(response.id) && (response.korean_level ?? 'none') === from)
      if (!target) continue
      const moved = DEMO_RESPONSES.map((response) => (response === target ? { ...response, korean_level: to === 'none' ? undefined : (to as KoreanLevel) } : response))
      const after = recommend(moved, VENUES, plan).recommendations[0]
      if (JSON.stringify(after.koreanLevelBreakdown) !== JSON.stringify(top.koreanLevelBreakdown)) continue
      expect(after.teachingSuggestions, JSON.stringify(plan)).toEqual(top.teachingSuggestions)
      perturbed += 1
    }
    expect(perturbed).toBeGreaterThan(10)
  })

  it('리뷰 예: 한국어 · 3학년 · 1개 반 카드는 미응답이 가려지면 미응답 %를 말하지 않는다', () => {
    const result = recommend(DEMO_RESPONSES, VENUES, { interest: 'korean_study', gradeRange: [3, 3], classCount: 1, capacity: 15, venueIds: VENUES.map((venue) => venue.id) })
    for (const item of result.recommendations) {
      if (item.koreanLevelBreakdown.none.suppressed) expect(item.teachingSuggestions.join(' ')).not.toMatch(/미응답이 \d+%/)
    }
  })

  it('설명·경고·안내 문장은 해요체로 쓰고, 계산되는 1~4는 "5가정 미만"처럼 가린 척하지 않는다', () => {
    let small = 0
    for (const { result } of runs.filter(({ plan }) => plan.venueIds.length === VENUES.length)) {
      for (const item of result.recommendations) {
        for (const line of [item.explanation, ...item.warnings, ...item.languageSuggestions, ...item.teachingSuggestions, ...result.notices]) expect(line).not.toMatch(/니다[.]?/)
        expect(item.explanation).not.toContain('5가정 미만을 더 모')
        const gained = item.covered - item.classes[0].reach
        if (item.classes.length > 1 && gained >= 1 && gained <= 4) { expect(item.explanation).toContain('가정을 조금 더 모아요'); small += 1 }
      }
    }
    expect(small).toBeGreaterThan(0)
  })
})

describe('기본 시연 시나리오 성능', () => {
  it('모든 장소·반 3개 정확 탐색이 1.5초보다 훨씬 빨리 끝난다', () => {
    const plan = { ...DEFAULT_PLAN, venueIds: VENUES.map((venue) => venue.id) }
    const started = performance.now()
    const result = recommend(DEMO_RESPONSES, VENUES, plan)
    const elapsed = performance.now() - started
    expect(result.method).toBe('exact')
    expect(result.recommendations).toHaveLength(3)
    expect(elapsed).toBeLessThan(500)
  })

  it('묶지 않은 (칸, 장소) 전체를 동 구분 없이 따져야 하는 최악 경우(장소 30곳 × 21칸, k=3)도 한도 안에서 빠르다', () => {
    const venues: Venue[] = Array.from({ length: 30 }, (_, index) => ({ id: `w${index}`, name: `가상 장소 ${index}`, dong: DONGS[index % 6], bookable: [...SLOTS] }))
    const plan: ProgramPlan = { ...DEFAULT_PLAN, interest: 'all', venueIds: venues.map((venue) => venue.id) }
    const started = performance.now()
    const result = recommend(DEMO_RESPONSES, venues, plan)
    const elapsed = performance.now() - started
    expect(result.groupCount).toBeLessThanOrEqual(126)
    expect(result.method).toBe('exact')
    expect(elapsed).toBeLessThan(1500)
  })
})
