import { describe, expect, it } from 'vitest'
import { DONGS } from './data/assumptions'
import { DEMO_RESPONSES } from './data/generate'
import {
  defaultFilters, filterResponses, formatCount, formatHouseholds, formatPeople, heatLegend, heatLevel, safePercent, summarize, suppress, suppressPartition,
} from './lib/aggregate'
import type { DemandFilters } from './lib/aggregate'
import { GRADES, INTERESTS, KOREAN_LEVELS, LANGUAGES } from './lib/labels'
import { SLOTS } from './lib/slots'
import { recoverableCells, subtractableCells } from './testing/disclosure'
import type { DemandResponse, Dong, Grade, KoreanLevel, SlotKey } from './types'

let serial = 0
const household = (overrides: Partial<DemandResponse> = {}): DemandResponse => ({
  id: `t-${serial++}`, dong: '중앙동', child_grade: 3, available_slots: ['sat-morning'], interests: [], screen_language: 'vi', ...overrides,
})

describe('소수 셀 억제', () => {
  it('1~4는 "5 미만"으로 가리고 0과 5 이상은 그대로 둔다', () => {
    expect(suppress(0)).toEqual({ suppressed: false, value: 0 })
    for (const value of [1, 2, 3, 4]) expect(suppress(value)).toEqual({ suppressed: true })
    expect(suppress(5)).toEqual({ suppressed: false, value: 5 })
    expect(formatCount(suppress(3))).toBe('5 미만')
    expect(formatCount(suppress(0))).toBe('0')
    expect(formatCount(suppress(1234))).toBe('1,234')
    expect(formatHouseholds(suppress(2))).toBe('5가정 미만')
    expect(formatHouseholds(suppress(131))).toBe('131가정')
    expect(safePercent(suppress(3), 10)).toBeNull()
    expect(safePercent(suppress(5), 10)).toBe(50)
  })

  it('대상이 5가정 미만이면 숫자를 하나도 내보내지 않는다', () => {
    expect(summarize([])).toEqual({ status: 'insufficient' })
    expect(summarize([household(), household(), household(), household()])).toEqual({ status: 'insufficient' })
  })

  it('히트맵·동별·언어·한국어 수준 집계에 모두 억제를 적용한다', () => {
    const sevenSaturday: DemandResponse[] = Array.from({ length: 7 }, (_, index) => household({
      dong: index < 5 ? '세마동' : '초평동',
      available_slots: index < 3 ? ['sat-morning', 'mon-evening'] : ['sat-morning'],
      screen_language: index < 6 ? 'zh' : 'ko-easy',
      korean_level: index < 2 ? 'beginner' : undefined,
    }))
    const summary = summarize(sevenSaturday)
    if (summary.status !== 'ok') throw new Error('expected ok')
    expect(summary.total).toBe(7)
    expect(summary.slots['sat-morning']).toEqual({ suppressed: false, value: 7 })
    expect(summary.slots['mon-evening']).toEqual({ suppressed: true })
    expect(summary.slots['sun-evening']).toEqual({ suppressed: false, value: 0 })
    expect(summary.maxSlotValue).toBe(7)
    expect(summary.topSlots.map(({ slot }) => slot)).toEqual(['sat-morning'])
    expect(Object.fromEntries(summary.dongs.map(({ dong, count }) => [dong, count]))).toMatchObject({
      세마동: { suppressed: true, masked: true }, 초평동: { suppressed: true, masked: true }, 중앙동: { suppressed: false, value: 0 },
    })
    expect(Object.fromEntries(summary.languages.map(({ language, count }) => [language, count]))).toEqual({
      'ko-easy': { suppressed: true, masked: true }, vi: { suppressed: false, value: 0 }, zh: { suppressed: true, masked: true },
    })
    // 한국어 수준: 초급 2만 가려지면 7 − 5 = 2로 역산되므로 미응답 5도 함께 "가림"
    expect(Object.fromEntries(summary.koreanLevels.map(({ level, count }) => [level, count]))).toEqual({
      beginner: { suppressed: true, masked: true }, intermediate: { suppressed: false, value: 0 }, fluent: { suppressed: false, value: 0 }, none: { suppressed: true, masked: true },
    })
  })

  it('억제된 칸은 히트맵 최댓값과 상위 칸 계산에서 빠진다', () => {
    const responses = [
      ...Array.from({ length: 5 }, () => household({ available_slots: ['sat-morning'] })),
      ...Array.from({ length: 4 }, () => household({ available_slots: ['tue-evening' as SlotKey] })),
    ]
    const summary = summarize(responses)
    if (summary.status !== 'ok') throw new Error('expected ok')
    expect(summary.maxSlotValue).toBe(5)
    expect(summary.topSlots.map(({ slot }) => slot)).toEqual(['sat-morning'])
  })
})

describe('합계와 함께 보이는 분포의 보조 억제', () => {
  const keys = ['a', 'b', 'c', 'd'] as const
  const run = (values: number[]) => suppressPartition(keys, Object.fromEntries(keys.map((key, at) => [key, values[at]])) as Record<(typeof keys)[number], number>)

  it('가린 칸이 하나뿐이면 0이 아닌 가장 작은 칸(같은 값 모두)을 함께 "가림"으로 가린다', () => {
    expect(run([12, 3, 7, 7])).toEqual({ a: { suppressed: false, value: 12 }, b: { suppressed: true, masked: true }, c: { suppressed: true, masked: true }, d: { suppressed: true, masked: true } })
    expect(run([12, 3, 0, 9])).toEqual({ a: { suppressed: false, value: 12 }, b: { suppressed: true, masked: true }, c: { suppressed: false, value: 0 }, d: { suppressed: true, masked: true } })
  })

  it('가린 칸이 여럿이어도 모두 1이거나 모두 4면 값이 정해지므로 함께 가린다', () => {
    expect(run([1, 1, 9, 20]).c).toEqual({ suppressed: true, masked: true })
    expect(run([4, 4, 9, 20]).c).toEqual({ suppressed: true, masked: true })
    expect(run([2, 3, 9, 20])).toEqual({ a: { suppressed: true }, b: { suppressed: true }, c: { suppressed: false, value: 9 }, d: { suppressed: false, value: 20 } })
  })

  it('0이 아닌 보이는 칸이 없으면 0인 칸을 함께 가리고, 합계가 가려져 있으면 보조 억제를 하지 않는다', () => {
    expect(run([4, 4, 0, 0])).toEqual({ a: { suppressed: true, masked: true }, b: { suppressed: true, masked: true }, c: { suppressed: true, masked: true }, d: { suppressed: true, masked: true } })
    expect(suppressPartition(keys, { a: 3, b: 0, c: 0, d: 0 }, { totalShown: false }).a).toEqual({ suppressed: true })
    expect(formatCount({ suppressed: true, masked: true })).toBe('가림')
    expect(formatHouseholds({ suppressed: true, masked: true })).toBe('가림')
    expect(safePercent({ suppressed: true, masked: true }, 10)).toBeNull()
  })

  it('작은 무작위 분포 전부에서 합계·규칙을 알아도 1~4 칸이 하나로 정해지지 않는다', () => {
    for (let a = 0; a <= 12; a++) for (let b = 0; b <= 12; b++) for (let c = 0; c <= 12; c++) {
      const raw = { a, b, c, d: 7 }
      expect(recoverableCells(keys, raw), JSON.stringify(raw)).toEqual([])
    }
  })
})

describe('예상 인원 표시', () => {
  it('1~4명은 "5명 미만", 닿는 가정이 없을 때만 "0명"', () => {
    expect(formatPeople(0)).toBe('0명')
    expect(formatPeople(0.4)).toBe('5명 미만')
    expect(formatPeople(4.49)).toBe('5명 미만')
    expect(formatPeople(4.5)).toBe('약 5명')
    expect(formatPeople(16.13)).toBe('약 16명')
  })
})

// 수요 현황 화면에서 고를 수 있는 모든 필터 조합(동은 모든 부분집합)
function* demandStates(): Generator<DemandFilters> {
  for (let mask = 0; mask < 1 << DONGS.length; mask++) {
    const dongs = DONGS.filter((_, at) => mask & (1 << at)) as Dong[]
    for (const low of GRADES) for (const high of GRADES) {
      if (high < low) continue
      for (const interest of ['all', ...INTERESTS] as const) for (const language of ['all', ...LANGUAGES] as const) yield { dongs, gradeRange: [low, high] as [Grade, Grade], interest, language }
    }
  }
}

describe('수요 현황: 화면 숫자로 가린 칸을 역산할 수 없다', () => {
  it('모든 필터 조합에서 동별·화면 언어·한국어 수준 분포의 1~4 칸이 합계·규칙으로 정해지지 않는다', () => {
    let checked = 0
    let maskedStates = 0
    for (const filters of demandStates()) {
      const responses = filterResponses(DEMO_RESPONSES, filters)
      const summary = summarize(responses, filters)
      if (summary.status !== 'ok') continue
      checked += 1
      const tally = <K extends string>(keys: readonly K[], pick: (response: DemandResponse) => K) => {
        const raw = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>
        for (const response of responses) raw[pick(response)] += 1
        return raw
      }
      const scopeDongs = filters.dongs.length ? filters.dongs : DONGS
      const scopeLanguages = filters.language === 'all' ? LANGUAGES : [filters.language]
      const levelKeys: (KoreanLevel | 'none')[] = [...KOREAN_LEVELS, 'none']
      const partitions = [
        [scopeDongs, tally(scopeDongs, (response) => response.dong)],
        [scopeLanguages, tally(scopeLanguages, (response) => response.screen_language)],
        [levelKeys, tally(levelKeys, (response) => response.korean_level ?? 'none')],
      ] as const
      for (const [keys, raw] of partitions) {
        expect(recoverableCells(keys as readonly string[], raw as Record<string, number>), JSON.stringify(filters)).toEqual([])
        expect(subtractableCells(keys as readonly string[], raw as Record<string, number>), JSON.stringify(filters)).toEqual([])
      }
      if ([...summary.dongs, ...summary.languages, ...summary.koreanLevels].some(({ count }) => count.suppressed && count.masked)) maskedStates += 1
    }
    expect(checked).toBeGreaterThan(20_000)
    expect(maskedStates).toBeGreaterThan(1_000)
  })

  it('비율·평균은 화면에 보이는 숫자로만 계산한다: 가린 칸끼리 응답을 옮겨도 화면 전체가 똑같다', () => {
    let perturbed = 0
    for (const filters of demandStates()) {
      if (filters.dongs.length > 1) continue
      const responses = filterResponses(DEMO_RESPONSES, filters)
      const summary = summarize(responses, filters)
      if (summary.status !== 'ok') continue
      const hidden = summary.koreanLevels.filter(({ count }) => count.suppressed).map(({ level }) => level)
      if (hidden.length < 2) continue
      // 가린 칸 A의 한 가정을 가린 칸 B로 옮긴 데이터(같은 화면이 나와야 하는 경우만 비교)
      const [from, to] = hidden.includes('none') ? ['none', hidden.find((level) => level !== 'none')!] : [hidden[0], hidden[1]]
      const index = responses.findIndex((response) => (response.korean_level ?? 'none') === from)
      if (index === -1) continue
      const moved = responses.map((response, at) => (at === index ? { ...response, korean_level: to === 'none' ? undefined : (to as KoreanLevel) } : response))
      const after = summarize(moved, filters)
      if (after.status !== 'ok' || JSON.stringify(after.koreanLevels) !== JSON.stringify(summary.koreanLevels)) continue
      expect(after, JSON.stringify(filters)).toEqual(summary)
      perturbed += 1
    }
    expect(perturbed).toBeGreaterThan(100)
  })

  it('미응답 칸이 가려지면 한국어 수준 응답률도 가린다(리뷰 예: 1학년 · 베트남어)', () => {
    const filters: DemandFilters = { dongs: [], gradeRange: [1, 1], interest: 'all', language: 'vi' }
    const summary = summarize(filterResponses(DEMO_RESPONSES, filters), filters)
    if (summary.status !== 'ok') throw new Error('expected ok')
    expect(summary.koreanLevels.find(({ level }) => level === 'none')?.count.suppressed).toBe(true)
    expect(summary.koreanLevelResponseRate).toBeNull()
  })

  it('가정당 가능 칸 평균은 보이는 히트맵 숫자로 계산하고 가린 칸은 2.5로 어림한다', () => {
    const all = summarize(DEMO_RESPONSES)
    if (all.status !== 'ok') throw new Error('expected ok')
    expect(all.averageSlotsEstimated).toBe(false)
    expect(all.averageSlots).toBeCloseTo(DEMO_RESPONSES.reduce((sum, response) => sum + response.available_slots.length, 0) / DEMO_RESPONSES.length, 9)
    const filters: DemandFilters = { dongs: ['초평동'], gradeRange: [1, 6], interest: 'all', language: 'zh' }
    const small = summarize(filterResponses(DEMO_RESPONSES, filters), filters)
    if (small.status !== 'ok') throw new Error('expected ok')
    const visible = SLOTS.filter((slot) => !small.slots[slot].suppressed)
    const expected = (visible.reduce((sum, slot) => { const count = small.slots[slot]; return count.suppressed ? sum : sum + count.value }, 0) + (SLOTS.length - visible.length) * 2.5) / small.total
    expect(small.averageSlotsEstimated).toBe(true)
    expect(small.averageSlots).toBeCloseTo(expected, 9)
  })
})

describe('필터', () => {
  it('관심 분야는 그 분야를 고르거나 비워 둔 응답을 남기고, 학년 범위는 순서와 무관하다', () => {
    const responses = [
      household({ interests: ['career'] }), household({ interests: [] }), household({ interests: ['korean_study'] }), household({ child_grade: 6, interests: ['career'] }),
    ]
    expect(filterResponses(responses, { ...defaultFilters(), interest: 'career' })).toHaveLength(3)
    expect(filterResponses(responses, { ...defaultFilters(), interest: 'career', gradeRange: [6, 4] })).toHaveLength(1)
    expect(filterResponses(responses, { ...defaultFilters(), dongs: ['세마동'] })).toHaveLength(0)
    expect(filterResponses(responses, { ...defaultFilters(), language: 'zh' })).toHaveLength(0)
  })

  it('필터를 많이 걸어 5가정 미만이 되면 부족 상태가 된다', () => {
    const narrow = filterResponses(DEMO_RESPONSES, { dongs: ['초평동'], gradeRange: [6, 6], interest: 'career', language: 'zh' })
    expect(narrow.length).toBeLessThan(5)
    expect(summarize(narrow).status).toBe('insufficient')
    expect(summarize(filterResponses(DEMO_RESPONSES, defaultFilters())).status).toBe('ok')
  })
})

describe('히트맵 색 단계', () => {
  it('범례 범위와 칸의 색 단계가 어긋나지 않는다', () => {
    expect(heatLevel(0, 100)).toBe(0)
    expect(heatLevel(100, 100)).toBe(5)
    expect(heatLevel(5, 100)).toBe(1)
    for (let max = 5; max <= 160; max++) {
      const legend = heatLegend(max)
      expect(legend[legend.length - 1].to).toBe(max)
      for (let value = 5; value <= max; value++) {
        const level = heatLevel(value, max)
        const range = legend.find((item) => item.level === level)
        expect(range && value >= range.from && value <= range.to).toBe(true)
      }
    }
  })
})
