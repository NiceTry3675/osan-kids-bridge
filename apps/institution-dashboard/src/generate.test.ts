import { describe, expect, it } from 'vitest'
import {
  DEMO_RECORD_COUNT, DEMO_SEED, DONGS, DONG_ADJACENCY, DONG_HOUSEHOLD_WEIGHTS, GRADE_WEIGHTS, KOREAN_LEVEL_WEIGHTS, SCREEN_LANGUAGE_WEIGHTS,
  SLOTS_PER_HOUSEHOLD_WEIGHTS,
} from './data/assumptions'
import { DEMO_RESPONSES, generateDemand, mulberry32 } from './data/generate'
import { VENUES } from './data/venues'
import { countSlots } from './lib/aggregate'
import { INTERESTS, KOREAN_LEVELS, LANGUAGES } from './lib/labels'
import { SLOTS, SLOT_INDEX } from './lib/slots'

const sum = (record: Record<string | number, number>) => Object.values(record).reduce((total, value) => total + value, 0)

describe('시연용 가정', () => {
  it('동 인접 관계는 대칭이고 자기 자신을 포함하지 않는다', () => {
    for (const dong of DONGS) {
      expect(DONG_ADJACENCY[dong]).not.toContain(dong)
      for (const neighbor of DONG_ADJACENCY[dong]) expect(DONG_ADJACENCY[neighbor]).toContain(dong)
    }
  })

  it('비율 가정은 합이 1이다', () => {
    for (const weights of [DONG_HOUSEHOLD_WEIGHTS, SCREEN_LANGUAGE_WEIGHTS, KOREAN_LEVEL_WEIGHTS, GRADE_WEIGHTS, SLOTS_PER_HOUSEHOLD_WEIGHTS]) {
      expect(sum(weights)).toBeCloseTo(1, 10)
    }
  })

  it('가상 장소는 이름이 "가상"으로 시작하고 대관 가능 칸이 21칸 안에 있다', () => {
    expect(new Set(VENUES.map((venue) => venue.id)).size).toBe(VENUES.length)
    for (const venue of VENUES) {
      expect(venue.name.startsWith('가상 ')).toBe(true)
      expect(venue.bookable.length).toBeGreaterThan(0)
      for (const slot of venue.bookable) expect(SLOTS).toContain(slot)
    }
    expect(new Set(VENUES.map((venue) => venue.dong)).size).toBe(DONGS.length)
  })
})

describe('합성 수요 생성기', () => {
  it('같은 시드는 같은 데이터를, 다른 시드는 다른 데이터를 만든다', () => {
    expect(mulberry32(7)()).toBe(mulberry32(7)())
    expect(generateDemand(DEMO_SEED)).toEqual(generateDemand(DEMO_SEED))
    expect(generateDemand(DEMO_SEED)).toEqual(DEMO_RESPONSES)
    expect(generateDemand(DEMO_SEED + 1)).not.toEqual(DEMO_RESPONSES)
  })

  it('약 400건을 만들고 모든 응답이 형식을 지킨다', () => {
    expect(DEMO_RESPONSES).toHaveLength(DEMO_RECORD_COUNT)
    expect(new Set(DEMO_RESPONSES.map((response) => response.id)).size).toBe(DEMO_RECORD_COUNT)
    for (const response of DEMO_RESPONSES) {
      expect(DONGS).toContain(response.dong)
      expect([1, 2, 3, 4, 5, 6]).toContain(response.child_grade)
      expect(response.available_slots.length).toBeGreaterThanOrEqual(1)
      expect(new Set(response.available_slots).size).toBe(response.available_slots.length)
      for (const slot of response.available_slots) expect(SLOTS).toContain(slot)
      expect([...response.available_slots].sort((a, b) => SLOT_INDEX[a] - SLOT_INDEX[b])).toEqual(response.available_slots)
      expect(new Set(response.interests).size).toBe(response.interests.length)
      for (const interest of response.interests) expect(INTERESTS).toContain(interest)
      if (response.korean_level !== undefined) expect(KOREAN_LEVELS).toContain(response.korean_level)
      expect(LANGUAGES).toContain(response.screen_language)
    }
  })

  it('이름·연락처·주소·출신국 같은 항목은 어디에도 없다', () => {
    const allowed = new Set(['id', 'dong', 'child_grade', 'available_slots', 'interests', 'korean_level', 'screen_language'])
    const forbidden = /name|phone|contact|email|address|nationality|country|birth|origin/i
    for (const response of DEMO_RESPONSES) {
      for (const key of Object.keys(response)) {
        expect(allowed.has(key)).toBe(true)
        expect(forbidden.test(key)).toBe(false)
      }
    }
  })

  it('선택 항목인 한국어 수준과 관심 분야는 비어 있는 응답도 있다', () => {
    expect(DEMO_RESPONSES.some((response) => response.korean_level === undefined)).toBe(true)
    expect(DEMO_RESPONSES.some((response) => !('korean_level' in response))).toBe(true)
    expect(DEMO_RESPONSES.some((response) => response.interests.length === 0)).toBe(true)
  })

  it('평일 저녁과 토요일 오전·오후에 수요가 몰리고 평일 오전은 적다', () => {
    const counts = countSlots(DEMO_RESPONSES)
    const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'] as const
    const average = (part: 'morning' | 'evening') => weekdays.reduce((total, day) => total + counts[`${day}-${part}`], 0) / weekdays.length
    expect(average('evening')).toBeGreaterThan(average('morning') * 3)
    const ranked = [...SLOTS].sort((a, b) => counts[b] - counts[a])
    expect(ranked.slice(0, 4)).toContain('sat-morning')
    expect(ranked.slice(0, 4)).toContain('sat-afternoon')
    for (const day of weekdays) expect(ranked.indexOf(`${day}-morning`)).toBeGreaterThan(14)
  })
})
